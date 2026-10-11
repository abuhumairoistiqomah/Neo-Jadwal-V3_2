-- E-Jadwal V3.12 — Open Teacher Leave Form
-- Anonymous teachers may submit a tightly validated leave request without login.
-- The browser receives no direct INSERT/UPDATE/DELETE privilege on leave tables.
-- All anonymous writes pass through one SECURITY DEFINER RPC.

begin;

-- ---------------------------------------------------------------------------
-- Leave-request metadata needed by the open form.
-- Existing rows remain valid; request_code is nullable for pre-V3.12 history.
-- ---------------------------------------------------------------------------
alter table public.leave_requests
  add column if not exists request_code text null,
  add column if not exists request_type text not null default 'FULL_DAY',
  add column if not exists source text not null default 'AUTHENTICATED_FORM';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leave_requests'::regclass
      and conname = 'leave_requests_request_type_ck'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_request_type_ck
      check (request_type in ('FULL_DAY', 'PARTIAL'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leave_requests'::regclass
      and conname = 'leave_requests_source_ck'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_source_ck
      check (source in ('PUBLIC_FORM', 'AUTHENTICATED_FORM', 'ADMIN_MANUAL'));
  end if;
end
$$;

create unique index if not exists leave_requests_request_code_uidx
  on public.leave_requests (request_code)
  where request_code is not null;

create index if not exists leave_requests_public_queue_idx
  on public.leave_requests (status, submitted_at desc)
  where source = 'PUBLIC_FORM';

-- ---------------------------------------------------------------------------
-- Exact JP/class rows selected by the teacher before approval.
-- Approval will later materialize these into coverage_slots.
-- ---------------------------------------------------------------------------
create table if not exists public.leave_request_slots (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  schedule_date date not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  class_name_snapshot text not null default '',
  period smallint not null check (period between 0 and 6),
  subject_snapshot text not null default '',
  schedule_master_id uuid null references public.schedule_master(id) on delete set null,
  schedule_incidental_id uuid null references public.schedule_incidentals(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists leave_request_slots_identity_uidx
  on public.leave_request_slots (leave_request_id, schedule_date, class_id, period);
create index if not exists leave_request_slots_request_idx
  on public.leave_request_slots (leave_request_id, period, class_id);

alter table public.leave_request_slots enable row level security;

-- Direct anonymous table access remains closed. Anonymous clients get only RPC EXECUTE.
revoke all privileges on table public.leave_request_slots from anon;
revoke all privileges on table public.leave_requests from anon;

grant select, insert, update, delete on table public.leave_request_slots to authenticated;

drop policy if exists leave_request_slots_involved_select on public.leave_request_slots;
drop policy if exists leave_request_slots_staff_write on public.leave_request_slots;

create policy leave_request_slots_involved_select
on public.leave_request_slots
for select
to authenticated
using (
  exists (
    select 1
    from public.leave_requests lr
    where lr.id = leave_request_slots.leave_request_id
      and (
        lr.teacher_id = public.current_user_teacher_id()
        or public.current_user_is_staff()
      )
  )
);

create policy leave_request_slots_staff_write
on public.leave_request_slots
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- ---------------------------------------------------------------------------
-- Internal validator: is this teacher really assigned to the concrete slot
-- after date-specific teacher overrides? Academic-calendar suppression is
-- validated separately so the RPC can return a specific error.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_teacher_scheduled_for_leave_slot(
  p_teacher_id uuid,
  p_schedule_date date,
  p_class_id uuid,
  p_period smallint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_name text;
  v_master_id uuid;
  v_incidental_id uuid;
  v_incidental_kind text;
  v_found boolean := false;
begin
  select t.full_name into v_teacher_name
  from public.teachers t
  where t.id = p_teacher_id and t.is_active = true;

  if v_teacher_name is null then
    return false;
  end if;

  select sm.id into v_master_id
  from public.schedule_master sm
  where sm.class_id = p_class_id
    and sm.day_of_week = extract(isodow from p_schedule_date)::smallint
    and sm.period = p_period
    and sm.is_active = true
    and sm.deleted_at is null
  order by sm.id
  limit 1;

  select si.id, si.kind into v_incidental_id, v_incidental_kind
  from public.schedule_incidentals si
  where si.schedule_date = p_schedule_date
    and si.class_id = p_class_id
    and si.period = p_period
    and si.deleted_at is null
  order by si.updated_at desc, si.id
  limit 1;

  if v_master_id is null and v_incidental_id is null then
    return false;
  end if;

  select exists (
    select 1
    from generate_series(1, 6) as p(position)
    left join public.schedule_master_teachers smt
      on smt.schedule_id = v_master_id
     and smt.position = p.position
    left join public.schedule_incidental_teacher_overrides ito
      on ito.incidental_id = v_incidental_id
     and ito.position = p.position
    where
      case
        when ito.position is not null then
          ito.action = 'SET'
          and (
            ito.teacher_id = p_teacher_id
            or (
              ito.teacher_id is null
              and lower(trim(coalesce(ito.teacher_name_snapshot, ''))) = lower(trim(v_teacher_name))
            )
          )
        when v_incidental_kind = 'ADDITIONAL' then false
        else
          smt.teacher_id = p_teacher_id
          or (
            smt.teacher_id is null
            and lower(trim(coalesce(smt.teacher_name_snapshot, ''))) = lower(trim(v_teacher_name))
          )
      end
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

revoke all on function public.ejadwal_teacher_scheduled_for_leave_slot(uuid, date, uuid, smallint) from public;
revoke all on function public.ejadwal_teacher_scheduled_for_leave_slot(uuid, date, uuid, smallint) from anon;

-- ---------------------------------------------------------------------------
-- Public submission RPC.
-- Input slots are only identity hints. Teacher, class, effective assignment,
-- academic calendar, and active coverage are revalidated server-side.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_submit_public_leave_request(
  p_teacher_name text,
  p_schedule_date date,
  p_request_type text,
  p_reason text,
  p_detail text default null,
  p_slots jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_detail text := nullif(trim(coalesce(p_detail, '')), '');
  v_request_type text := upper(trim(coalesce(p_request_type, '')));
  v_request_id uuid;
  v_audit_request_id uuid := gen_random_uuid();
  v_request_code text;
  v_slot jsonb;
  v_class_code text;
  v_class_id uuid;
  v_class_name text;
  v_period smallint;
  v_subject text;
  v_authoritative_subject text;
  v_incidental_subject text;
  v_master_id uuid;
  v_incidental_id uuid;
  v_slot_count integer := 0;
  v_seen text[] := '{}'::text[];
  v_identity text;
begin
  if p_schedule_date is null then
    raise exception 'SCHEDULE_DATE_REQUIRED';
  end if;

  if trim(coalesce(p_teacher_name, '')) = '' then
    raise exception 'TEACHER_NAME_REQUIRED';
  end if;

  if v_request_type not in ('FULL_DAY', 'PARTIAL') then
    raise exception 'INVALID_REQUEST_TYPE';
  end if;

  if v_reason = '' then
    raise exception 'LEAVE_REASON_REQUIRED';
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'LEAVE_SLOTS_REQUIRED';
  end if;

  if jsonb_array_length(p_slots) > 32 then
    raise exception 'TOO_MANY_LEAVE_SLOTS';
  end if;

  select t.id, t.full_name
    into v_teacher_id, v_teacher_name
  from public.teachers t
  where t.is_active = true
    and (
      lower(trim(t.full_name)) = lower(trim(p_teacher_name))
      or lower(trim(coalesce(t.legacy_name, ''))) = lower(trim(p_teacher_name))
    )
  order by case when lower(trim(t.full_name)) = lower(trim(p_teacher_name)) then 0 else 1 end, t.id
  limit 1;

  if v_teacher_id is null then
    raise exception 'TEACHER_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.leave_requests lr
    where lr.teacher_id = v_teacher_id
      and p_schedule_date between lr.date_start and lr.date_end
      and lr.status in ('SUBMITTED', 'APPROVED')
  ) then
    raise exception 'DUPLICATE_ACTIVE_LEAVE_REQUEST';
  end if;

  loop
    v_request_code := 'IZN-' || to_char(p_schedule_date, 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.leave_requests lr where lr.request_code = v_request_code
    );
  end loop;

  insert into public.leave_requests (
    teacher_id,
    date_start,
    date_end,
    reason,
    detail,
    status,
    submitted_by,
    request_code,
    request_type,
    source
  ) values (
    v_teacher_id,
    p_schedule_date,
    p_schedule_date,
    v_reason,
    v_detail,
    'SUBMITTED',
    null,
    v_request_code,
    v_request_type,
    'PUBLIC_FORM'
  ) returning id into v_request_id;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    v_class_code := trim(coalesce(v_slot->>'class_code', ''));
    v_period := nullif(trim(coalesce(v_slot->>'period', '')), '')::smallint;
    v_subject := trim(coalesce(v_slot->>'subject', ''));

    if v_class_code = '' or v_period is null or v_period < 0 or v_period > 6 then
      raise exception 'INVALID_LEAVE_SLOT';
    end if;

    v_identity := lower(v_class_code) || '|' || v_period::text;
    if v_identity = any(v_seen) then
      raise exception 'DUPLICATE_LEAVE_SLOT';
    end if;
    v_seen := array_append(v_seen, v_identity);

    select c.id, c.display_name
      into v_class_id, v_class_name
    from public.classes c
    where c.is_active = true
      and (
        lower(trim(c.code)) = lower(v_class_code)
        or lower(trim(c.display_name)) = lower(v_class_code)
      )
    order by case when lower(trim(c.code)) = lower(v_class_code) then 0 else 1 end, c.id
    limit 1;

    if v_class_id is null then
      raise exception 'CLASS_NOT_FOUND: %', v_class_code;
    end if;

    if exists (
      select 1
      from public.academic_events ae
      where ae.status = 'ACTIVE'
        and p_schedule_date between ae.date_start and ae.date_end
        and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = v_class_id))
        and (
          (ae.period_start is null and ae.period_end is null)
          or v_period between ae.period_start and ae.period_end
        )
    ) then
      raise exception 'ACADEMIC_EVENT_SUPPRESSES_SLOT';
    end if;

    if not public.ejadwal_teacher_scheduled_for_leave_slot(
      v_teacher_id,
      p_schedule_date,
      v_class_id,
      v_period
    ) then
      raise exception 'TEACHER_NOT_SCHEDULED_FOR_SLOT: % JP %', v_class_code, v_period;
    end if;

    if exists (
      select 1
      from public.coverage_slots cs
      where cs.schedule_date = p_schedule_date
        and cs.class_id = v_class_id
        and cs.period = v_period
        and cs.absent_teacher_id = v_teacher_id
        and cs.deleted_at is null
        and cs.status <> 'CANCELLED'
    ) then
      raise exception 'SLOT_ALREADY_HAS_ACTIVE_COVERAGE';
    end if;

    select sm.id, sm.subject
      into v_master_id, v_authoritative_subject
    from public.schedule_master sm
    where sm.class_id = v_class_id
      and sm.day_of_week = extract(isodow from p_schedule_date)::smallint
      and sm.period = v_period
      and sm.is_active = true
      and sm.deleted_at is null
    order by sm.id
    limit 1;

    select si.id, si.override_subject
      into v_incidental_id, v_incidental_subject
    from public.schedule_incidentals si
    where si.schedule_date = p_schedule_date
      and si.class_id = v_class_id
      and si.period = v_period
      and si.deleted_at is null
    order by si.updated_at desc, si.id
    limit 1;

    if v_incidental_id is not null and nullif(trim(coalesce(v_incidental_subject, '')), '') is not null then
      v_authoritative_subject := v_incidental_subject;
    end if;

    insert into public.leave_request_slots (
      leave_request_id,
      schedule_date,
      class_id,
      class_name_snapshot,
      period,
      subject_snapshot,
      schedule_master_id,
      schedule_incidental_id
    ) values (
      v_request_id,
      p_schedule_date,
      v_class_id,
      coalesce(v_class_name, v_class_code),
      v_period,
      coalesce(nullif(trim(coalesce(v_authoritative_subject, '')), ''), v_subject, ''),
      v_master_id,
      v_incidental_id
    );

    v_slot_count := v_slot_count + 1;
    v_master_id := null;
    v_incidental_id := null;
    v_authoritative_subject := null;
    v_incidental_subject := null;
  end loop;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    request_id
  ) values (
    null,
    'LEAVE_SUBMIT_PUBLIC',
    'leave_request',
    v_request_id::text,
    null,
    jsonb_build_object(
      'request_code', v_request_code,
      'teacher_id', v_teacher_id,
      'teacher_name', v_teacher_name,
      'schedule_date', p_schedule_date,
      'request_type', v_request_type,
      'status', 'SUBMITTED',
      'source', 'PUBLIC_FORM',
      'slot_count', v_slot_count
    ),
    v_audit_request_id
  );

  return jsonb_build_object(
    'request_id', v_request_id,
    'request_code', v_request_code,
    'status', 'SUBMITTED',
    'slot_count', v_slot_count
  );
end;
$$;

-- Only the submission RPC is public. The validator stays internal.
revoke all on function public.ejadwal_submit_public_leave_request(text, date, text, text, text, jsonb) from public;
grant execute on function public.ejadwal_submit_public_leave_request(text, date, text, text, text, jsonb) to anon;
grant execute on function public.ejadwal_submit_public_leave_request(text, date, text, text, text, jsonb) to authenticated;

comment on function public.ejadwal_submit_public_leave_request(text, date, text, text, text, jsonb) is
  'V3.12 open teacher leave submission. Anonymous execute is allowed, but all writes are server-validated and direct table access remains closed.';

commit;
