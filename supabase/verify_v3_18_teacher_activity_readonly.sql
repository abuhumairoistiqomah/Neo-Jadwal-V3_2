-- V3.18 READ-ONLY diagnostic: safe to run in Supabase SQL Editor.
-- IMPORTANT: do NOT call the RPC from SQL Editor: it checks auth.uid() and
-- requires a real signed-in ADMIN/WAKASEK browser session.
SELECT 'RPC V3.18 installed' AS check_name,
       to_regprocedure('public.ejadwal_teacher_effective_activity_v318(date,date)') IS NOT NULL AS ok
UNION ALL
SELECT 'Authenticated can execute',
       CASE WHEN to_regprocedure('public.ejadwal_teacher_effective_activity_v318(date,date)') IS NULL THEN FALSE
            ELSE has_function_privilege('authenticated', 'public.ejadwal_teacher_effective_activity_v318(date,date)', 'EXECUTE') END
UNION ALL
SELECT 'Anon cannot execute',
       CASE WHEN to_regprocedure('public.ejadwal_teacher_effective_activity_v318(date,date)') IS NULL THEN FALSE
            ELSE NOT has_function_privilege('anon', 'public.ejadwal_teacher_effective_activity_v318(date,date)', 'EXECUTE') END
UNION ALL
SELECT 'Original analytics still installed',
       to_regprocedure('public.ejadwal_management_analytics_v1(date,date)') IS NOT NULL;
