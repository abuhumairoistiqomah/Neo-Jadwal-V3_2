-- E-Jadwal V3.5.2 — Substitute Availability Constraints
--
-- Adds a dedicated "soft ban" / substitute-availability layer.
-- This does NOT change teaching schedules. It only tells the substitute
-- recommendation engine that an otherwise-free teacher should be deprioritized
-- or blocked for specific dates/weekly slots.
--
-- Current intended use: override_allowed = true (soft constraint).
-- The schema also preserves an explicit override record when a staff member
-- deliberately assigns a constrained teacher.

begin;

create table if not exists public.substitute_constraints (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  constraint_type text not null check (constraint_type in ('WEEKLY', 'DATE')),
  -- Monday=1 ... Sunday=7. Null for WEEKLY means every day.
  day_of_week smallint null check (day_of_week is null or day_of_week between 1 and 7),
  -- Required for DATE; null for WEEKLY.
  specific_date date null,
  period_start smallint not null check (period_start between 0 and 6),
  period_end smallint not null check (period_end between 0 and 6),
  -- Optional validity window for recurring WEEKLY rules.
  valid_from date null,
  valid_until date null,
  reason text not null,
  -- true = warning/soft ban and staff may deliberately override it.
  override_allowed boolean not null default true,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id) on delete set null,
  constraint substitute_constraints_period_order_ck check (period_end >= period_start),
  constraint substitute_constraints_validity_order_ck check (
    valid_from is null or valid_until is null or valid_until >= valid_from
  ),
  constraint substitute_constraints_scope_ck check (
    (
      constraint_type = 'DATE'
      and specific_date is not null
      and day_of_week is null
      and valid_from is null
      and valid_until is null
    )
    or
    (
      constraint_type = 'WEEKLY'
      and specific_date is null
    )
  )
);

-- Explicit evidence that a staff member deliberately crossed a matching rule.
-- One coverage slot can match more than one constraint, so each matched rule
-- may be acknowledged separately.
create table if not exists public.coverage_constraint_overrides (
  id uuid primary key default gen_random_uuid(),
  coverage_slot_id uuid not null references public.coverage_slots(id) on delete cascade,
  constraint_id uuid not null references public.substitute_constraints(id) on delete restrict,
  overridden_by uuid not null references auth.users(id) on delete restrict,
  override_note text null,
  created_at timestamptz not null default now(),
  unique (coverage_slot_id, constraint_id)
);

create index if not exists substitute_constraints_teacher_lookup_idx
  on public.substitute_constraints (
    teacher_id,
    constraint_type,
    specific_date,
    day_of_week,
    period_start,
    period_end
  )
  where deleted_at is null and is_active = true;

create index if not exists substitute_constraints_weekly_validity_idx
  on public.substitute_constraints (teacher_id, valid_from, valid_until)
  where deleted_at is null and is_active = true and constraint_type = 'WEEKLY';

create index if not exists coverage_constraint_overrides_slot_idx
  on public.coverage_constraint_overrides (coverage_slot_id, created_at desc);

-- Keep the existing generic updated_at behavior.
drop trigger if exists set_updated_at on public.substitute_constraints;
create trigger set_updated_at
before update on public.substitute_constraints
for each row execute function public.set_updated_at();

-- Security-by-default.
alter table public.substitute_constraints enable row level security;
alter table public.coverage_constraint_overrides enable row level security;

revoke all privileges on table public.substitute_constraints from anon;
revoke all privileges on table public.coverage_constraint_overrides from anon;

-- The browser needs explicit grants because this project does not automatically
-- expose new tables. RLS remains the real authorization boundary.
grant select, insert, update, delete on table public.substitute_constraints to authenticated;
grant select, insert, update, delete on table public.coverage_constraint_overrides to authenticated;

-- Re-runnable in staging.
drop policy if exists substitute_constraints_self_staff_select on public.substitute_constraints;
drop policy if exists substitute_constraints_staff_all on public.substitute_constraints;
drop policy if exists coverage_constraint_overrides_staff_select on public.coverage_constraint_overrides;
drop policy if exists coverage_constraint_overrides_staff_all on public.coverage_constraint_overrides;

-- Teachers may see only their own constraints; WAKASEK/ADMIN may see all.
create policy substitute_constraints_self_staff_select
on public.substitute_constraints
for select
to authenticated
using (
  public.current_user_is_staff()
  or (
    deleted_at is null
    and is_active = true
    and teacher_id = public.current_user_teacher_id()
  )
);

-- WAKASEK and ADMIN manage the operational constraint list.
create policy substitute_constraints_staff_all
on public.substitute_constraints
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- Override evidence is staff-operational/audit information.
create policy coverage_constraint_overrides_staff_select
on public.coverage_constraint_overrides
for select
to authenticated
using (public.current_user_is_staff());

create policy coverage_constraint_overrides_staff_all
on public.coverage_constraint_overrides
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

commit;
