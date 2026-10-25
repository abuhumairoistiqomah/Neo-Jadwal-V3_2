-- E-JADWAL V3.20 RC1.6: Staff-only leave-day timeline for Management Analytics.
-- Day = unique teacher + calendar date. Never count one row per JP or class.
-- Supports date ranges up to 4 years for weekly/monthly/semester/year comparisons.
-- Classification follows the RC1.2 canonical priority: APPROVED > OFFICIAL_DUTY > LEGACY/MANUAL.
BEGIN;

CREATE OR REPLACE FUNCTION public.ejadwal_management_leave_days_v320(
  p_date_start date, p_date_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'STAFF_REQUIRED';
  END IF;
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end < p_date_start
    OR p_date_end - p_date_start > 1461
    OR p_date_end > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_RANGE';
  END IF;

  WITH raw AS (
    SELECT lr.teacher_id, lp.schedule_date AS day, lp.period,
      coalesce(lr.absence_category,'UNCLASSIFIED')::text AS category, 1 AS priority
    FROM public.leave_requests lr
    JOIN public.leave_request_periods lp ON lp.leave_request_id = lr.id
    WHERE lr.status = 'APPROVED' AND lr.deleted_at IS NULL
      AND lp.schedule_date BETWEEN p_date_start AND p_date_end

    UNION ALL

    SELECT coalesce(cs.absent_teacher_id, sc.teacher_id), cs.schedule_date, cs.period,
      'SCHOOL_DUTY'::text, 2
    FROM public.coverage_slots cs
    JOIN public.substitute_constraints sc ON sc.id = cs.official_duty_constraint_id
    WHERE cs.source = 'OFFICIAL_DUTY' AND cs.deleted_at IS NULL
      AND cs.status <> 'CANCELLED' AND sc.is_active AND sc.deleted_at IS NULL
      AND coalesce(cs.absent_teacher_id,sc.teacher_id) IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end

    UNION ALL

    SELECT coalesce(cs.absent_teacher_id, nm.teacher_id), cs.schedule_date, cs.period,
      coalesce(cs.absence_category,'UNCLASSIFIED')::text, 3
    FROM public.coverage_slots cs
    LEFT JOIN LATERAL (
      SELECT (array_agg(t.id))[1] AS teacher_id
      FROM public.teachers t
      WHERE lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) =
            lower(regexp_replace(trim(cs.absent_teacher_name_snapshot),'\s+',' ','g'))
      HAVING count(*)=1
    ) nm ON cs.absent_teacher_id IS NULL
    WHERE cs.source IN ('LEGACY_IMPORT','ADMIN_MANUAL')
      AND cs.deleted_at IS NULL AND cs.status <> 'CANCELLED'
      AND coalesce(cs.absent_teacher_id,nm.teacher_id) IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
  ), per_jp AS (
    SELECT DISTINCT ON (teacher_id, day, period)
      teacher_id, day, period, category
    FROM raw
    WHERE teacher_id IS NOT NULL AND period BETWEEN 0 AND 6
    ORDER BY teacher_id, day, period, priority, category
  ), teacher_day_category AS (
    SELECT DISTINCT p.teacher_id, t.full_name AS teacher_name, p.day, p.category
    FROM per_jp p
    JOIN public.teachers t ON t.id = p.teacher_id
    WHERE lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) <> 'guru belum ditentukan'
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'teacher_id',teacher_id,'teacher_name',teacher_name,'date',day,'category',category)
    ORDER BY day,teacher_id,category),'[]'::jsonb) INTO v_result
  FROM teacher_day_category;

  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.ejadwal_management_leave_days_v320(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_management_leave_days_v320(date,date) TO authenticated;
COMMIT;
