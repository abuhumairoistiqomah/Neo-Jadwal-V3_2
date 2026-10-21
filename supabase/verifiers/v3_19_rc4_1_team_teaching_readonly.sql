-- Read-only presence/sanity check. Run as DB admin in Supabase SQL Editor.
select
  to_regprocedure('public.ejadwal_acknowledge_official_duty_team_teaching_v319(uuid,date,smallint,uuid)') is not null as no_badal_rpc_installed,
  to_regprocedure('public.ejadwal_reopen_official_duty_team_teaching_v319(uuid)') is not null as correction_rpc_installed,
  exists (select 1 from pg_constraint where conrelid='public.coverage_slots'::regclass
    and conname='coverage_slots_status_check'
    and pg_get_constraintdef(oid) like '%NO_SUBSTITUTE%') as coverage_accepts_no_substitute;

select schedule_date, period, class_name_snapshot, absent_teacher_name_snapshot,
  status, substitute_teacher_id, substitute_teacher_name_snapshot,
  official_duty_constraint_id
from public.coverage_slots
where source='OFFICIAL_DUTY' and status='NO_SUBSTITUTE' and deleted_at is null
order by schedule_date desc, class_name_snapshot, period limit 50;
