-- E-Jadwal V3.12.2 — Wakasek Leave Approval + Badal Waiting List
--
-- SUBMITTED public leave requests remain inert until a privileged staff member
-- explicitly decides them. APPROVE materializes TEACHING request slots into
-- coverage_slots with status WAITING/source LEAVE_WORKFLOW. FREE periods remain
-- attendance/statistics-only and never create coverage rows.

begin;

-- Compatibility bridge for requests submitted in V3.12 before
-- leave_request_periods existed. Every historical leave_request_slot was, by
-- definition, a real teaching assignment; therefore TEACHING can be backfilled
-- without inventing any FREE attendance facts.
insert into public.leave_request_periods (
  leave_request_id, schedule_date, period, period_type
)
select distinct
  lrs.leave_request_id,
  lrs.schedule_date,
  lrs.period,
  'TEACHING'
from public.leave_request_slots lrs
where not exists (
  select 1
  from public.leave_request_periods lrp
  where lrp.leave_request_id = lrs.leave_request_id
    and lrp.schedule_date = lrs.schedule_date
    and lrp.period = lrs.period
)
on conflict (leave_request_id, schedule_date, period) do nothing;

create or replace function public.ejadwal_decide_leave_request(
  p_leave_request_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_request public.leave_requests%rowtype;
  v_teacher_name text;
  v_slot public.leave_request_slots%rowtype;
  v_existing public.coverage_slots%rowtype;
  v_coverage_id uuid;
  v_coverage_ids jsonb := '[]'::jsonb;
  v_waiting_count integer := 0;
  v_free_count integer := 0;
  v_teaching_period_count integer := 0;
  v_audit_request_id uuid := gen_random_uuid();
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_leave_request_id is null then raise exception 'LEAVE_REQUEST_ID_REQUIRED'; end if;
  if v_decision not in ('APPROVE', 'DECLINE') then raise exception 'INVALID_LEAVE_DECISION'; end if;

  select * into v_request
  from public.leave_requests
  where id = p_leave_request_id
  for update;

  if v_request.id is null then raise exception 'LEAVE_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'SUBMITTED' then
    raise exception 'LEAVE_REQUEST_ALREADY_DECIDED: %', v_request.status;
  end if;

  select t.full_name into v_teacher_name
  from public.teachers t
  where t.id = v_request.teacher_id;
  if v_teacher_name is null then raise exception 'LEAVE_TEACHER_NOT_FOUND'; end if;

  select count(*)::integer into v_free_count
  from public.leave_request_periods lrp
  where lrp.leave_request_id = v_request.id and lrp.period_type = 'FREE';

  select count(*)::integer into v_teaching_period_count
  from public.leave_request_periods lrp
  where lrp.leave_request_id = v_request.id and lrp.period_type = 'TEACHING';

  if v_decision = 'DECLINE' then
    update public.leave_requests
    set status = 'DECLINED',
        decided_by = v_actor,
        decided_at = now(),
        decision_note = v_note,
        updated_at = now()
    where id = v_request.id;

    insert into public.audit_logs (
      actor_user_id, action, entity_type, entity_id,
      before_data, after_data, request_id
    ) values (
      v_actor,
      'LEAVE_DECLINED',
      'leave_request',
      v_request.id::text,
      jsonb_build_object('status', 'SUBMITTED'),
      jsonb_build_object(
        'status', 'DECLINED',
        'request_code', v_request.request_code,
        'teacher_id', v_request.teacher_id,
        'teacher_name', v_teacher_name,
        'decision_note', v_note,
        'free_period_count', v_free_count,
        'teaching_period_count', v_teaching_period_count
      ),
      v_audit_request_id
    );

    return jsonb_build_object(
      'request_id', v_request.id,
      'request_code', v_request.request_code,
      'status', 'DECLINED',
      'coverage_slot_ids', v_coverage_ids,
      'waiting_count', 0,
      'free_period_count', v_free_count,
      'teaching_period_count', v_teaching_period_count
    );
  end if;

  -- Approval uses the request snapshot, but revalidates that every teaching row
  -- is still a legitimate active assignment. A stale request must be reviewed,
  -- not silently approved against a changed schedule.
  for v_slot in
    select lrs.*
    from public.leave_request_slots lrs
    where lrs.leave_request_id = v_request.id
    order by lrs.schedule_date, lrs.period, lrs.class_name_snapshot, lrs.id
  loop
    if not exists (
      select 1 from public.leave_request_periods lrp
      where lrp.leave_request_id = v_request.id
        and lrp.schedule_date = v_slot.schedule_date
        and lrp.period = v_slot.period
        and lrp.period_type = 'TEACHING'
    ) then
      raise exception 'LEAVE_SLOT_WITHOUT_TEACHING_PERIOD: JP %', v_slot.period;
    end if;

    if not public.ejadwal_school_period_active(v_slot.schedule_date, v_slot.period) then
      raise exception 'LEAVE_SLOT_NO_LONGER_ACTIVE: % JP %', v_slot.schedule_date, v_slot.period;
    end if;

    if not public.ejadwal_teacher_scheduled_for_leave_slot(
      v_request.teacher_id,
      v_slot.schedule_date,
      v_slot.class_id,
      v_slot.period
    ) then
      raise exception 'LEAVE_SLOT_ASSIGNMENT_CHANGED: % JP %', v_slot.class_name_snapshot, v_slot.period;
    end if;

    select cs.* into v_existing
    from public.coverage_slots cs
    where cs.schedule_date = v_slot.schedule_date
      and cs.class_id = v_slot.class_id
      and cs.period = v_slot.period
      and cs.absent_teacher_id = v_request.teacher_id
      and cs.deleted_at is null
      and cs.status <> 'CANCELLED'
    order by cs.updated_at desc, cs.id
    limit 1
    for update;

    if v_existing.id is not null then
      raise exception 'ACTIVE_COVERAGE_ALREADY_EXISTS: % JP %', v_slot.class_name_snapshot, v_slot.period;
    end if;

    insert into public.coverage_slots (
      leave_request_id,
      schedule_date,
      class_id,
      class_name_snapshot,
      period,
      subject_snapshot,
      absent_teacher_id,
      absent_teacher_name_snapshot,
      substitute_teacher_id,
      substitute_teacher_name_snapshot,
      reason_snapshot,
      status,
      source,
      schedule_master_id,
      schedule_incidental_id,
      assigned_by,
      assigned_at
    ) values (
      v_request.id,
      v_slot.schedule_date,
      v_slot.class_id,
      v_slot.class_name_snapshot,
      v_slot.period,
      v_slot.subject_snapshot,
      v_request.teacher_id,
      v_teacher_name,
      null,
      null,
      v_request.reason,
      'WAITING',
      'LEAVE_WORKFLOW',
      v_slot.schedule_master_id,
      v_slot.schedule_incidental_id,
      null,
      null
    ) returning id into v_coverage_id;

    v_coverage_ids := v_coverage_ids || jsonb_build_array(v_coverage_id);
    v_waiting_count := v_waiting_count + 1;
  end loop;

  -- Defensive invariant: every TEACHING period must have at least one concrete
  -- class slot, while FREE-only requests legitimately materialize zero rows.
  if v_teaching_period_count > 0 and v_waiting_count = 0 then
    raise exception 'APPROVAL_HAS_TEACHING_PERIOD_BUT_NO_COVERAGE';
  end if;

  update public.leave_requests
  set status = 'APPROVED',
      decided_by = v_actor,
      decided_at = now(),
      decision_note = v_note,
      updated_at = now()
  where id = v_request.id;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id,
    before_data, after_data, request_id
  ) values (
    v_actor,
    'LEAVE_APPROVED',
    'leave_request',
    v_request.id::text,
    jsonb_build_object('status', 'SUBMITTED'),
    jsonb_build_object(
      'status', 'APPROVED',
      'request_code', v_request.request_code,
      'teacher_id', v_request.teacher_id,
      'teacher_name', v_teacher_name,
      'decision_note', v_note,
      'waiting_count', v_waiting_count,
      'free_period_count', v_free_count,
      'teaching_period_count', v_teaching_period_count,
      'coverage_slot_ids', v_coverage_ids
    ),
    v_audit_request_id
  );

  return jsonb_build_object(
    'request_id', v_request.id,
    'request_code', v_request.request_code,
    'status', 'APPROVED',
    'coverage_slot_ids', v_coverage_ids,
    'waiting_count', v_waiting_count,
    'free_period_count', v_free_count,
    'teaching_period_count', v_teaching_period_count
  );
end;
$$;

revoke all on function public.ejadwal_decide_leave_request(uuid, text, text) from public;
revoke all on function public.ejadwal_decide_leave_request(uuid, text, text) from anon;
grant execute on function public.ejadwal_decide_leave_request(uuid, text, text) to authenticated;

comment on function public.ejadwal_decide_leave_request(uuid, text, text) is
  'V3.12.2 privileged leave decision. APPROVE materializes TEACHING slots as LEAVE_WORKFLOW/WAITING coverage rows; FREE periods remain statistics-only.';

commit;
