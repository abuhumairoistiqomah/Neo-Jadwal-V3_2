-- RC1.4 read-only verifier. No DB mutation; safe to run in staging/prod.
select
  'waiting_approval_subject_rpc' as pemeriksaan,
  to_regprocedure('public.ejadwal_assign_waiting_badal_v320_rc14(jsonb,text)') is not null as rpc_exists,
  has_function_privilege('authenticated','public.ejadwal_assign_waiting_badal_v320_rc14(jsonb,text)','EXECUTE') as authenticated_can_execute;

select
  'prerequisite_legacy_assign_and_rc13' as pemeriksaan,
  to_regprocedure('public.ejadwal_replace_inval_substitute_v1(uuid,uuid,uuid[],text)') is not null as legacy_substitute_writer_exists,
  to_regprocedure('public.ejadwal_save_inval_bundle_v320_rc13(jsonb,jsonb,text)') is not null as rc13_admin_writer_exists;

-- Recent slot count only: do not expose private reasons or tasks.
select
  source, status, count(*) as jp_records
from public.coverage_slots
where deleted_at is null and source = 'LEAVE_WORKFLOW'
group by source,status
order by source,status;
