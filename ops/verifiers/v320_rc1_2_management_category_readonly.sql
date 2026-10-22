-- E-JADWAL V3.20 RC1.2 — post-migration READ ONLY verification
-- Run as a sufficiently privileged SQL Editor user in STAGING / after migration.
-- Does not invoke staff-only RPC without an authenticated session.
SELECT 'category_column_ready' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='coverage_slots'
      AND column_name='absence_category') AS ok
UNION ALL
SELECT 'per_teacher_category_rpc_ready',
  to_regprocedure('public.ejadwal_leave_category_teacher_activity_v320(date,date)') IS NOT NULL
UNION ALL
SELECT 'category_summary_rpc_ready',
  to_regprocedure('public.ejadwal_leave_category_summary_v320(date,date,uuid)') IS NOT NULL
UNION ALL
SELECT 'anonymous_cannot_execute_teacher_rpc',
  NOT has_function_privilege('anon','public.ejadwal_leave_category_teacher_activity_v320(date,date)','EXECUTE')
UNION ALL
SELECT 'staff_auth_can_execute_teacher_rpc',
  has_function_privilege('authenticated','public.ejadwal_leave_category_teacher_activity_v320(date,date)','EXECUTE');

-- Check Dinsya's underlying coverage source on 22 Oct without inventing absent JP.
-- Duplicate rows across classes are possible; table display must aggregate teacher/date/JP.
SELECT cs.schedule_date,cs.period,cs.source,cs.status,
  cs.absence_category,
  cs.official_duty_constraint_id IS NOT NULL AS linked_official_duty,
  count(*) AS coverage_rows
FROM public.coverage_slots cs
LEFT JOIN public.teachers t ON t.id=cs.absent_teacher_id
WHERE (t.full_name ILIKE 'DINSYA ARIFA%'
   OR (cs.absent_teacher_id IS NULL AND cs.absent_teacher_name_snapshot ILIKE 'DINSYA ARIFA%'))
  AND cs.schedule_date='2026-10-22'
  AND cs.deleted_at IS NULL AND cs.status<>'CANCELLED'
GROUP BY cs.schedule_date,cs.period,cs.source,cs.status,
  cs.absence_category,cs.official_duty_constraint_id IS NOT NULL
ORDER BY cs.period,cs.source;

-- Independently check if absence derives from an approved leave request instead.
SELECT lr.date_start,lp.schedule_date,lp.period,lr.status,lr.absence_category
FROM public.leave_requests lr
JOIN public.leave_request_periods lp ON lp.leave_request_id=lr.id
JOIN public.teachers t ON t.id=lr.teacher_id
WHERE t.full_name ILIKE 'DINSYA ARIFA%'
  AND lp.schedule_date='2026-10-22'
  AND lr.status='APPROVED' AND lr.deleted_at IS NULL
ORDER BY lp.period;
