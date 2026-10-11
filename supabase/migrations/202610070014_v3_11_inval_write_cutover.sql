-- E-Jadwal V3.11 — Inval Write Cutover
-- Atomic browser-safe RPCs for operational badal writes.
--
-- Guarantees:
-- 1) Only ADMIN/WAKASEK may mutate operational coverage.
-- 2) One RPC call is one PostgreSQL transaction.
-- 3) Audit rows are written by SECURITY DEFINER functions, not directly by browser clients.
-- 4) Matching hard substitute constraints reject the write server-side.
-- 5) Matching soft constraints require explicit acknowledged constraint IDs and produce evidence rows.
-- 6) LEGACY_IMPORT history remains immutable through these operational RPCs.

begin;

-- ---------------------------------------------------------------------------
-- Internal validator for soft/hard substitute constraints.
-- Returns the exact matching SOFT constraint ids after validating acknowledgements.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_validate_substitute_constraints(
  p_teacher_id uuid,
  p_date date,
  p_period smallint,
  p_acknowledged_constraint_ids uuid[] default '{}'::uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_soft_ids uuid[] := '{}'::uuid[];
  v_hard_reasons text;
  v_missing_ids uuid[] := '{}'::uuid[];
  v_extra_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  if p_teacher_id is null then
    raise exception 'SUBSTITUTE_TEACHER_REQUIRED';
  end if;

  if p_period is null or p_period < 0 or p_period > 6 then
    raise exception 'INVALID_PERIOD';
  end if;

  select string_agg(sc.reason, '; ' order by sc.created_at)
  into v_hard_reasons
  from public.substitute_constraints sc
  where sc.teacher_id = p_teacher_id
    and sc.is_active = true
    and sc.deleted_at is null
    and sc.override_allowed = false
    and p_period between sc.period_start and sc.period_end
    and (
      (sc.constraint_type = 'DATE' and sc.specific_date = p_date)
      or
      (
        sc.constraint_type = 'WEEKLY'
        and (sc.day_of_week is null or sc.day_of_week = extract(isodow from p_date)::smallint)
        and (sc.valid_from is null or p_date >= sc.valid_from)
        and (sc.valid_until is null or p_date <= sc.valid_until)
      )
    );

  if v_hard_reasons is not null then
    raise exception 'HARD_SUBSTITUTE_CONSTRAINT: %', v_hard_reasons;
  end if;

  select coalesce(array_agg(sc.id order by sc.id), '{}'::uuid[])
  into v_soft_ids
  from public.substitute_constraints sc
  where sc.teacher_id = p_teacher_id
    and sc.is_active = true
    and sc.deleted_at is null
    and sc.override_allowed = true
    and p_period between sc.period_start and sc.period_end
    and (
      (sc.constraint_type = 'DATE' and sc.specific_date = p_date)
      or
      (
        sc.constraint_type = 'WEEKLY'
        and (sc.day_of_week is null or sc.day_of_week = extract(isodow from p_date)::smallint)
        and (sc.valid_from is null or p_date >= sc.valid_from)
        and (sc.valid_until is null or p_date <= sc.valid_until)
      )
    );

  select coalesce(array_agg(x), '{}'::uuid[])
  into v_missing_ids
  from unnest(v_soft_ids) x
  where not (x = any(coalesce(p_acknowledged_constraint_ids, '{}'::uuid[])));

  if cardinality(v_missing_ids) > 0 then
    raise exception 'SOFT_SUBSTITUTE_CONSTRAINT_ACK_REQUIRED: %', array_to_string(v_missing_ids, ',');
  end if;

  select coalesce(array_agg(x), '{}'::uuid[])
  into v_extra_ids
  from unnest(coalesce(p_acknowledged_constraint_ids, '{}'::uuid[])) x
  where not (x = any(v_soft_ids));

  if cardinality(v_extra_ids) > 0 then
    raise exception 'INVALID_CONSTRAINT_ACK: %', array_to_string(v_extra_ids, ',');
  end if;

  return v_soft_ids;
end;
$$;

revoke all on function public.ejadwal_validate_substitute_constraints(uuid, date, smallint, uuid[]) from public;
revoke all on function public.ejadwal_validate_substitute_constraints(uuid, date, smallint, uuid[]) from anon;

-- ---------------------------------------------------------------------------
-- Create/upsert an entire Inval bundle atomically.
-- p_rows is an array of objects:
-- {
--   schedule_date, class_code, period, subject,
--   absent_teacher_id, substitute_teacher_id,
--   reason, task_text, constraint_ids[]
-- }
-- Optional room payload:
-- {schedule_date,class_code,period,subject,room_id,reason,incidental_type}
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_save_inval_bundle(
  p_rows jsonb,
  p_room_incidental jsonb default null,
  p_override_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := gen_random_uuid();
  v_row jsonb;
  v_date date;
  v_class_code text;
  v_class_id uuid;
  v_period smallint;
  v_subject text;
  v_absent_teacher_id uuid;
  v_absent_teacher_name text;
  v_substitute_teacher_id uuid;
  v_substitute_teacher_name text;
  v_reason text;
  v_task_text text;
  v_ack_ids uuid[];
  v_soft_ids uuid[];
  v_slot_id uuid;
  v_was_existing boolean := false;
  v_schedule_master_id uuid;
  v_schedule_incidental_id uuid;
  v_before public.coverage_slots%rowtype;
  v_after public.coverage_slots%rowtype;
  v_old_task_text text;
  v_task_id uuid;
  v_constraint_id uuid;
  v_slot_ids jsonb := '[]'::jsonb;
  v_room_id text;
  v_room_class_code text;
  v_room_class_id uuid;
  v_room_date date;
  v_room_period smallint;
  v_room_reason text;
  v_room_type text;
  v_room_incidental_id uuid;
  v_room_before public.schedule_incidentals%rowtype;
  v_room_after public.schedule_incidentals%rowtype;
  v_room_was_existing boolean := false;
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVAL_ROWS_REQUIRED';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_date := nullif(trim(v_row->>'schedule_date'), '')::date;
    v_class_code := trim(coalesce(v_row->>'class_code', ''));
    v_period := nullif(trim(v_row->>'period'), '')::smallint;
    v_subject := trim(coalesce(v_row->>'subject', ''));
    v_absent_teacher_id := nullif(trim(v_row->>'absent_teacher_id'), '')::uuid;
    v_substitute_teacher_id := nullif(trim(v_row->>'substitute_teacher_id'), '')::uuid;
    v_reason := trim(coalesce(v_row->>'reason', ''));
    v_task_text := trim(coalesce(v_row->>'task_text', ''));
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_ack_ids
    from jsonb_array_elements_text(coalesce(v_row->'constraint_ids', '[]'::jsonb));

    if v_date is null or v_class_code = '' or v_period is null then
      raise exception 'INVAL_ROW_IDENTITY_REQUIRED';
    end if;
    if v_period < 0 or v_period > 6 then
      raise exception 'INVALID_PERIOD: %', v_period;
    end if;

    select c.id into v_class_id
    from public.classes c
    where c.is_active = true
      and (lower(c.code) = lower(v_class_code) or lower(c.display_name) = lower(v_class_code))
    order by case when lower(c.code) = lower(v_class_code) then 0 else 1 end, c.id
    limit 1;
    if v_class_id is null then
      raise exception 'CLASS_NOT_FOUND: %', v_class_code;
    end if;

    select t.full_name into v_absent_teacher_name
    from public.teachers t
    where t.id = v_absent_teacher_id;
    if v_absent_teacher_name is null then
      raise exception 'ABSENT_TEACHER_NOT_FOUND: %', v_absent_teacher_id;
    end if;

    select t.full_name into v_substitute_teacher_name
    from public.teachers t
    where t.id = v_substitute_teacher_id and t.is_active = true;
    if v_substitute_teacher_name is null then
      raise exception 'SUBSTITUTE_TEACHER_NOT_FOUND_OR_INACTIVE: %', v_substitute_teacher_id;
    end if;

    v_soft_ids := public.ejadwal_validate_substitute_constraints(
      v_substitute_teacher_id,
      v_date,
      v_period,
      coalesce(v_ack_ids, '{}'::uuid[])
    );

    select sm.id into v_schedule_master_id
    from public.schedule_master sm
    where sm.class_id = v_class_id
      and sm.day_of_week = extract(isodow from v_date)::smallint
      and sm.period = v_period
      and sm.is_active = true
      and sm.deleted_at is null
    order by sm.id
    limit 1;

    select si.id into v_schedule_incidental_id
    from public.schedule_incidentals si
    where si.schedule_date = v_date
      and si.class_id = v_class_id
      and si.period = v_period
      and si.deleted_at is null
    order by si.updated_at desc, si.id
    limit 1;

    v_slot_id := null;
    select cs.id
      into v_slot_id
    from public.coverage_slots cs
    where cs.schedule_date = v_date
      and cs.class_id = v_class_id
      and cs.period = v_period
      and cs.absent_teacher_id = v_absent_teacher_id
      and cs.deleted_at is null
      and cs.status <> 'CANCELLED'
      and cs.source <> 'LEGACY_IMPORT'
    order by cs.updated_at desc, cs.id
    limit 1
    for update;

    v_was_existing := v_slot_id is not null;

    if v_was_existing then
      select * into v_before from public.coverage_slots where id = v_slot_id;
      select lt.description into v_old_task_text
      from public.learning_tasks lt
      where lt.coverage_slot_id = v_slot_id and lt.deleted_at is null
      order by lt.created_at
      limit 1;

      update public.coverage_slots
      set subject_snapshot = v_subject,
          absent_teacher_name_snapshot = v_absent_teacher_name,
          substitute_teacher_id = v_substitute_teacher_id,
          substitute_teacher_name_snapshot = v_substitute_teacher_name,
          reason_snapshot = v_reason,
          status = 'ASSIGNED',
          schedule_master_id = v_schedule_master_id,
          schedule_incidental_id = v_schedule_incidental_id,
          assigned_by = v_actor,
          assigned_at = now()
      where id = v_slot_id
      returning * into v_after;
    else
      insert into public.coverage_slots (
        schedule_date, class_id, class_name_snapshot, period,
        subject_snapshot,
        absent_teacher_id, absent_teacher_name_snapshot,
        substitute_teacher_id, substitute_teacher_name_snapshot,
        reason_snapshot, status, source,
        schedule_master_id, schedule_incidental_id,
        assigned_by, assigned_at
      ) values (
        v_date, v_class_id, v_class_code, v_period,
        v_subject,
        v_absent_teacher_id, v_absent_teacher_name,
        v_substitute_teacher_id, v_substitute_teacher_name,
        v_reason, 'ASSIGNED', 'ADMIN_MANUAL',
        v_schedule_master_id, v_schedule_incidental_id,
        v_actor, now()
      ) returning * into v_after;
      v_slot_id := v_after.id;
      v_old_task_text := null;
    end if;

    select lt.id into v_task_id
    from public.learning_tasks lt
    where lt.coverage_slot_id = v_slot_id and lt.deleted_at is null
    order by lt.created_at
    limit 1;

    if v_task_text <> '' then
      if v_task_id is null then
        insert into public.learning_tasks (coverage_slot_id, description, created_by)
        values (v_slot_id, v_task_text, v_actor)
        returning id into v_task_id;
      else
        update public.learning_tasks
        set description = v_task_text,
            deleted_at = null,
            deleted_by = null
        where id = v_task_id;
      end if;
    else
      update public.learning_tasks
      set deleted_at = now(), deleted_by = v_actor
      where coverage_slot_id = v_slot_id and deleted_at is null;
    end if;

    for v_constraint_id in select unnest(v_soft_ids)
    loop
      insert into public.coverage_constraint_overrides (
        coverage_slot_id, constraint_id, overridden_by, override_note
      ) values (
        v_slot_id, v_constraint_id, v_actor, nullif(trim(coalesce(p_override_note, '')), '')
      )
      on conflict (coverage_slot_id, constraint_id)
      do update set
        overridden_by = excluded.overridden_by,
        override_note = excluded.override_note,
        created_at = now();

      insert into public.audit_logs (
        actor_user_id, action, entity_type, entity_id,
        before_data, after_data, request_id
      ) values (
        v_actor,
        'CONSTRAINT_OVERRIDE_ACK',
        'coverage_constraint_override',
        v_slot_id::text || ':' || v_constraint_id::text,
        null,
        jsonb_build_object(
          'coverage_slot_id', v_slot_id,
          'constraint_id', v_constraint_id,
          'override_note', nullif(trim(coalesce(p_override_note, '')), '')
        ),
        v_request_id
      );
    end loop;

    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id,
      before_data, after_data, request_id
    ) values (
      v_actor,
      case when v_was_existing then 'INVAL_UPDATE' else 'INVAL_CREATE' end,
      'coverage_slot',
      v_slot_id::text,
      case when v_was_existing then
        jsonb_build_object('coverage_slot', to_jsonb(v_before), 'task_text', v_old_task_text)
      else null end,
      jsonb_build_object('coverage_slot', to_jsonb(v_after), 'task_text', nullif(v_task_text, '')),
      v_request_id
    );

    v_slot_ids := v_slot_ids || jsonb_build_array(v_slot_id::text);

    -- Clear row-local scalar state before the next iteration.
    v_was_existing := false;
    v_old_task_text := null;
    v_task_id := null;
  end loop;

  -- Optional room relocation from the same Input Inval submission.
  if p_room_incidental is not null and jsonb_typeof(p_room_incidental) = 'object' then
    v_room_date := nullif(trim(p_room_incidental->>'schedule_date'), '')::date;
    v_room_class_code := trim(coalesce(p_room_incidental->>'class_code', ''));
    v_room_period := nullif(trim(p_room_incidental->>'period'), '')::smallint;
    v_room_id := trim(coalesce(p_room_incidental->>'room_id', ''));
    v_room_reason := trim(coalesce(p_room_incidental->>'reason', ''));
    v_room_type := trim(coalesce(p_room_incidental->>'incidental_type', 'Relokasi Ruangan'));

    if v_room_date is null or v_room_class_code = '' or v_room_period is null or v_room_id = '' then
      raise exception 'ROOM_RELOCATION_IDENTITY_REQUIRED';
    end if;

    select c.id into v_room_class_id
    from public.classes c
    where c.is_active = true
      and (lower(c.code) = lower(v_room_class_code) or lower(c.display_name) = lower(v_room_class_code))
    order by case when lower(c.code) = lower(v_room_class_code) then 0 else 1 end, c.id
    limit 1;
    if v_room_class_id is null then
      raise exception 'ROOM_RELOCATION_CLASS_NOT_FOUND: %', v_room_class_code;
    end if;

    if not exists (select 1 from public.rooms r where r.id = v_room_id and r.status = 'ACTIVE') then
      raise exception 'ROOM_NOT_FOUND_OR_INACTIVE: %', v_room_id;
    end if;

    v_room_incidental_id := null;
    select si.id into v_room_incidental_id
    from public.schedule_incidentals si
    where si.schedule_date = v_room_date
      and si.class_id = v_room_class_id
      and si.period = v_room_period
      and si.deleted_at is null
    order by si.updated_at desc, si.id
    limit 1
    for update;

    v_room_was_existing := v_room_incidental_id is not null;

    if v_room_was_existing then
      select * into v_room_before from public.schedule_incidentals where id = v_room_incidental_id;
      update public.schedule_incidentals
      set override_room_id = v_room_id,
          reason = nullif(v_room_reason, ''),
          incidental_type = nullif(v_room_type, '')
      where id = v_room_incidental_id
      returning * into v_room_after;
    else
      insert into public.schedule_incidentals (
        schedule_date, class_id, period, kind,
        override_room_id, reason, incidental_type
      ) values (
        v_room_date, v_room_class_id, v_room_period, 'OVERRIDE',
        v_room_id, nullif(v_room_reason, ''), nullif(v_room_type, '')
      ) returning * into v_room_after;
      v_room_incidental_id := v_room_after.id;
    end if;

    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id,
      before_data, after_data, request_id
    ) values (
      v_actor,
      case when v_room_was_existing then 'ROOM_RELOCATION_UPDATE' else 'ROOM_RELOCATION_CREATE' end,
      'schedule_incidental',
      v_room_incidental_id::text,
      case when v_room_was_existing then to_jsonb(v_room_before) else null end,
      to_jsonb(v_room_after),
      v_request_id
    );
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'coverage_slot_ids', v_slot_ids,
    'room_incidental_id', v_room_incidental_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Update only the substitute/task of an existing OPERATIONAL slot.
-- Legacy imported history is intentionally immutable through this path.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_update_inval_assignment(
  p_coverage_slot_id uuid,
  p_substitute_teacher_id uuid,
  p_task_text text default '',
  p_constraint_ids uuid[] default '{}'::uuid[],
  p_override_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := gen_random_uuid();
  v_before public.coverage_slots%rowtype;
  v_after public.coverage_slots%rowtype;
  v_substitute_name text;
  v_soft_ids uuid[];
  v_constraint_id uuid;
  v_task_id uuid;
  v_old_task_text text;
  v_task_text text := trim(coalesce(p_task_text, ''));
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  select * into v_before
  from public.coverage_slots
  where id = p_coverage_slot_id and deleted_at is null
  for update;
  if v_before.id is null then
    raise exception 'COVERAGE_SLOT_NOT_FOUND';
  end if;
  if v_before.source = 'LEGACY_IMPORT' then
    raise exception 'LEGACY_COVERAGE_IS_IMMUTABLE';
  end if;

  select t.full_name into v_substitute_name
  from public.teachers t
  where t.id = p_substitute_teacher_id and t.is_active = true;
  if v_substitute_name is null then
    raise exception 'SUBSTITUTE_TEACHER_NOT_FOUND_OR_INACTIVE';
  end if;

  v_soft_ids := public.ejadwal_validate_substitute_constraints(
    p_substitute_teacher_id,
    v_before.schedule_date,
    v_before.period,
    coalesce(p_constraint_ids, '{}'::uuid[])
  );

  select lt.id, lt.description into v_task_id, v_old_task_text
  from public.learning_tasks lt
  where lt.coverage_slot_id = v_before.id and lt.deleted_at is null
  order by lt.created_at
  limit 1;

  update public.coverage_slots
  set substitute_teacher_id = p_substitute_teacher_id,
      substitute_teacher_name_snapshot = v_substitute_name,
      status = 'ASSIGNED',
      assigned_by = v_actor,
      assigned_at = now()
  where id = v_before.id
  returning * into v_after;

  if v_task_text <> '' then
    if v_task_id is null then
      insert into public.learning_tasks (coverage_slot_id, description, created_by)
      values (v_before.id, v_task_text, v_actor)
      returning id into v_task_id;
    else
      update public.learning_tasks
      set description = v_task_text, deleted_at = null, deleted_by = null
      where id = v_task_id;
    end if;
  else
    update public.learning_tasks
    set deleted_at = now(), deleted_by = v_actor
    where coverage_slot_id = v_before.id and deleted_at is null;
  end if;

  for v_constraint_id in select unnest(v_soft_ids)
  loop
    insert into public.coverage_constraint_overrides (
      coverage_slot_id, constraint_id, overridden_by, override_note
    ) values (
      v_before.id, v_constraint_id, v_actor, nullif(trim(coalesce(p_override_note, '')), '')
    )
    on conflict (coverage_slot_id, constraint_id)
    do update set
      overridden_by = excluded.overridden_by,
      override_note = excluded.override_note,
      created_at = now();

    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id,
      before_data, after_data, request_id
    ) values (
      v_actor, 'CONSTRAINT_OVERRIDE_ACK', 'coverage_constraint_override',
      v_before.id::text || ':' || v_constraint_id::text,
      null,
      jsonb_build_object('coverage_slot_id', v_before.id, 'constraint_id', v_constraint_id, 'override_note', p_override_note),
      v_request_id
    );
  end loop;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    v_actor, 'INVAL_UPDATE', 'coverage_slot', v_before.id::text,
    jsonb_build_object('coverage_slot', to_jsonb(v_before), 'task_text', v_old_task_text),
    jsonb_build_object('coverage_slot', to_jsonb(v_after), 'task_text', nullif(v_task_text, '')),
    v_request_id
  );

  return jsonb_build_object('coverage_slot_id', v_before.id, 'request_id', v_request_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Soft-delete operational coverage. Imported historical rows are protected.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_delete_inval_assignment(
  p_coverage_slot_id uuid,
  p_delete_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := gen_random_uuid();
  v_before public.coverage_slots%rowtype;
  v_after public.coverage_slots%rowtype;
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  select * into v_before
  from public.coverage_slots
  where id = p_coverage_slot_id and deleted_at is null
  for update;
  if v_before.id is null then
    raise exception 'COVERAGE_SLOT_NOT_FOUND';
  end if;
  if v_before.source = 'LEGACY_IMPORT' then
    raise exception 'LEGACY_COVERAGE_IS_IMMUTABLE';
  end if;

  update public.learning_tasks
  set deleted_at = now(), deleted_by = v_actor
  where coverage_slot_id = v_before.id and deleted_at is null;

  update public.coverage_slots
  set status = 'CANCELLED',
      deleted_at = now(),
      deleted_by = v_actor
  where id = v_before.id
  returning * into v_after;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    v_actor, 'INVAL_DELETE', 'coverage_slot', v_before.id::text,
    to_jsonb(v_before),
    jsonb_build_object('coverage_slot', to_jsonb(v_after), 'delete_note', nullif(trim(coalesce(p_delete_note, '')), '')),
    v_request_id
  );

  return jsonb_build_object('coverage_slot_id', v_before.id, 'request_id', v_request_id);
end;
$$;

-- Browser access is only through authenticated RPC. Anonymous execution stays closed.
revoke all on function public.ejadwal_save_inval_bundle(jsonb, jsonb, text) from public;
revoke all on function public.ejadwal_save_inval_bundle(jsonb, jsonb, text) from anon;
revoke all on function public.ejadwal_update_inval_assignment(uuid, uuid, text, uuid[], text) from public;
revoke all on function public.ejadwal_update_inval_assignment(uuid, uuid, text, uuid[], text) from anon;
revoke all on function public.ejadwal_delete_inval_assignment(uuid, text) from public;
revoke all on function public.ejadwal_delete_inval_assignment(uuid, text) from anon;

grant execute on function public.ejadwal_save_inval_bundle(jsonb, jsonb, text) to authenticated;
grant execute on function public.ejadwal_update_inval_assignment(uuid, uuid, text, uuid[], text) to authenticated;
grant execute on function public.ejadwal_delete_inval_assignment(uuid, text) to authenticated;

comment on function public.ejadwal_save_inval_bundle(jsonb, jsonb, text) is
  'V3.11 atomic Input Inval write. Staff only; validates substitute constraints; writes audit and override evidence.';
comment on function public.ejadwal_update_inval_assignment(uuid, uuid, text, uuid[], text) is
  'V3.11 staff-only update for operational badal assignment/task with audit.';
comment on function public.ejadwal_delete_inval_assignment(uuid, text) is
  'V3.11 staff-only soft delete for operational badal. LEGACY_IMPORT is immutable.';

commit;
