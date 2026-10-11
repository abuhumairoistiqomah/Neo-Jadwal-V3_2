-- E-Jadwal V3.14.6 RC3.4.6
-- (1) audited soft cancellation for legacy imported coverage, never physical deletion.
-- (2) ADMIN/WAKASEK amendment to append missed FREE leave JPs to an existing request.
-- Run AFTER 202610110053 in STAGING first.
begin;

-- Preserve cancellation even if an old legacy synchronization re-upserts a row.
create or replace function public.ejadwal_preserve_legacy_cancelled_coverage_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source = 'LEGACY_IMPORT'
     and old.deleted_at is not null
     and old.status = 'CANCELLED' then
    new.status := 'CANCELLED';
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_legacy_cancelled_coverage on public.coverage_slots;
create trigger preserve_legacy_cancelled_coverage
before update on public.coverage_slots
for each row execute function public.ejadwal_preserve_legacy_cancelled_coverage_v1();

-- The original V3.11 delete RPC protected imported rows entirely.
-- This revision preserves immutable CONTENT but allows a staffed, audited
-- cancellation of visibility. The original legacy_log_id/source/snapshots
-- and before_data stay intact; learning tasks are also soft-deleted.
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
    raise exception 'COVERAGE_SLOT_NOT_FOUND_OR_ALREADY_CANCELLED';
  end if;
  if v_before.source = 'LEGACY_IMPORT'
     and not public.current_user_has_role('ADMIN') then
    raise exception 'ADMIN_REQUIRED_TO_CANCEL_IMPORTED_HISTORY';
  end if;

  update public.learning_tasks
  set deleted_at = now(), deleted_by = v_actor
  where coverage_slot_id = v_before.id and deleted_at is null;

  update public.coverage_slots
  set status = 'CANCELLED', deleted_at = now(), deleted_by = v_actor
  where id = v_before.id
  returning * into v_after;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    v_actor, case when v_before.source = 'LEGACY_IMPORT'
      then 'LEGACY_COVERAGE_SOFT_CANCEL' else 'INVAL_DELETE' end,
    'coverage_slot', v_before.id::text,
    to_jsonb(v_before),
    jsonb_build_object('coverage_slot', to_jsonb(v_after),
      'delete_note', nullif(trim(coalesce(p_delete_note, '')), '')),
    v_request_id
  );

  return jsonb_build_object(
    'coverage_slot_id', v_before.id,
    'request_id', v_request_id,
    'status', 'CANCELLED',
    'source', v_before.source
  );
end;
$$;

-- Read only active request and actual missing FREE periods, never all leave
-- details of other teachers. Staff login is mandatory.
create or replace function public.ejadwal_find_leave_free_amendment_v1(
  p_teacher_name text,
  p_schedule_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.leave_requests%rowtype;
  v_teacher_id uuid;
  v_candidate smallint;
  v_missing smallint[] := '{}'::smallint[];
  v_recorded smallint[] := '{}'::smallint[];
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  select t.id into v_teacher_id from public.teachers t
  where t.is_active = true and (
    lower(trim(t.full_name)) = lower(trim(p_teacher_name)) or
    lower(trim(coalesce(t.legacy_name, ''))) = lower(trim(p_teacher_name))
  ) order by case when lower(trim(t.full_name)) = lower(trim(p_teacher_name)) then 0 else 1 end
  limit 1;
  if v_teacher_id is null then raise exception 'TEACHER_NOT_FOUND'; end if;

  select lr.* into v_request from public.leave_requests lr
  where lr.teacher_id = v_teacher_id
    and p_schedule_date between lr.date_start and lr.date_end
    and lr.status in ('SUBMITTED', 'APPROVED')
  order by lr.submitted_at desc limit 1;
  if v_request.id is null then return null; end if;

  select coalesce(array_agg(p.period order by p.period), '{}'::smallint[])
  into v_recorded
  from public.leave_request_periods p
  where p.leave_request_id = v_request.id and p.schedule_date = p_schedule_date;

  for v_candidate in select generate_series(0, 6)::smallint loop
    if not v_candidate = any(v_recorded)
       and public.ejadwal_school_period_active(p_schedule_date, v_candidate)
       and not public.ejadwal_teacher_has_active_teaching_at_period(
         v_teacher_id, p_schedule_date, v_candidate) then
      v_missing := array_append(v_missing, v_candidate);
    end if;
  end loop;

  return jsonb_build_object(
    'request_id', v_request.id,
    'request_code', v_request.request_code,
    'status', v_request.status,
    'recorded_periods', to_jsonb(v_recorded),
    'missing_free_periods', to_jsonb(v_missing)
  );
end;
$$;

-- Append ONLY genuinely free JPs to the same active request, atomically and
-- without creating coverage/badal rows. An APPROVED request keeps its approval.
create or replace function public.ejadwal_append_leave_free_periods_v1(
  p_leave_request_id uuid,
  p_periods smallint[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.leave_requests%rowtype;
  v_period smallint;
  v_seen smallint[] := '{}'::smallint[];
  v_added smallint[] := '{}'::smallint[];
  v_audit_id uuid := gen_random_uuid();
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if coalesce(array_length(p_periods, 1), 0) = 0
     or array_length(p_periods, 1) > 7 then
    raise exception 'FREE_PERIOD_SELECTION_REQUIRED';
  end if;
  select * into v_req from public.leave_requests
  where id = p_leave_request_id for update;
  if v_req.id is null or v_req.status not in ('SUBMITTED', 'APPROVED') then
    raise exception 'ACTIVE_LEAVE_REQUEST_REQUIRED';
  end if;
  if v_req.date_start <> v_req.date_end then
    raise exception 'MULTIDAY_LEAVE_AMENDMENT_NOT_SUPPORTED';
  end if;

  foreach v_period in array p_periods loop
    if v_period is null or v_period < 0 or v_period > 6
       or v_period = any(v_seen) then
      raise exception 'INVALID_OR_DUPLICATED_PERIOD';
    end if;
    v_seen := array_append(v_seen, v_period);
    if not public.ejadwal_school_period_active(v_req.date_start, v_period) then
      raise exception 'SCHOOL_PERIOD_NOT_ACTIVE: JP %', v_period;
    end if;
    if public.ejadwal_teacher_has_active_teaching_at_period(
         v_req.teacher_id, v_req.date_start, v_period) then
      raise exception 'FREE_PERIOD_HAS_TEACHING: JP %', v_period;
    end if;
    if exists (select 1 from public.leave_request_periods p
      where p.leave_request_id = v_req.id
        and p.schedule_date = v_req.date_start and p.period = v_period) then
      raise exception 'LEAVE_PERIOD_ALREADY_RECORDED: JP %', v_period;
    end if;
    insert into public.leave_request_periods (
      leave_request_id, schedule_date, period, period_type
    ) values (v_req.id, v_req.date_start, v_period, 'FREE');
    v_added := array_append(v_added, v_period);
  end loop;

  update public.leave_requests set updated_at = now() where id = v_req.id;
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    v_actor, 'LEAVE_FREE_PERIODS_APPENDED', 'leave_request', v_req.id::text,
    jsonb_build_object('request_code', v_req.request_code, 'status', v_req.status),
    jsonb_build_object('schedule_date', v_req.date_start,
      'period_type', 'FREE', 'added_periods', to_jsonb(v_added)),
    v_audit_id
  );

  return jsonb_build_object('request_id', v_req.id, 'request_code', v_req.request_code,
    'status', v_req.status, 'added_periods', to_jsonb(v_added), 'audit_id', v_audit_id);
end;
$$;

revoke all on function public.ejadwal_delete_inval_assignment(uuid,text) from public, anon;
revoke all on function public.ejadwal_find_leave_free_amendment_v1(text,date) from public, anon;
revoke all on function public.ejadwal_append_leave_free_periods_v1(uuid,smallint[]) from public, anon;
grant execute on function public.ejadwal_delete_inval_assignment(uuid,text) to authenticated;
grant execute on function public.ejadwal_find_leave_free_amendment_v1(text,date) to authenticated;
grant execute on function public.ejadwal_append_leave_free_periods_v1(uuid,smallint[]) to authenticated;

comment on function public.ejadwal_delete_inval_assignment(uuid,text) is
  'RC3.4.6 audited soft cancellation of operational and ADMIN-only imported legacy coverage; no physical delete.';
comment on function public.ejadwal_append_leave_free_periods_v1(uuid,smallint[]) is
  'RC3.4.6 staff-only correction: append FREE absence JPs to existing single-day leave without creating substitute coverage.';
commit;
