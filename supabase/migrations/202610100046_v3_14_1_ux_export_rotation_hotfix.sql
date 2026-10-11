-- E-Jadwal V3.14.1 — UX/export/rotation hotfix
-- Repairs stale Waiting List RPC compatibility and adds class_mode-aware Quick Edit RPCs.

begin;

-- ---------------------------------------------------------------------------
-- 1) Compatibility repair for databases that missed V3.13.2 Waiting expiry.
-- ---------------------------------------------------------------------------
alter table public.coverage_slots
  drop constraint if exists coverage_slots_status_check;

alter table public.coverage_slots
  add constraint coverage_slots_status_check
  check (status in ('WAITING', 'ASSIGNED', 'NO_SUBSTITUTE', 'CANCELLED', 'COMPLETED', 'EXPIRED'));

create or replace function public.ejadwal_expire_stale_waiting_coverage(
  p_school_today date
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_ids text[];
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_school_today is null then
    raise exception 'SCHOOL_TODAY_REQUIRED';
  end if;

  with expired as (
    update public.coverage_slots
       set status = 'EXPIRED', updated_at = now()
     where source = 'LEAVE_WORKFLOW'
       and status = 'WAITING'
       and deleted_at is null
       and schedule_date < p_school_today
     returning id
  )
  select count(*), coalesce(array_agg(id::text), '{}'::text[])
    into v_count, v_ids
    from expired;

  if v_count > 0 then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (
      v_actor,
      'COVERAGE_AUTO_EXPIRE',
      'COVERAGE_SLOT_BATCH',
      array_to_string(v_ids, ','),
      jsonb_build_object('previous_status', 'WAITING'),
      jsonb_build_object('status', 'EXPIRED', 'school_today', p_school_today, 'count', v_count)
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.ejadwal_expire_stale_waiting_coverage(date) from public;
grant execute on function public.ejadwal_expire_stale_waiting_coverage(date) to authenticated;

drop index if exists public.coverage_slots_active_identity_uidx;
create unique index coverage_slots_active_identity_uidx
  on public.coverage_slots (schedule_date, class_id, period, absent_teacher_id)
  where deleted_at is null
    and absent_teacher_id is not null
    and status not in ('CANCELLED', 'EXPIRED')
    and source <> 'LEGACY_IMPORT';

-- ---------------------------------------------------------------------------
-- 2) Class-mode-aware permanent Quick Edit.
--    Existing v2 remains for backward compatibility. v3 makes ALTERNATING a
--    first-class mode instead of encoding it only in a note.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_update_schedule_master_v3(
  p_schedule_ids uuid[],
  p_class_id uuid,
  p_day_of_week smallint,
  p_period smallint,
  p_start_time time,
  p_end_time time,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_class_mode text,
  p_teacher_ids uuid[],
  p_teacher_names text[],
  p_special_note text default null,
  p_allow_teacher_conflict boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_mode text := upper(trim(coalesce(p_class_mode, case when p_is_combined then 'COMBINED' else 'NORMAL' end)));
begin
  if v_mode not in ('NORMAL', 'COMBINED', 'ALTERNATING') then
    raise exception 'INVALID_CLASS_MODE';
  end if;

  perform public.ejadwal_update_schedule_master_v2(
    p_schedule_ids,
    p_class_id,
    p_day_of_week,
    p_period,
    p_start_time,
    p_end_time,
    p_subject,
    p_room_id,
    (v_mode = 'COMBINED'),
    p_teacher_ids,
    p_teacher_names,
    p_special_note,
    p_allow_teacher_conflict
  );

  update public.schedule_master
     set class_mode = v_mode,
         is_combined = (v_mode = 'COMBINED'),
         updated_at = now()
   where id = any(p_schedule_ids)
     and is_active = true
     and deleted_at is null;

  -- Same relevant action makes V3.13.6 versioning recapture the final state
  -- inside the same transaction (txid uniqueness keeps it one version).
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (
    v_actor,
    'SCHEDULE_MASTER_QUICK_EDIT',
    'SCHEDULE_MASTER_SESSION',
    array_to_string(p_schedule_ids, ','),
    jsonb_build_object(
      'class_mode', v_mode,
      'is_combined', (v_mode = 'COMBINED'),
      'rotation_note', nullif(trim(coalesce(p_special_note, '')), ''),
      'v3_14_1_class_mode_finalize', true
    )
  );
end;
$$;

revoke all on function public.ejadwal_update_schedule_master_v3(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean) from public;
grant execute on function public.ejadwal_update_schedule_master_v3(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Class-mode-aware incidental Quick Edit.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_upsert_schedule_incidental_v2(
  p_incidental_id uuid,
  p_schedule_date date,
  p_class_id uuid,
  p_period smallint,
  p_kind text,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_class_mode text,
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
  v_mode text := upper(trim(coalesce(p_class_mode, case when p_is_combined then 'COMBINED' else 'NORMAL' end)));
  v_id uuid;
  v_action text;
begin
  if v_mode not in ('NORMAL', 'COMBINED', 'ALTERNATING') then
    raise exception 'INVALID_CLASS_MODE';
  end if;

  v_id := public.ejadwal_upsert_schedule_incidental_v1(
    p_incidental_id,
    p_schedule_date,
    p_class_id,
    p_period,
    p_kind,
    p_subject,
    p_room_id,
    (v_mode = 'COMBINED'),
    p_teacher_ids,
    p_teacher_names,
    p_special_note,
    p_reason,
    p_incidental_type,
    p_allow_teacher_conflict
  );

  update public.schedule_incidentals
     set override_class_mode = v_mode,
         override_is_combined = (v_mode = 'COMBINED'),
         updated_at = now()
   where id = v_id and deleted_at is null;

  v_action := case when p_incidental_id is null then 'SCHEDULE_INCIDENTAL_INSERT' else 'SCHEDULE_INCIDENTAL_UPDATE' end;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (
    v_actor,
    v_action,
    'SCHEDULE_INCIDENTAL',
    v_id::text,
    jsonb_build_object(
      'class_mode', v_mode,
      'is_combined', (v_mode = 'COMBINED'),
      'rotation_note', nullif(trim(coalesce(p_special_note, '')), ''),
      'v3_14_1_class_mode_finalize', true
    )
  );

  return v_id;
end;
$$;

revoke all on function public.ejadwal_upsert_schedule_incidental_v2(uuid,date,uuid,smallint,text,text,text,boolean,text,uuid[],text[],text,text,text,boolean) from public;
grant execute on function public.ejadwal_upsert_schedule_incidental_v2(uuid,date,uuid,smallint,text,text,text,boolean,text,uuid[],text[],text,text,text,boolean) to authenticated;

create or replace function public.ejadwal_upsert_schedule_incidental_session_v2(
  p_rows jsonb,
  p_schedule_date date,
  p_kind text,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_class_mode text,
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
    v_id := public.ejadwal_upsert_schedule_incidental_v2(
      v_row.incidental_id,
      p_schedule_date,
      v_row.class_id,
      v_row.period,
      p_kind,
      p_subject,
      p_room_id,
      p_is_combined,
      p_class_mode,
      p_teacher_ids,
      p_teacher_names,
      p_special_note,
      p_reason,
      p_incidental_type,
      p_allow_teacher_conflict
    );
    v_result := array_append(v_result, v_id);
  end loop;

  return v_result;
end;
$$;

revoke all on function public.ejadwal_upsert_schedule_incidental_session_v2(jsonb,date,text,text,text,boolean,text,uuid[],text[],text,text,text,boolean) from public;
grant execute on function public.ejadwal_upsert_schedule_incidental_session_v2(jsonb,date,text,text,text,boolean,text,uuid[],text[],text,text,text,boolean) to authenticated;

commit;
