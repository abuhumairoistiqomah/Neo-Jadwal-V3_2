-- E-JADWAL V3.19 RC3 — Shared substitute validator extended with RC2 duties.
-- Preserves V3.17.3 approved leave FREE-JP protection and existing hard/soft constraints.
-- Requires RC2 duty tables, existing V3.17.3 validator, and staff RLS. Run in staging first.
-- Updates only the shared staff-only substitute validator. No historical row changes.
begin;

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

  -- V3.19 RC3: planned events and compensatory dates are authoritative duty blocks.
  -- An event's gender scope NEVER grants membership: only teacher_id rows do.
  -- REMAINS_ON_DUTY is intentionally excluded (regular teaching continues).
  -- This check lives in the shared validator used by save/reassign operations;
  -- stale or forged browser recommendations cannot bypass it.
  if exists (
    select 1
      from public.ejadwal_teacher_duty_assignments_v319 a
      join public.ejadwal_teacher_duty_events_v319 e on e.id = a.event_id
     where a.teacher_id = p_teacher_id
       and e.status = 'ACTIVE'
       and a.duty_role in ('PARTICIPANT', 'STAFF')
       and (
         p_date between e.date_start and e.date_end
         or a.compensation_date = p_date
       )
  ) then
    raise exception 'SUBSTITUTE_ON_DUTY_OR_COMPENSATORY_OFF: teacher %, date %, JP %', p_teacher_id, p_date, p_period;
  end if;

  -- V3.17.3: FREE periods are approved attendance facts, not coverage slots.
  -- Never allow a badal through during an approved leave period, even when
  -- the selected JP had no original class and therefore no coverage row.
  if exists (
    select 1
    from public.leave_request_periods lrp
    join public.leave_requests lr on lr.id = lrp.leave_request_id
    where lr.teacher_id = p_teacher_id
      and lr.status = 'APPROVED'
      and lr.deleted_at is null
      and lrp.schedule_date = p_date
      and lrp.period = p_period
  ) then
    raise exception 'SUBSTITUTE_ON_APPROVED_LEAVE: teacher %, date %, JP %', p_teacher_id, p_date, p_period;
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


commit;
