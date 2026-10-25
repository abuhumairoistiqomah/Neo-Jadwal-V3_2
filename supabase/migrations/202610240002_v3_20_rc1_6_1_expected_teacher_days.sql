-- V3.20 RC1.6.1: denominator for director's leave-day ratio.
-- "Guru-hari kewajiban terjadwal" is an ESTIMATE, not presence/attendance data.
-- Each teacher/date is counted once: master teaching assignment during an active
-- operational term, explicit dated teacher override, explicit official duty, or
-- a recorded leave day. A teacher does NOT implicitly work every weekday.
-- Current master has no historical valid-from/to; ratios are indicative only.
BEGIN;
CREATE OR REPLACE FUNCTION public.ejadwal_management_expected_teacher_days_v320(
  p_date_start date, p_date_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'STAFF_REQUIRED';
  END IF;
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end < p_date_start
    OR p_date_end-p_date_start > 1461
    OR p_date_end > (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_RANGE';
  END IF;

  WITH
  term_dates AS (
    SELECT DISTINCT day::date AS schedule_date,
      extract(isodow FROM day)::smallint AS weekday
    FROM generate_series(p_date_start,p_date_end,interval '1 day') AS days(day)
    JOIN public.ejadwal_operational_terms term
      ON term.is_active AND day::date BETWEEN term.kbm_start AND term.kbm_end
      AND extract(isodow FROM day)::smallint = ANY(term.weekdays)
  ),
  leave_days AS (
    -- Reuse the exact approved > official duty > imported precedence used by
    -- the chart: duplicate classes/JP/categories never inflate the denominator.
    SELECT DISTINCT (item->>'teacher_id')::uuid AS teacher_id,
      (item->>'date')::date AS schedule_date
    FROM jsonb_array_elements(public.ejadwal_management_leave_days_v320(
      p_date_start,p_date_end)) AS leaves(item)
  ),
  assigned_duty_days AS (
    SELECT DISTINCT a.teacher_id, day::date AS schedule_date
    FROM public.ejadwal_teacher_duty_events_v319 e
    JOIN public.ejadwal_teacher_duty_assignments_v319 a ON a.event_id=e.id
    CROSS JOIN LATERAL generate_series(greatest(e.date_start,p_date_start),
      least(e.date_end,p_date_end),interval '1 day') AS dates(day)
    WHERE e.status='ACTIVE' AND e.date_end>=p_date_start AND e.date_start<=p_date_end
  ),
  leave_outside_term AS (
    SELECT count(*)::integer AS n FROM leave_days l
    WHERE NOT EXISTS (SELECT 1 FROM term_dates d WHERE d.schedule_date=l.schedule_date)
      AND NOT EXISTS (SELECT 1 FROM assigned_duty_days a
        WHERE a.teacher_id=l.teacher_id AND a.schedule_date=l.schedule_date)
  ),
  compensatory_off AS (
    SELECT a.teacher_id, a.compensation_date AS schedule_date
    FROM public.ejadwal_teacher_duty_assignments_v319 a
    JOIN public.ejadwal_teacher_duty_events_v319 e ON e.id=a.event_id
    WHERE e.status='ACTIVE' AND a.duty_role<>'REMAINS_ON_DUTY'
      AND a.compensation_date BETWEEN p_date_start AND p_date_end
  ),
  master_days AS (
    SELECT DISTINCT smt.teacher_id, d.schedule_date
    FROM term_dates d
    JOIN public.schedule_master sm ON sm.day_of_week=d.weekday
      AND sm.is_active AND sm.deleted_at IS NULL AND sm.period BETWEEN 0 AND 6
    JOIN public.schedule_master_teachers smt ON smt.schedule_id=sm.id
      AND smt.teacher_id IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT si.id FROM public.schedule_incidentals si
      WHERE si.schedule_date=d.schedule_date AND si.class_id=sm.class_id
        AND si.period=sm.period AND si.deleted_at IS NULL
      ORDER BY si.updated_at DESC,si.id DESC LIMIT 1
    ) latest_si ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.academic_events ae
      WHERE ae.status='ACTIVE' AND d.schedule_date BETWEEN ae.date_start AND ae.date_end
        AND (ae.scope='ALL' OR (ae.scope='CLASS' AND ae.class_id=sm.class_id))
        AND (ae.period_start IS NULL OR sm.period BETWEEN ae.period_start AND ae.period_end)
        AND concat_ws(' ',ae.event_name,ae.event_type) ~* 'libur|holiday|cuti bersama'
    )
    AND NOT EXISTS (SELECT 1 FROM compensatory_off offday
      WHERE offday.teacher_id=smt.teacher_id AND offday.schedule_date=d.schedule_date)
    AND (latest_si.id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.schedule_incidental_teacher_overrides ito
        WHERE ito.incidental_id=latest_si.id)
      OR EXISTS (SELECT 1 FROM public.schedule_incidental_teacher_overrides ito
        WHERE ito.incidental_id=latest_si.id AND ito.action='SET'
          AND ito.teacher_id=smt.teacher_id))
  ),
  dated_days AS (
    SELECT DISTINCT ito.teacher_id,si.schedule_date
    FROM public.schedule_incidentals si
    JOIN public.schedule_incidental_teacher_overrides ito ON ito.incidental_id=si.id
      AND ito.action='SET' AND ito.teacher_id IS NOT NULL
    JOIN term_dates d ON d.schedule_date=si.schedule_date
    WHERE si.deleted_at IS NULL AND si.period BETWEEN 0 AND 6
      AND NOT EXISTS (SELECT 1 FROM public.schedule_incidentals newer
        WHERE newer.schedule_date=si.schedule_date AND newer.class_id=si.class_id
          AND newer.period=si.period AND newer.deleted_at IS NULL
          AND (newer.updated_at,newer.id)>(si.updated_at,si.id))
      AND NOT EXISTS (SELECT 1 FROM compensatory_off offday
        WHERE offday.teacher_id=ito.teacher_id AND offday.schedule_date=si.schedule_date)
  ),
  expected AS (
    SELECT teacher_id,schedule_date FROM master_days
    UNION SELECT teacher_id,schedule_date FROM dated_days
    UNION SELECT teacher_id,schedule_date FROM assigned_duty_days
    UNION SELECT teacher_id,schedule_date FROM leave_days
  ),
  eligible AS (
    SELECT e.teacher_id,e.schedule_date
    FROM expected e JOIN public.teachers t ON t.id=e.teacher_id
    WHERE lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) <> 'guru belum ditentukan'
  )
  SELECT jsonb_build_object(
    'expected_teacher_days',(SELECT count(*)::integer FROM eligible),
    'calendar_term_days',(SELECT count(*)::integer FROM term_dates),
    'leave_days_outside_calendar',(SELECT n FROM leave_outside_term),
    'status',CASE
      WHEN NOT EXISTS (SELECT 1 FROM term_dates) THEN 'UNAVAILABLE'
      WHEN (SELECT n FROM leave_outside_term)>0 THEN 'PARTIAL'
      ELSE 'ESTIMATED' END
  ) INTO v_result;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.ejadwal_management_expected_teacher_days_v320(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_management_expected_teacher_days_v320(date,date) TO authenticated;
COMMIT;
