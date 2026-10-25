-- READ ONLY: run in Supabase SQL Editor AFTER 202610240001 migration.
-- Do NOT invoke the RPC from SQL Editor as postgres: it intentionally requires an authenticated staff session.
SELECT
  p.proname AS rpc_name,
  pg_get_function_identity_arguments(p.oid) AS signature,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='ejadwal_management_leave_days_v320';

-- Verify that the category source columns exist, without reading private reasons.
SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='leave_requests' AND column_name IN ('absence_category','teacher_id','status'))
    OR (table_name='coverage_slots' AND column_name IN ('absence_category','absent_teacher_id','source')))
ORDER BY table_name,column_name;
