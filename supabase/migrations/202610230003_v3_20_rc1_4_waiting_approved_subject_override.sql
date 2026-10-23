-- E-JADWAL V3.20 RC1.4 — approved Waiting List badal + dated subject override.
-- Prerequisite: RC1.3 dated subject override (202610230002).
-- One RPC transaction handles *all* approved WAITING coverage slots in a session.
-- Existing approved leave, tasks, room/teacher incidentals and schedule_master are preserved.

create or replace function public.ejadwal_assign_waiting_badal_v320_rc14(
  p_rows jsonb,
  p_override_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_session_request uuid;
  v_session_teacher uuid;
  v_session_date date;
  v_session_period smallint;
  v_session_subject text;
  v_request_status text;
  v_group_count integer;
  v_input_count integer;
  v_seen uuid[] := '{}'::uuid[];
  v_row jsonb;
  v_slot_id uuid;
  v_substitute_id uuid;
  v_slot public.coverage_slots%rowtype;
  v_expected text;
  v_desired text;
  v_result jsonb;
  v_results uuid[] := '{}'::uuid[];
  v_request_id uuid := gen_random_uuid();
  v_master_subject text;
  v_inc_id uuid;
  v_inc_subject text;
  v_effective text;
  v_inc_before jsonb;
  v_inc_after jsonb;
  v_cover_before jsonb;
  v_cover_after jsonb;
begin
  if v_actor is null or not public.current_user_is_staff()
     or not exists (select 1 from public.user_roles
                    where user_id = v_actor and role in ('ADMIN','WAKASEK')) then
    raise exception 'ADMIN_OR_WAKASEK_REQUIRED';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'WAITING_ASSIGNMENTS_REQUIRED';
  end if;
  v_input_count := jsonb_array_length(p_rows);
  if v_input_count > 100 then raise exception 'WAITING_SESSION_TOO_LARGE'; end if;

  -- First pass locks and validates ALL original identities, before any write.
  -- Ordering by UUID minimizes deadlocks between competing session submissions.
  for v_row in
    select value from jsonb_array_elements(p_rows)
    order by value->>'coverage_slot_id'
  loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'WAITING_ROW_INVALID'; end if;
    v_slot_id := nullif(btrim(coalesce(v_row->>'coverage_slot_id','')), '')::uuid;
    v_substitute_id := nullif(btrim(coalesce(v_row->>'substitute_teacher_id','')), '')::uuid;
    v_expected := btrim(coalesce(v_row->>'expected_subject',''));
    v_desired := btrim(coalesce(v_row->>'subject',''));
    if v_slot_id is null or v_substitute_id is null then
      raise exception 'WAITING_IDS_REQUIRED';
    end if;
    if v_slot_id = any(v_seen) then raise exception 'WAITING_DUPLICATE_COVERAGE_SLOT'; end if;
    v_seen := array_append(v_seen, v_slot_id);
    if v_expected = '' or v_desired = '' or length(v_expected) > 120 or length(v_desired) > 120 then
      raise exception 'BADAL_SUBJECT_INVALID';
    end if;
    select * into v_slot from public.coverage_slots
      where id = v_slot_id for update;
    if v_slot.id is null or v_slot.deleted_at is not null
       or v_slot.source <> 'LEAVE_WORKFLOW' or v_slot.status <> 'WAITING'
       or v_slot.leave_request_id is null or v_slot.absent_teacher_id is null then
      raise exception 'APPROVED_WAITING_COVERAGE_REQUIRED';
    end if;
    if v_slot.schedule_date < (now() at time zone 'Asia/Jakarta')::date then
      raise exception 'WAITING_SESSION_EXPIRED';
    end if;
    if lower(btrim(v_slot.subject_snapshot)) <> lower(v_expected) then
      raise exception 'WAITING_SUBJECT_STALE_REFRESH_REQUIRED';
    end if;
    if lower(v_desired) <> lower(v_expected) and not (v_slot.period between 1 and 6) then
      raise exception 'BADAL_SUBJECT_ONLY_JP1_TO_JP6';
    end if;
    if v_session_request is null then
      v_session_request := v_slot.leave_request_id;
      v_session_teacher := v_slot.absent_teacher_id;
      v_session_date := v_slot.schedule_date;
      v_session_period := v_slot.period;
      v_session_subject := v_slot.subject_snapshot;
    elsif v_slot.leave_request_id <> v_session_request
       or v_slot.absent_teacher_id <> v_session_teacher
       or v_slot.schedule_date <> v_session_date
       or v_slot.period <> v_session_period
       or lower(btrim(v_slot.subject_snapshot)) <> lower(btrim(v_session_subject)) then
      raise exception 'WAITING_SESSION_MIXED_IDENTITIES';
    end if;
  end loop;

  select lr.status into v_request_status from public.leave_requests lr
    where lr.id = v_session_request and lr.deleted_at is null;
  if v_request_status is distinct from 'APPROVED' then
    raise exception 'APPROVED_LEAVE_REQUIRED';
  end if;

  -- Do not silently assign a subset of a combined Waiting session.
  select count(*) into v_group_count from public.coverage_slots cs
    where cs.leave_request_id = v_session_request
      and cs.absent_teacher_id = v_session_teacher
      and cs.schedule_date = v_session_date and cs.period = v_session_period
      and lower(btrim(cs.subject_snapshot)) = lower(btrim(v_session_subject))
      and cs.source = 'LEAVE_WORKFLOW' and cs.status = 'WAITING' and cs.deleted_at is null;
  if v_group_count <> v_input_count then
    raise exception 'WAITING_SESSION_INCOMPLETE_REFRESH_REQUIRED';
  end if;

  -- Second pass: nested legacy RPC preserves substitute constraints, audits,
  -- soft-override acknowledgements, learning tasks and prior leave identity.
  -- PL/pgSQL invocation and all ensuing changes share ONE transaction.
  for v_row in
    select value from jsonb_array_elements(p_rows)
    order by value->>'coverage_slot_id'
  loop
    v_slot_id := (v_row->>'coverage_slot_id')::uuid;
    v_substitute_id := (v_row->>'substitute_teacher_id')::uuid;
    v_expected := btrim(v_row->>'expected_subject');
    v_desired := btrim(v_row->>'subject');

    v_result := public.ejadwal_replace_inval_substitute_v1(
      v_slot_id, v_substitute_id,
      case when jsonb_typeof(v_row->'constraint_ids') = 'array' then
        array(select jsonb_array_elements_text(v_row->'constraint_ids')::uuid)
      else '{}'::uuid[] end,
      p_override_note
    );
    v_results := array_append(v_results, v_slot_id);

    if v_desired = v_expected then continue; end if;

    select * into v_slot from public.coverage_slots where id = v_slot_id for update;
    -- Lock and verify the dated schedule exactly as RC1.3 does.
    perform pg_advisory_xact_lock(hashtextextended(
      v_slot.schedule_date::text || '|' || v_slot.class_id::text || '|' || v_slot.period::text, 32013));

    v_master_subject := null;
    select sm.subject into v_master_subject from public.schedule_master sm
      where sm.class_id = v_slot.class_id
        and sm.day_of_week = extract(isodow from v_slot.schedule_date)::smallint
        and sm.period = v_slot.period and sm.is_active = true and sm.deleted_at is null
      order by sm.id limit 1;

    v_inc_id := null; v_inc_subject := null;
    select si.id, si.override_subject into v_inc_id, v_inc_subject
      from public.schedule_incidentals si
      where si.schedule_date = v_slot.schedule_date
        and si.class_id = v_slot.class_id and si.period = v_slot.period
        and si.deleted_at is null
      order by si.updated_at desc, si.id desc limit 1 for update;

    v_effective := coalesce(nullif(btrim(v_inc_subject),''), nullif(btrim(v_master_subject),''));
    if v_effective is null then
      raise exception 'BADAL_SUBJECT_NO_EFFECTIVE_SCHEDULE';
    end if;
    if lower(v_effective) <> lower(v_expected) then
      raise exception 'BADAL_SUBJECT_STALE_REFRESH_REQUIRED';
    end if;

    v_inc_before := null;
    if v_inc_id is not null then
      select to_jsonb(si) into v_inc_before
        from public.schedule_incidentals si where si.id = v_inc_id;
      update public.schedule_incidentals
        set override_subject = v_desired, updated_at = now()
        where id = v_inc_id returning to_jsonb(schedule_incidentals) into v_inc_after;
    else
      insert into public.schedule_incidentals (
        schedule_date, class_id, period, kind, override_subject, reason, incidental_type
      ) values (
        v_slot.schedule_date, v_slot.class_id, v_slot.period, 'OVERRIDE',
        v_desired, 'Perubahan mapel dari Waiting List Persetujuan Izin', 'BADAL_SUBJECT_OVERRIDE'
      ) returning id, to_jsonb(schedule_incidentals) into v_inc_id, v_inc_after;
    end if;
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
    ) values (
      v_actor, 'WAITING_BADAL_SUBJECT_OVERRIDE', 'schedule_incidental', v_inc_id::text,
      v_inc_before, v_inc_after, v_request_id
    );

    select to_jsonb(cs) into v_cover_before from public.coverage_slots cs where cs.id = v_slot_id;
    update public.coverage_slots
      set subject_snapshot = v_desired, schedule_incidental_id = v_inc_id
      where id = v_slot_id returning to_jsonb(coverage_slots) into v_cover_after;
    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
    ) values (
      v_actor, 'WAITING_BADAL_COVERAGE_SUBJECT_SYNC', 'coverage_slot', v_slot_id::text,
      v_cover_before, v_cover_after, v_request_id
    );
  end loop;
  return jsonb_build_object(
    'request_id', v_request_id, 'coverage_slot_ids', to_jsonb(v_results),
    'leave_request_id', v_session_request, 'assigned_count', cardinality(v_results)
  );
end;
$$;

revoke all on function public.ejadwal_assign_waiting_badal_v320_rc14(jsonb,text) from public, anon;
grant execute on function public.ejadwal_assign_waiting_badal_v320_rc14(jsonb,text) to authenticated;
comment on function public.ejadwal_assign_waiting_badal_v320_rc14(jsonb,text) is
 'V3.20 RC1.4: atomic approved Waiting List assignment and optional dated subject override; existing leave/task/master preserved.';
