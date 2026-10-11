begin;

-- V3.14.6: One-date room relocation, atomic for a combined class bundle.
-- Keeps the original master schedule and any existing incidental subject/teacher
-- overrides intact; only the room override changes.
-- Required to avoid the older generic incidentals RPC checking static master rooms
-- that are no longer occupied on this date.
create or replace function public.ejadwal_relocate_room_date_v1(
  p_schedule_date date,
  p_period smallint,
  p_class_ids uuid[],
  p_room_id text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_day smallint;
  v_class uuid;
  v_incidental public.schedule_incidentals%rowtype;
  v_id uuid;
  v_is_new boolean;
  v_count integer := 0;
  v_classes uuid[];
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_schedule_date is null or p_period is null or p_period < 0 or p_period > 6 then
    raise exception 'INVALID_ROOM_EDIT_DATE_OR_PERIOD';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'RELOCATION_REASON_REQUIRED';
  end if;
  select coalesce(array_agg(distinct source.class_id), '{}'::uuid[])
    into v_classes from unnest(coalesce(p_class_ids, '{}'::uuid[])) as source(class_id)
    where source.class_id is not null;
  if cardinality(v_classes) < 1 then raise exception 'CLASS_REQUIRED'; end if;
  if not exists(select 1 from public.rooms where id = p_room_id and status = 'ACTIVE') then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  v_day := extract(isodow from p_schedule_date)::smallint;

  -- Serialize this RPC against other calls to itself at the same date + period.
  perform pg_advisory_xact_lock(hashtext(p_schedule_date::text || ':' || p_period::text));

  -- Every selected class must have a schedule to move. New activities are added
  -- separately through the existing incidental ADDITIONAL editor.
  foreach v_class in array v_classes loop
    if not exists (
      select 1 from public.schedule_master sm
       where sm.class_id = v_class and sm.day_of_week = v_day
         and sm.period = p_period and sm.is_active and sm.deleted_at is null
    ) and not exists (
      select 1 from public.schedule_incidentals si
       where si.class_id = v_class and si.schedule_date = p_schedule_date
         and si.period = p_period and si.deleted_at is null
    ) then
      raise exception 'ROOM_EDIT_CLASS_HAS_NO_SESSION';
    end if;
  end loop;

  -- Check *effective dated* room usage: old master rooms relinquished by dated
  -- incidentals are no longer occupied. Never overwrite another class' slot.
  if exists (
    select 1
      from public.schedule_master sm
      left join public.schedule_incidentals si
        on si.class_id = sm.class_id and si.schedule_date = p_schedule_date
       and si.period = p_period and si.deleted_at is null
     where sm.day_of_week = v_day and sm.period = p_period
       and sm.is_active and sm.deleted_at is null
       and not (sm.class_id = any(v_classes))
       and coalesce(si.override_room_id, sm.room_id) = p_room_id
       and not exists (
         select 1 from public.academic_events ae
         where ae.status = 'ACTIVE'
           and p_schedule_date between ae.date_start and ae.date_end
           and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = sm.class_id))
           and (ae.period_start is null or p_period between ae.period_start and ae.period_end)
       )
  ) or exists (
    select 1 from public.schedule_incidentals si
      where si.schedule_date = p_schedule_date and si.period = p_period
        and si.deleted_at is null and si.kind = 'ADDITIONAL'
        and si.override_room_id = p_room_id and not (si.class_id = any(v_classes))
  ) then
    raise exception 'ROOM_TARGET_OCCUPIED';
  end if;

  foreach v_class in array v_classes loop
    select * into v_incidental from public.schedule_incidentals si
     where si.class_id = v_class and si.schedule_date = p_schedule_date
       and si.period = p_period and si.deleted_at is null for update;
    v_is_new := not found;
    if not v_is_new then
      v_id := v_incidental.id;
      update public.schedule_incidentals
         set override_room_id = p_room_id,
             reason = concat_ws(' | ', nullif(v_incidental.reason, ''), trim(p_reason)),
             updated_at = now()
       where id = v_id;
    else
      insert into public.schedule_incidentals
        (schedule_date, class_id, period, kind, override_room_id, reason, incidental_type)
      values
        (p_schedule_date, v_class, p_period, 'OVERRIDE', p_room_id,
         trim(p_reason), 'Relokasi Ruangan Mingguan') returning id into v_id;
    end if;

    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (
      v_actor,
      case when v_is_new then 'SCHEDULE_INCIDENTAL_INSERT' else 'SCHEDULE_INCIDENTAL_UPDATE' end,
      'SCHEDULE_INCIDENTAL', v_id::text,
      case when v_is_new then null else to_jsonb(v_incidental) end,
      jsonb_build_object('schedule_date', p_schedule_date, 'period', p_period,
        'class_id', v_class, 'room_id', p_room_id, 'room_edit_scope', 'SINGLE_DATE',
        'reason', p_reason, 'affected_classes', v_classes)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- New dated activity + room reservation, atomic in one RPC. The generic v2
-- writer checks teacher and class validity; passing NULL as room avoids its
-- static weekly room check. The relocation RPC then validates effective date
-- room occupancy and sets the room before committing the transaction.
create or replace function public.ejadwal_add_room_session_date_v1(
  p_schedule_date date,
  p_period smallint,
  p_class_id uuid,
  p_subject text,
  p_room_id text,
  p_teacher_ids uuid[],
  p_teacher_names text[],
  p_reason text,
  p_allow_teacher_conflict boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  v_id := public.ejadwal_upsert_schedule_incidental_v2(
    null::uuid, p_schedule_date, p_class_id, p_period,
    'ADDITIONAL'::text, p_subject, null::text,
    false, 'NORMAL', p_teacher_ids, p_teacher_names,
    null::text, p_reason, 'Pemesanan Ruangan Mingguan',
    p_allow_teacher_conflict
  );
  perform public.ejadwal_relocate_room_date_v1(
    p_schedule_date, p_period, array[p_class_id], p_room_id, p_reason
  );
  return v_id;
end;
$$;

revoke all on function public.ejadwal_add_room_session_date_v1(date,smallint,uuid,text,text,uuid[],text[],text,boolean) from public;
grant execute on function public.ejadwal_add_room_session_date_v1(date,smallint,uuid,text,text,uuid[],text[],text,boolean) to authenticated;

revoke all on function public.ejadwal_relocate_room_date_v1(date,smallint,uuid[],text,text) from public;
grant execute on function public.ejadwal_relocate_room_date_v1(date,smallint,uuid[],text,text) to authenticated;
commit;
