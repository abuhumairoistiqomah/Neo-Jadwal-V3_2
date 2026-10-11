-- E-Jadwal V3.12.1 — Period-Based Leave + Inferred Combined Sessions
--
-- Leave attendance is now recorded per school JP, including FREE periods.
-- Only TEACHING periods carry class rows in leave_request_slots and later
-- materialize coverage/badal. FREE periods remain attendance/statistics facts.

begin;

create table if not exists public.leave_request_periods (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  schedule_date date not null,
  period smallint not null check (period between 1 and 6),
  period_type text not null check (period_type in ('TEACHING', 'FREE')),
  created_at timestamptz not null default now()
);

create unique index if not exists leave_request_periods_identity_uidx
  on public.leave_request_periods (leave_request_id, schedule_date, period);
create index if not exists leave_request_periods_statistics_idx
  on public.leave_request_periods (schedule_date, period_type, period);

alter table public.leave_request_periods enable row level security;
revoke all privileges on table public.leave_request_periods from anon;
grant select, insert, update, delete on table public.leave_request_periods to authenticated;

drop policy if exists leave_request_periods_involved_select on public.leave_request_periods;
drop policy if exists leave_request_periods_staff_write on public.leave_request_periods;

create policy leave_request_periods_involved_select
on public.leave_request_periods
for select
to authenticated
using (
  exists (
    select 1
    from public.leave_requests lr
    where lr.id = leave_request_periods.leave_request_id
      and (
        lr.teacher_id = public.current_user_teacher_id()
        or public.current_user_is_staff()
      )
  )
);

create policy leave_request_periods_staff_write
on public.leave_request_periods
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- Is there any active school KBM in this JP on this date? This gives the public
-- leave form a safe server-side guard for shorter school days (e.g. Friday)
-- and whole-school calendar closures.
create or replace function public.ejadwal_school_period_active(
  p_schedule_date date,
  p_period smallint
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.is_active = true
      and (
        exists (
          select 1 from public.schedule_master sm
          where sm.class_id = c.id
            and sm.day_of_week = extract(isodow from p_schedule_date)::smallint
            and sm.period = p_period
            and sm.is_active = true
            and sm.deleted_at is null
        )
        or exists (
          select 1 from public.schedule_incidentals si
          where si.class_id = c.id
            and si.schedule_date = p_schedule_date
            and si.period = p_period
            and si.deleted_at is null
        )
      )
      and not exists (
        select 1 from public.academic_events ae
        where ae.status = 'ACTIVE'
          and p_schedule_date between ae.date_start and ae.date_end
          and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = c.id))
          and (
            (ae.period_start is null and ae.period_end is null)
            or p_period between ae.period_start and ae.period_end
          )
      )
  );
$$;

revoke all on function public.ejadwal_school_period_active(date, smallint) from public;
revoke all on function public.ejadwal_school_period_active(date, smallint) from anon;

-- Reuse the V3.12 authoritative assignment validator across every active class
-- to determine whether a period is truly FREE for this teacher.
create or replace function public.ejadwal_teacher_has_active_teaching_at_period(
  p_teacher_id uuid,
  p_schedule_date date,
  p_period smallint
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.is_active = true
      and public.ejadwal_teacher_scheduled_for_leave_slot(
        p_teacher_id,
        p_schedule_date,
        c.id,
        p_period
      )
      and not exists (
        select 1 from public.academic_events ae
        where ae.status = 'ACTIVE'
          and p_schedule_date between ae.date_start and ae.date_end
          and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = c.id))
          and (
            (ae.period_start is null and ae.period_end is null)
            or p_period between ae.period_start and ae.period_end
          )
      )
  );
$$;

revoke all on function public.ejadwal_teacher_has_active_teaching_at_period(uuid, date, smallint) from public;
revoke all on function public.ejadwal_teacher_has_active_teaching_at_period(uuid, date, smallint) from anon;

-- V2 public RPC: p_slots remains the authoritative TEACHING class list used by
-- V3.12. p_periods is the new attendance layer and may include FREE JPs.
create or replace function public.ejadwal_submit_public_leave_request_v2(
  p_teacher_name text,
  p_schedule_date date,
  p_request_type text,
  p_reason text,
  p_detail text default null,
  p_slots jsonb default '[]'::jsonb,
  p_periods jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_period_row jsonb;
  v_period smallint;
  v_period_type text;
  v_seen_periods smallint[] := '{}'::smallint[];
  v_period_count integer := 0;
  v_free_count integer := 0;
  v_teaching_period_count integer := 0;
  v_teaching_slot_count integer := 0;
  v_base_result jsonb;
  v_request_id uuid;
  v_request_code text;
  v_audit_request_id uuid := gen_random_uuid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_detail text := nullif(trim(coalesce(p_detail, '')), '');
  v_request_type text := upper(trim(coalesce(p_request_type, '')));
begin
  if p_schedule_date is null then raise exception 'SCHEDULE_DATE_REQUIRED'; end if;
  if trim(coalesce(p_teacher_name, '')) = '' then raise exception 'TEACHER_NAME_REQUIRED'; end if;
  if v_request_type not in ('FULL_DAY', 'PARTIAL') then raise exception 'INVALID_REQUEST_TYPE'; end if;
  if v_reason = '' then raise exception 'LEAVE_REASON_REQUIRED'; end if;
  if p_periods is null or jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) = 0 then
    raise exception 'LEAVE_PERIODS_REQUIRED';
  end if;
  if jsonb_array_length(p_periods) > 6 then raise exception 'TOO_MANY_LEAVE_PERIODS'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'INVALID_LEAVE_SLOTS'; end if;

  select t.id, t.full_name into v_teacher_id, v_teacher_name
  from public.teachers t
  where t.is_active = true
    and (
      lower(trim(t.full_name)) = lower(trim(p_teacher_name))
      or lower(trim(coalesce(t.legacy_name, ''))) = lower(trim(p_teacher_name))
    )
  order by case when lower(trim(t.full_name)) = lower(trim(p_teacher_name)) then 0 else 1 end, t.id
  limit 1;

  if v_teacher_id is null then raise exception 'TEACHER_NOT_FOUND'; end if;

  -- Validate the period layer before writing anything.
  for v_period_row in select value from jsonb_array_elements(p_periods)
  loop
    v_period := nullif(trim(coalesce(v_period_row->>'period', '')), '')::smallint;
    v_period_type := upper(trim(coalesce(v_period_row->>'period_type', '')));

    if v_period is null or v_period < 1 or v_period > 6 then raise exception 'INVALID_LEAVE_PERIOD'; end if;
    if v_period = any(v_seen_periods) then raise exception 'DUPLICATE_LEAVE_PERIOD'; end if;
    v_seen_periods := array_append(v_seen_periods, v_period);

    if v_period_type not in ('TEACHING', 'FREE') then raise exception 'INVALID_LEAVE_PERIOD_TYPE'; end if;
    if not public.ejadwal_school_period_active(p_schedule_date, v_period) then
      raise exception 'SCHOOL_PERIOD_NOT_ACTIVE: JP %', v_period;
    end if;

    if v_period_type = 'FREE' then
      if public.ejadwal_teacher_has_active_teaching_at_period(v_teacher_id, p_schedule_date, v_period) then
        raise exception 'FREE_PERIOD_HAS_TEACHING: JP %', v_period;
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_slots) s
        where nullif(trim(coalesce(s->>'period', '')), '')::smallint = v_period
      ) then
        raise exception 'FREE_PERIOD_HAS_COVERAGE_SLOT: JP %', v_period;
      end if;
      v_free_count := v_free_count + 1;
    else
      if not public.ejadwal_teacher_has_active_teaching_at_period(v_teacher_id, p_schedule_date, v_period) then
        raise exception 'TEACHING_PERIOD_HAS_NO_ACTIVE_TEACHING: JP %', v_period;
      end if;
      if not exists (
        select 1 from jsonb_array_elements(p_slots) s
        where nullif(trim(coalesce(s->>'period', '')), '')::smallint = v_period
      ) then
        raise exception 'TEACHING_PERIOD_HAS_NO_SLOT: JP %', v_period;
      end if;
      v_teaching_period_count := v_teaching_period_count + 1;
    end if;

    v_period_count := v_period_count + 1;
  end loop;

  -- Every teaching slot must belong to a selected TEACHING period.
  if exists (
    select 1
    from jsonb_array_elements(p_slots) s
    where not exists (
      select 1 from jsonb_array_elements(p_periods) p
      where nullif(trim(coalesce(p->>'period', '')), '')::smallint = nullif(trim(coalesce(s->>'period', '')), '')::smallint
        and upper(trim(coalesce(p->>'period_type', ''))) = 'TEACHING'
    )
  ) then
    raise exception 'COVERAGE_SLOT_WITHOUT_TEACHING_PERIOD';
  end if;

  v_teaching_slot_count := jsonb_array_length(p_slots);

  if v_teaching_slot_count > 0 then
    -- V3.12 RPC remains the single source of truth for class/schedule/calendar
    -- validation and creation of leave_request_slots.
    v_base_result := public.ejadwal_submit_public_leave_request(
      p_teacher_name,
      p_schedule_date,
      p_request_type,
      p_reason,
      p_detail,
      p_slots
    );
    v_request_id := (v_base_result->>'request_id')::uuid;
    v_request_code := v_base_result->>'request_code';
  else
    -- A valid absence may consist exclusively of FREE periods, so no coverage
    -- class exists. Create the request directly after the period validation.
    if exists (
      select 1 from public.leave_requests lr
      where lr.teacher_id = v_teacher_id
        and p_schedule_date between lr.date_start and lr.date_end
        and lr.status in ('SUBMITTED', 'APPROVED')
    ) then
      raise exception 'DUPLICATE_ACTIVE_LEAVE_REQUEST';
    end if;

    loop
      v_request_code := 'IZN-' || to_char(p_schedule_date, 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.leave_requests lr where lr.request_code = v_request_code);
    end loop;

    insert into public.leave_requests (
      teacher_id, date_start, date_end, reason, detail, status, submitted_by,
      request_code, request_type, source
    ) values (
      v_teacher_id, p_schedule_date, p_schedule_date, v_reason, v_detail,
      'SUBMITTED', null, v_request_code, v_request_type, 'PUBLIC_FORM'
    ) returning id into v_request_id;
  end if;

  for v_period_row in select value from jsonb_array_elements(p_periods)
  loop
    insert into public.leave_request_periods (
      leave_request_id,
      schedule_date,
      period,
      period_type
    ) values (
      v_request_id,
      p_schedule_date,
      (v_period_row->>'period')::smallint,
      upper(trim(v_period_row->>'period_type'))
    );
  end loop;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    null,
    'LEAVE_PERIODS_RECORDED',
    'leave_request',
    v_request_id::text,
    null,
    jsonb_build_object(
      'request_code', v_request_code,
      'teacher_id', v_teacher_id,
      'teacher_name', v_teacher_name,
      'schedule_date', p_schedule_date,
      'period_count', v_period_count,
      'teaching_period_count', v_teaching_period_count,
      'teaching_slot_count', v_teaching_slot_count,
      'free_period_count', v_free_count
    ),
    v_audit_request_id
  );

  return jsonb_build_object(
    'request_id', v_request_id,
    'request_code', v_request_code,
    'status', 'SUBMITTED',
    'slot_count', v_period_count,
    'period_count', v_period_count,
    'teaching_slot_count', v_teaching_slot_count,
    'free_period_count', v_free_count
  );
end;
$$;

revoke all on function public.ejadwal_submit_public_leave_request_v2(text, date, text, text, text, jsonb, jsonb) from public;
grant execute on function public.ejadwal_submit_public_leave_request_v2(text, date, text, text, text, jsonb, jsonb) to anon;
grant execute on function public.ejadwal_submit_public_leave_request_v2(text, date, text, text, text, jsonb, jsonb) to authenticated;

comment on table public.leave_request_periods is
  'V3.12.1 attendance-level leave facts. TEACHING periods may create coverage; FREE periods are statistics-only.';
comment on function public.ejadwal_submit_public_leave_request_v2(text, date, text, text, text, jsonb, jsonb) is
  'V3.12.1 public leave submission with JP-level attendance, including FREE periods, while retaining server-validated teaching coverage slots.';

commit;
