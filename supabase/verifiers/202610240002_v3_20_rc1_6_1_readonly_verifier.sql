-- RC1.6.1 verification (READ ONLY): run as admin in Supabase SQL Editor.
-- RPC is staff-auth-gated, so it is not invoked here as postgres.
SELECT p.proname AS rpc_name, pg_get_function_identity_arguments(p.oid) AS signature,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='ejadwal_management_expected_teacher_days_v320';
SELECT term_code,kbm_start,kbm_end,weekdays,is_active
FROM public.ejadwal_operational_terms ORDER BY kbm_start DESC;
