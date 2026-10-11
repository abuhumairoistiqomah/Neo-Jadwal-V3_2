-- E-Jadwal V3.6.2 — Migration Hardening
-- Apply AFTER 202610070008_v3_6_1_legacy_exception_preservation.sql
--
-- A duplicate historical Log_Izin may legitimately have the same business
-- identity (date/class/JP/absent teacher) as another historical row. Those rows
-- are distinguished by legacy_log_id and must remain importable.
--
-- Operational V3 records are still protected from active duplicate coverage.

begin;

-- The V3.4 index was too broad for preserved legacy history.
drop index if exists public.coverage_slots_active_identity_uidx;

create unique index coverage_slots_active_identity_uidx
  on public.coverage_slots (schedule_date, class_id, period, absent_teacher_id)
  where deleted_at is null
    and absent_teacher_id is not null
    and status <> 'CANCELLED'
    and source <> 'LEGACY_IMPORT';

comment on index public.coverage_slots_active_identity_uidx is
  'Prevents duplicate active operational coverage; LEGACY_IMPORT history is keyed by legacy_log_id and may preserve duplicate business identities.';

commit;
