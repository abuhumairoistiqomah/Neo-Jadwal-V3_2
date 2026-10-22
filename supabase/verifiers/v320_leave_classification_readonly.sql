-- READ ONLY: V3.20 installation / category distribution
SELECT column_name,data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='leave_requests' AND column_name='absence_category';
SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace
WHERE n.nspname='public' AND proname IN ('ejadwal_submit_public_leave_request_v320',
 'ejadwal_submit_staff_leave_v320','ejadwal_teacher_leave_profile_v320',
 'ejadwal_set_leave_category_v320','ejadwal_leave_category_summary_v320');
SELECT absence_category,COUNT(*) AS requests
FROM public.leave_requests WHERE deleted_at IS NULL GROUP BY absence_category ORDER BY absence_category;
