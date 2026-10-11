-- E-Jadwal V3.6.1 — Legacy Exception Preservation
-- Apply AFTER 202610050006_v3_6_legacy_import_support.sql
--
-- Preserves two real legacy practices discovered during preflight:
-- 1) Jadwal_Insidental without class can intentionally mean a room is unavailable.
-- 2) Incomplete/duplicate historical Log_Izin rows should remain importable as history.

begin;

-- ---------------------------------------------------------------------------
-- Dedicated room-unavailability records.
-- These are NOT class schedule overrides and should not be forced into
-- schedule_incidentals, whose class_id remains mandatory.
-- ---------------------------------------------------------------------------
create table if not exists public.room_unavailability (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete restrict,
  date_start date not null,
  date_end date not null,
  period_start smallint null,
  period_end smallint null,
  reason text null,
  note text null,
  legacy_incidental_type text null,
  source text not null default 'ADMIN_MANUAL'
    check (source in ('LEGACY_INCIDENTAL', 'ADMIN_MANUAL')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE')),
  legacy_row_id text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id) on delete set null,
  constraint room_unavailability_date_order_ck check (date_end >= date_start),
  constraint room_unavailability_period_pair_ck check (
    (period_start is null and period_end is null)
    or
    (period_start is not null and period_end is not null
      and period_start between 0 and 6
      and period_end between period_start and 6)
  )
);

create unique index if not exists room_unavailability_legacy_row_id_uidx
  on public.room_unavailability (legacy_row_id);

create index if not exists room_unavailability_lookup_idx
  on public.room_unavailability (room_id, date_start, date_end, period_start, period_end)
  where deleted_at is null and status = 'ACTIVE';

drop trigger if exists set_updated_at on public.room_unavailability;
create trigger set_updated_at
before update on public.room_unavailability
for each row execute function public.set_updated_at();

alter table public.room_unavailability enable row level security;

revoke all privileges on table public.room_unavailability from anon;
grant select, insert, update, delete on table public.room_unavailability to authenticated;

drop policy if exists room_unavailability_authenticated_read on public.room_unavailability;
drop policy if exists room_unavailability_staff_write on public.room_unavailability;

create policy room_unavailability_authenticated_read
on public.room_unavailability
for select
to authenticated
using (deleted_at is null);

create policy room_unavailability_staff_write
on public.room_unavailability
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- ---------------------------------------------------------------------------
-- Historical coverage can be incomplete.
-- Current/future operational records still require class_id; only LEGACY_IMPORT
-- may preserve a null class. Keep a class snapshot for historical readability.
-- ---------------------------------------------------------------------------
alter table public.coverage_slots
  alter column class_id drop not null;

alter table public.coverage_slots
  add column if not exists class_name_snapshot text null;

-- Drop/recreate so this migration is rerunnable.
alter table public.coverage_slots
  drop constraint if exists coverage_slots_live_class_required_ck;

alter table public.coverage_slots
  add constraint coverage_slots_live_class_required_ck
  check (source = 'LEGACY_IMPORT' or class_id is not null);

commit;
