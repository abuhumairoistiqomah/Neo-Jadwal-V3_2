-- E-Jadwal V3.6 — Legacy Spreadsheet migration support
-- Adds stable legacy row keys so the staging migration can be re-run safely.

begin;

alter table public.teachers
  add column if not exists legacy_row_id text null;

alter table public.academic_events
  add column if not exists legacy_row_id text null;

create unique index if not exists teachers_legacy_row_id_uidx
  on public.teachers (legacy_row_id);

create unique index if not exists schedule_master_legacy_row_id_uidx
  on public.schedule_master (legacy_row_id);

create unique index if not exists schedule_incidentals_legacy_row_id_uidx
  on public.schedule_incidentals (legacy_row_id);

create unique index if not exists academic_events_legacy_row_id_uidx
  on public.academic_events (legacy_row_id);

create unique index if not exists coverage_slots_legacy_log_id_uidx
  on public.coverage_slots (legacy_log_id);

commit;
