begin;

-- V3.14.6 RC2: Incidental shared-session flexibility.
-- Replaces the dated incidental v1 validation only. v2 and batch v2 continue
-- calling it unchanged. No data/table migration and NO changes to master edits.
-- Apply AFTER 202610110001_v3_14_6_weekly_room_editor.sql on staging.

create or replace function public.ejadwal_upsert_schedule_incidental_v1(
  p_incidental_id uuid,
  p_schedule_date date,
  p_class_id uuid,
  p_period smallint,
  p_kind text,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_teacher_ids uuid[],
  p_teacher_names text[],
  p_special_note text default null,
  p_reason text default null,
  p_incidental_type text default null,
  p_allow_teacher_conflict boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := p_incidental_id;
  v_kind text := upper(trim(coalesce(p_kind, 'OVERRIDE')));
  v_subject text := trim(coalesce(p_subject, ''));
  v_day smallint;
  v_before jsonb;
  v_teacher_conflicts jsonb := '[]'::jsonb;
  v_room_conflict boolean := false;
  v_position integer;
  v_teacher_id uuid;
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_schedule_date is null then raise exception 'SCHEDULE_DATE_REQUIRED'; end if;
  if p_class_id is null or not exists(select 1 from public.classes where id = p_class_id and is_active = true) then
    raise exception 'CLASS_NOT_FOUND';
  end if;
  if p_period < 0 or p_period > 6 then raise exception 'INVALID_PERIOD'; end if;
  if v_kind not in ('OVERRIDE', 'ADDITIONAL') then raise exception 'INVALID_INCIDENTAL_KIND'; end if;
  if v_subject = '' then raise exception 'SUBJECT_REQUIRED'; end if;
  if coalesce(array_length(p_teacher_ids, 1), 0) = 0 then raise exception 'TEACHER_REQUIRED'; end if;
  if coalesce(array_length(p_teacher_ids, 1), 0) <> coalesce(array_length(p_teacher_names, 1), 0) then
    raise exception 'TEACHER_PAYLOAD_MISMATCH';
  end if;
  if coalesce(array_length(p_teacher_ids, 1), 0) > 6 then raise exception 'TOO_MANY_TEACHERS'; end if;

  v_day := extract(isodow from p_schedule_date)::smallint;

  -- Serialize dated writes together with weekly room relocations at this slot.
  perform pg_advisory_xact_lock(hashtext(p_schedule_date::text || ':' || p_period::text));

  if v_kind = 'OVERRIDE' and not exists (
    select 1 from public.schedule_master sm
    where sm.class_id = p_class_id
      and sm.day_of_week = v_day
      and sm.period = p_period
      and sm.is_active = true
      and sm.deleted_at is null
  ) then
    raise exception 'MASTER_SLOT_NOT_FOUND_USE_ADDITIONAL';
  end if;

  if v_kind = 'ADDITIONAL' and exists (
    select 1 from public.schedule_master sm
    where sm.class_id = p_class_id
      and sm.day_of_week = v_day
      and sm.period = p_period
      and sm.is_active = true
      and sm.deleted_at is null
  ) then
    raise exception 'MASTER_SLOT_EXISTS_USE_OVERRIDE';
  end if;

  if exists (
    select 1 from public.schedule_incidentals si
    where si.schedule_date = p_schedule_date
      and si.class_id = p_class_id
      and si.period = p_period
      and si.deleted_at is null
      and (v_id is null or si.id <> v_id)
  ) then
    raise exception 'INCIDENTAL_SLOT_ALREADY_EXISTS';
  end if;

  if p_room_id is not null and trim(p_room_id) <> '' and not exists (
    select 1 from public.rooms r where r.id = p_room_id and r.status = 'ACTIVE'
  ) then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  -- Check actual occupancy for this DATE, rather than blindly reading weekly
  -- master rows. An existing dated override replaces its master's room/teachers.
  -- An intentional cross-class session shares one venue and one teacher team:
  -- same date, JP, subject, room and COMPLETE teacher set, with the incoming
  -- row explicitly marked as combined. A different session still conflicts.
  with effective_slots as (
    select sm.class_id, sm.subject as master_subject,
           coalesce(si.override_subject, sm.subject) as subject,
           coalesce(si.override_room_id, sm.room_id) as room_id,
           case when si.id is not null and exists (
             select 1 from public.schedule_incidental_teacher_overrides ito
              where ito.incidental_id = si.id
           ) then array(
             select distinct ito.teacher_id
             from public.schedule_incidental_teacher_overrides ito
             where ito.incidental_id = si.id and ito.action = 'SET'
               and ito.teacher_id is not null
             order by ito.teacher_id
           ) else array(
             select distinct smt.teacher_id
             from public.schedule_master_teachers smt
             where smt.schedule_id = sm.id and smt.teacher_id is not null
             order by smt.teacher_id
           ) end as teacher_ids,
           'MASTER_OR_OVERRIDE'::text as source
    from public.schedule_master sm
    left join public.schedule_incidentals si
      on si.class_id = sm.class_id and si.schedule_date = p_schedule_date
     and si.period = p_period and si.deleted_at is null and si.kind = 'OVERRIDE'
    where sm.day_of_week = v_day and sm.period = p_period
      and sm.is_active = true and sm.deleted_at is null
      and sm.class_id <> p_class_id
      and not exists (
        select 1 from public.academic_events ae
        where ae.status = 'ACTIVE'
          and p_schedule_date between ae.date_start and ae.date_end
          and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = sm.class_id))
          and (ae.period_start is null or p_period between ae.period_start and ae.period_end)
      )
    union all
    select si.class_id, null::text, si.override_subject,
           si.override_room_id,
           array(
             select distinct ito.teacher_id
             from public.schedule_incidental_teacher_overrides ito
             where ito.incidental_id = si.id and ito.action = 'SET'
               and ito.teacher_id is not null
             order by ito.teacher_id
           ),
           'ADDITIONAL'::text
    from public.schedule_incidentals si
    where si.schedule_date = p_schedule_date and si.period = p_period
      and si.deleted_at is null and si.kind = 'ADDITIONAL'
      and si.class_id <> p_class_id
  ), assessed_slots as (
    select e.*, c.display_name as class_name,
           (
             coalesce(p_is_combined, false)
             and nullif(trim(coalesce(p_room_id, '')), '') is not null
             and e.room_id = p_room_id
             and lower(trim(coalesce(e.subject, ''))) = lower(v_subject)
             and cardinality(e.teacher_ids) > 0
             and e.teacher_ids @> p_teacher_ids
             and p_teacher_ids @> e.teacher_ids
           ) as shared_session
    from effective_slots e
    join public.classes c on c.id = e.class_id
  )
  select coalesce(bool_or(
      nullif(trim(coalesce(p_room_id, '')), '') is not null
      and a.room_id = p_room_id and not a.shared_session
    ), false),
    coalesce(jsonb_agg(distinct jsonb_build_object(
      'class_name', a.class_name,
      'subject', a.subject,
      'source', a.source
    )) filter (where a.teacher_ids && p_teacher_ids and not a.shared_session), '[]'::jsonb)
  into v_room_conflict, v_teacher_conflicts
  from assessed_slots a;

  -- Even with a teacher-conflict confirmation, a real room double-booking
  -- stays blocked. The shared-session exemption is evidence-based, not a
  -- global switch to disable validations.
  if v_room_conflict then
    raise exception 'ROOM_SLOT_CONFLICT';
  end if;

  if jsonb_array_length(v_teacher_conflicts) > 0 and not coalesce(p_allow_teacher_conflict, false) then
    raise exception 'TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED';
  end if;

  if v_id is not null then
    select jsonb_build_object(
      'row', to_jsonb(si),
      'teachers', coalesce((select jsonb_agg(to_jsonb(ito) order by ito.position) from public.schedule_incidental_teacher_overrides ito where ito.incidental_id = si.id), '[]'::jsonb)
    ) into v_before
    from public.schedule_incidentals si
    where si.id = v_id and si.deleted_at is null;
    if v_before is null then raise exception 'INCIDENTAL_NOT_FOUND'; end if;

    update public.schedule_incidentals
       set schedule_date = p_schedule_date,
           class_id = p_class_id,
           period = p_period,
           kind = v_kind,
           override_subject = v_subject,
           override_room_id = nullif(trim(coalesce(p_room_id, '')), ''),
           override_is_combined = coalesce(p_is_combined, false),
           override_class_mode = case when coalesce(p_is_combined, false) then 'COMBINED' else 'NORMAL' end,
           override_special_note = nullif(trim(coalesce(p_special_note, '')), ''),
           reason = nullif(trim(coalesce(p_reason, '')), ''),
           incidental_type = nullif(trim(coalesce(p_incidental_type, '')), ''),
           updated_at = now()
     where id = v_id;
  else
    insert into public.schedule_incidentals(
      schedule_date, class_id, period, kind,
      override_subject, override_room_id, override_is_combined, override_class_mode,
      override_special_note, reason, incidental_type
    ) values (
      p_schedule_date, p_class_id, p_period, v_kind,
      v_subject, nullif(trim(coalesce(p_room_id, '')), ''), coalesce(p_is_combined, false),
      case when coalesce(p_is_combined, false) then 'COMBINED' else 'NORMAL' end,
      nullif(trim(coalesce(p_special_note, '')), ''),
      nullif(trim(coalesce(p_reason, '')), ''),
      nullif(trim(coalesce(p_incidental_type, '')), '')
    ) returning id into v_id;
  end if;

  delete from public.schedule_incidental_teacher_overrides where incidental_id = v_id;
  for v_position in 1..array_length(p_teacher_ids, 1)
  loop
    v_teacher_id := p_teacher_ids[v_position];
    if v_teacher_id is null or not exists(select 1 from public.teachers where id = v_teacher_id and is_active = true) then
      raise exception 'TEACHER_NOT_FOUND:%', v_position;
    end if;
    insert into public.schedule_incidental_teacher_overrides(
      incidental_id, position, action, teacher_id, teacher_name_snapshot
    ) values (
      v_id, v_position, 'SET', v_teacher_id, coalesce(p_teacher_names[v_position], '')
    );
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor,
    case when p_incidental_id is null then 'SCHEDULE_INCIDENTAL_INSERT' else 'SCHEDULE_INCIDENTAL_UPDATE' end,
    'SCHEDULE_INCIDENTAL',
    v_id::text,
    v_before,
    jsonb_build_object(
      'schedule_date', p_schedule_date,
      'class_id', p_class_id,
      'period', p_period,
      'kind', v_kind,
      'subject', v_subject,
      'room_id', p_room_id,
      'teacher_ids', p_teacher_ids,
      'teacher_names', p_teacher_names,
      'teacher_conflict_override', jsonb_array_length(v_teacher_conflicts) > 0,
      'teacher_conflicts', v_teacher_conflicts,
      'reason', p_reason,
      'incidental_type', p_incidental_type
    )
  );

  return v_id;
end;
$$;

revoke all on function public.ejadwal_upsert_schedule_incidental_v1(uuid,date,uuid,smallint,text,text,text,boolean,uuid[],text[],text,text,text,boolean) from public;
grant execute on function public.ejadwal_upsert_schedule_incidental_v1(uuid,date,uuid,smallint,text,text,text,boolean,uuid[],text[],text,text,text,boolean) to authenticated;

commit;
