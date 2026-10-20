-- E-JADWAL V3.18 — staff-only effective-teaching/leave metrics.
-- This RPC is separate from management_analytics_v1 so existing KPI and graphs are unchanged.
-- Required: migrations through V3.17.3 (especially leave_requests.deleted_at).
-- JP measures are operational schedule-derived, NOT proof of physical attendance.
-- JP0, approved FREE periods and non-teaching official duties do not increase the JP denominator.
-- One teacher/date/period = at most one counted JP, including combined classes.
BEGIN;

CREATE OR REPLACE FUNCTION public.ejadwal_teacher_effective_activity_v318(
  p_date_start date,
  p_date_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN
    RAISE EXCEPTION 'STAFF_REQUIRED';
  END IF;
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end < p_date_start
    OR (p_date_end - p_date_start) > 730 THEN
    RAISE EXCEPTION 'ANALYTICS_DATE_RANGE_INVALID';
  END IF;

  WITH
  dates AS (
    SELECT gs::date AS schedule_date,
           extract(isodow FROM gs)::smallint AS day_of_week
    FROM generate_series(p_date_start, p_date_end, interval '1 day') gs
    WHERE extract(isodow FROM gs) BETWEEN 1 AND 5
  ),
  master_ranked AS (
    SELECT d.schedule_date, sm.id AS schedule_id, sm.class_id, sm.period,
           sm.subject, sm.other_teachers_supervise,
           row_number() over (PARTITION BY d.schedule_date, sm.class_id, sm.period ORDER BY sm.id) AS rn
    FROM dates d
    JOIN public.schedule_master sm ON sm.day_of_week=d.day_of_week
      AND sm.is_active=true AND sm.deleted_at IS NULL AND sm.period BETWEEN 1 AND 6
  ),
  -- Preserve distinct master rows when no date override exists. A date override
  -- replaces the whole class/date/JP group once, matching effectiveSchedule.ts.
  master_slots AS (SELECT * FROM master_ranked),
  incidental_ranked AS (
    SELECT si.*,
           row_number() over (PARTITION BY si.schedule_date,si.class_id,si.period
                              ORDER BY si.updated_at DESC,si.id DESC) AS rn
    FROM public.schedule_incidentals si
    WHERE si.schedule_date BETWEEN p_date_start AND p_date_end
      AND si.deleted_at IS NULL AND si.period BETWEEN 1 AND 6
  ),
  incidental_slots AS (SELECT * FROM incidental_ranked WHERE rn=1),
  effective_sessions AS (
    SELECT ms.schedule_date, ms.class_id, ms.period,ms.schedule_id,
           si.id AS incidental_id,
           coalesce(nullif(trim(si.override_subject),''),ms.subject) AS subject,
           ms.other_teachers_supervise,
           si.reason AS incidental_reason,si.incidental_type,
           EXISTS (SELECT 1 FROM public.schedule_incidental_teacher_overrides ito
                   WHERE ito.incidental_id=si.id) AS teacher_team_replaced
    FROM master_slots ms
    LEFT JOIN incidental_slots si ON si.schedule_date=ms.schedule_date
      AND si.class_id=ms.class_id AND si.period=ms.period
    WHERE si.id IS NULL OR ms.rn=1
    UNION ALL
    SELECT si.schedule_date,si.class_id,si.period,null::uuid AS schedule_id,
           si.id AS incidental_id,coalesce(si.override_subject,'') AS subject,
           false AS other_teachers_supervise,
           si.reason,si.incidental_type,
           EXISTS (SELECT 1 FROM public.schedule_incidental_teacher_overrides ito
                   WHERE ito.incidental_id=si.id)
    FROM incidental_slots si
    WHERE NOT EXISTS (SELECT 1 FROM master_slots ms
                      WHERE ms.schedule_date=si.schedule_date
                        AND ms.class_id=si.class_id AND ms.period=si.period)
  ),
  active_sessions AS (
    SELECT e.*
    FROM effective_sessions e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.academic_events ae
      WHERE ae.status='ACTIVE' AND e.schedule_date BETWEEN ae.date_start AND ae.date_end
        AND (ae.scope='ALL' OR (ae.scope='CLASS' AND ae.class_id=e.class_id))
        AND (ae.period_start IS NULL OR e.period BETWEEN ae.period_start AND ae.period_end)
        AND (
          -- A dated explicit teacher-team replacement can teach during a
          -- non-holiday calendar closure; master/room-only cannot.
          concat_ws(' ',ae.event_name,ae.event_type) ~* 'libur|holiday|cuti bersama'
          OR e.incidental_id IS NULL OR NOT e.teacher_team_replaced
          OR NOT EXISTS (SELECT 1 FROM public.schedule_incidental_teacher_overrides ito
                         WHERE ito.incidental_id=e.incidental_id AND ito.action='SET'
                           AND ito.teacher_id IS NOT NULL)
        )
    )
  ),
  instructional_sessions AS (
    SELECT e.*
    FROM active_sessions e
    -- Incidental roles such as exam invigilation are NOT instructional JP.
    -- This is based on explicit operational note/type, not on 'TO' in a subject name.
    WHERE NOT (
      coalesce(e.incidental_reason,'') ~* '\m(mengawas|pengawas|panitia|piket|rapat|seminar|outing)\M'
      OR coalesce(e.incidental_type,'') ~* '\m(mengawas|pengawas|panitia|piket|rapat|seminar|outing)\M'
    )
  ),
  scheduled_teaching AS (
    SELECT DISTINCT assigned.teacher_id, s.schedule_date, s.period
    FROM instructional_sessions s
    JOIN LATERAL (
      SELECT smt.teacher_id,smt.position
      FROM public.schedule_master_teachers smt
      WHERE smt.schedule_id=s.schedule_id
        AND NOT s.teacher_team_replaced
      UNION ALL
      SELECT ito.teacher_id,ito.position
      FROM public.schedule_incidental_teacher_overrides ito
      WHERE ito.incidental_id=s.incidental_id AND s.teacher_team_replaced
        AND ito.action='SET'
    ) assigned ON assigned.teacher_id IS NOT NULL
    WHERE (assigned.position=1 OR NOT s.other_teachers_supervise
           OR s.subject ~* 'qur.?an|tahsin')
  ),
  substitute_teaching AS (
    SELECT DISTINCT cs.substitute_teacher_id AS teacher_id,cs.schedule_date,cs.period
    FROM public.coverage_slots cs
    WHERE cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND cs.period BETWEEN 1 AND 6
      AND cs.status IN ('ASSIGNED','COMPLETED') AND cs.deleted_at IS NULL
      AND cs.substitute_teacher_id IS NOT NULL
  ),
  -- Include legacy/admin absence only where it represents an actual absent teacher;
  -- OFFICIAL_DUTY is a separate operational reason, never 'JP izin'.
  legacy_absence AS (
    SELECT DISTINCT cs.absent_teacher_id AS teacher_id,cs.schedule_date,cs.period
    FROM public.coverage_slots cs
    WHERE cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND cs.period BETWEEN 1 AND 6 AND cs.deleted_at IS NULL
      AND cs.status <> 'CANCELLED'
      AND cs.source IN ('LEGACY_IMPORT','ADMIN_MANUAL')
      AND cs.absent_teacher_id IS NOT NULL
  ),
  approved_leave AS (
    SELECT DISTINCT lr.teacher_id,lp.schedule_date,lp.period,lp.period_type
    FROM public.leave_request_periods lp
    JOIN public.leave_requests lr ON lr.id=lp.leave_request_id
    WHERE lr.status='APPROVED' AND lr.deleted_at IS NULL
      AND lp.schedule_date BETWEEN p_date_start AND p_date_end
  ),
  leave_jp AS (
    SELECT teacher_id,schedule_date,period
    FROM approved_leave WHERE period_type='TEACHING' AND period BETWEEN 1 AND 6
    UNION
    SELECT teacher_id,schedule_date,period FROM legacy_absence
  ),
  leave_days AS (
    SELECT teacher_id,schedule_date FROM approved_leave
    UNION
    SELECT teacher_id,schedule_date FROM legacy_absence
  ),
  official_duty_blocks AS (
    SELECT sc.teacher_id,d.schedule_date,p.period
    FROM public.substitute_constraints sc
    JOIN dates d ON (
      (sc.constraint_type='DATE' AND sc.specific_date=d.schedule_date)
      OR (sc.constraint_type='WEEKLY'
        AND (sc.day_of_week IS NULL OR sc.day_of_week=d.day_of_week)
        AND (sc.valid_from IS NULL OR sc.valid_from<=d.schedule_date)
        AND (sc.valid_until IS NULL OR sc.valid_until>=d.schedule_date))
    )
    CROSS JOIN LATERAL generate_series(1,6) AS p(period)
    WHERE sc.is_active AND sc.deleted_at IS NULL AND sc.blocks_normal_teaching
      AND p.period BETWEEN sc.period_start AND sc.period_end
  ),
  missed_coverage AS (
    SELECT DISTINCT cs.absent_teacher_id AS teacher_id,cs.schedule_date,cs.period
    FROM public.coverage_slots cs
    WHERE cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND cs.period BETWEEN 1 AND 6 AND cs.deleted_at IS NULL
      AND cs.status <> 'CANCELLED' AND cs.absent_teacher_id IS NOT NULL
  ),
  -- Explicit non-instructional dated duties take precedence over a base teaching
  -- slot on that date/JP; don't count invigilation as teaching.
  nonteaching_incidental AS (
    SELECT DISTINCT assigned.teacher_id,s.schedule_date,s.period
    FROM active_sessions s
    JOIN LATERAL (
      SELECT ito.teacher_id FROM public.schedule_incidental_teacher_overrides ito
      WHERE ito.incidental_id=s.incidental_id AND ito.action='SET'
    ) assigned ON assigned.teacher_id IS NOT NULL
    WHERE (coalesce(s.incidental_reason,'') ~* '\m(mengawas|pengawas|panitia|piket|rapat|seminar|outing)\M'
        OR coalesce(s.incidental_type,'') ~* '\m(mengawas|pengawas|panitia|piket|rapat|seminar|outing)\M')
  ),
  teaching_units AS (
    SELECT DISTINCT candidate.teacher_id,candidate.schedule_date,candidate.period
    FROM (
      SELECT * FROM scheduled_teaching
      UNION ALL
      SELECT * FROM substitute_teaching
    ) candidate
    WHERE NOT EXISTS (SELECT 1 FROM approved_leave a
      WHERE a.teacher_id=candidate.teacher_id AND a.schedule_date=candidate.schedule_date AND a.period=candidate.period)
      AND NOT EXISTS (SELECT 1 FROM legacy_absence a
      WHERE a.teacher_id=candidate.teacher_id AND a.schedule_date=candidate.schedule_date AND a.period=candidate.period)
      AND NOT EXISTS (SELECT 1 FROM official_duty_blocks b
      WHERE b.teacher_id=candidate.teacher_id AND b.schedule_date=candidate.schedule_date AND b.period=candidate.period)
      AND NOT EXISTS (SELECT 1 FROM missed_coverage a
      WHERE a.teacher_id=candidate.teacher_id AND a.schedule_date=candidate.schedule_date AND a.period=candidate.period)
      AND NOT EXISTS (SELECT 1 FROM nonteaching_incidental a
      WHERE a.teacher_id=candidate.teacher_id AND a.schedule_date=candidate.schedule_date AND a.period=candidate.period)
  ),
  teacher_counts AS (
    SELECT t.id AS teacher_id,
      (SELECT count(*)::int FROM teaching_units x WHERE x.teacher_id=t.id) AS effective_teaching_jp,
      (SELECT count(*)::int FROM leave_jp x WHERE x.teacher_id=t.id) AS leave_jp,
      (SELECT count(DISTINCT x.schedule_date)::int FROM teaching_units x WHERE x.teacher_id=t.id) AS effective_teaching_days,
      (SELECT count(DISTINCT x.schedule_date)::int FROM leave_days x WHERE x.teacher_id=t.id) AS leave_days
    FROM public.teachers t
    WHERE t.is_active
      OR EXISTS(SELECT 1 FROM teaching_units x WHERE x.teacher_id=t.id)
      OR EXISTS(SELECT 1 FROM leave_days x WHERE x.teacher_id=t.id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'teacher_id',teacher_id,
    'effective_teaching_jp',effective_teaching_jp,
    'leave_jp',leave_jp,
    'effective_teaching_days',effective_teaching_days,
    'leave_days',leave_days
  ) ORDER BY teacher_id),'[]'::jsonb) INTO v_result FROM teacher_counts;

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ejadwal_teacher_effective_activity_v318(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_teacher_effective_activity_v318(date,date) TO authenticated;
COMMIT;
