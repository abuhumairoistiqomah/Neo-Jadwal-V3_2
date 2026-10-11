begin;

-- V3.13.4 Schedule Mutation Core
-- Permanent edits keep using ejadwal_update_schedule_master_v2.
-- Date-specific edits are centralized here so Quick Edit and the dedicated
-- Jadwal Insidental editor write through the same validated path.

create index if not exists schedule_incidentals_active_slot_idx
  on public.schedule_incidentals(schedule_date, class_id, period)
  where deleted_at is null;

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

  -- Room conflicts remain hard. The same class is excluded because OVERRIDE
  -- intentionally replaces that class's normal room on this date.
  if p_room_id is not null and trim(p_room_id) <> '' and (
    exists (
      select 1
      from public.schedule_master sm
      where sm.day_of_week = v_day
        and sm.period = p_period
        and sm.room_id = p_room_id
        and sm.class_id <> p_class_id
        and sm.is_active = true
        and sm.deleted_at is null
    )
    or exists (
      select 1
      from public.schedule_incidentals si
      where si.schedule_date = p_schedule_date
        and si.period = p_period
        and si.override_room_id = p_room_id
        and si.class_id <> p_class_id
        and si.deleted_at is null
        and (v_id is null or si.id <> v_id)
    )
  ) then
    raise exception 'ROOM_SLOT_CONFLICT';
  end if;

  -- Teacher occupancy is warning/confirm only, matching Smart Quick Editor.
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'teacher_id', x.teacher_id,
    'class_name', x.class_name,
    'subject', x.subject,
    'source', x.source
  )), '[]'::jsonb)
  into v_teacher_conflicts
  from (
    select smt.teacher_id, c.display_name as class_name, sm.subject, 'MASTER'::text as source
    from unnest(coalesce(p_teacher_ids, '{}'::uuid[])) t(teacher_id)
    join public.schedule_master_teachers smt on smt.teacher_id = t.teacher_id
    join public.schedule_master sm on sm.id = smt.schedule_id
    join public.classes c on c.id = sm.class_id
    where sm.day_of_week = v_day
      and sm.period = p_period
      and sm.class_id <> p_class_id
      and sm.is_active = true
      and sm.deleted_at is null

    union all

    select ito.teacher_id, c.display_name, coalesce(si.override_subject, ''), 'INCIDENTAL'::text
    from unnest(coalesce(p_teacher_ids, '{}'::uuid[])) t(teacher_id)
    join public.schedule_incidental_teacher_overrides ito
      on ito.teacher_id = t.teacher_id and ito.action = 'SET'
    join public.schedule_incidentals si on si.id = ito.incidental_id
    join public.classes c on c.id = si.class_id
    where si.schedule_date = p_schedule_date
      and si.period = p_period
      and si.class_id <> p_class_id
      and si.deleted_at is null
      and (v_id is null or si.id <> v_id)
  ) x;

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


create or replace function public.ejadwal_upsert_schedule_incidental_session_v1(
  p_rows jsonb,
  p_schedule_date date,
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
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_result uuid[] := '{}'::uuid[];
  v_id uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INCIDENTAL_SESSION_ROWS_REQUIRED';
  end if;

  for v_row in
    select * from jsonb_to_recordset(p_rows) as x(incidental_id uuid, class_id uuid, period smallint)
  loop
    v_id := public.ejadwal_upsert_schedule_incidental_v1(
      v_row.incidental_id, p_schedule_date, v_row.class_id, v_row.period, p_kind,
      p_subject, p_room_id, p_is_combined, p_teacher_ids, p_teacher_names,
      p_special_note, p_reason, p_incidental_type, p_allow_teacher_conflict
    );
    v_result := array_append(v_result, v_id);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.ejadwal_upsert_schedule_incidental_session_v1(jsonb,date,text,text,text,boolean,uuid[],text[],text,text,text,boolean) from public;
grant execute on function public.ejadwal_upsert_schedule_incidental_session_v1(jsonb,date,text,text,text,boolean,uuid[],text[],text,text,text,boolean) to authenticated;

create or replace function public.ejadwal_delete_schedule_incidental_v1(
  p_incidental_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
begin
  if v_actor is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
  select to_jsonb(si) into v_before from public.schedule_incidentals si where si.id = p_incidental_id and si.deleted_at is null;
  if v_before is null then raise exception 'INCIDENTAL_NOT_FOUND'; end if;

  update public.schedule_incidentals
     set deleted_at = now(), deleted_by = v_actor, updated_at = now()
   where id = p_incidental_id and deleted_at is null;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor, 'SCHEDULE_INCIDENTAL_DELETE', 'SCHEDULE_INCIDENTAL', p_incidental_id::text,
    v_before, jsonb_build_object('deleted_at', now(), 'reason', nullif(trim(coalesce(p_reason, '')), ''))
  );
end;
$$;

revoke all on function public.ejadwal_delete_schedule_incidental_v1(uuid,text) from public;
grant execute on function public.ejadwal_delete_schedule_incidental_v1(uuid,text) to authenticated;

commit;
