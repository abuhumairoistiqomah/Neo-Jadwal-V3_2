-- E-JADWAL V3.20 RC1.2 — Management teacher category report
-- Requires V3.20 original migration AND historical coverage_slots.absence_category backfill.
-- This migration does not modify leave/badal records, absence classification or master schedules.
-- Run in staging first. Supabase staff-only, no guest access to personal reasons.
BEGIN;
-- Do not overwrite historical category values already corrected in Supabase.
ALTER TABLE public.coverage_slots
  ADD COLUMN IF NOT EXISTS absence_category text NOT NULL DEFAULT 'UNCLASSIFIED';
CREATE OR REPLACE FUNCTION public.ejadwal_leave_category_summary_v320(
  p_date_start date,p_date_end date,p_teacher_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end<p_date_start
     OR p_date_end-p_date_start>180 OR p_date_end>(now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_RANGE';
  END IF;
  WITH raw AS (
    SELECT lr.teacher_id,lp.schedule_date AS date,lp.period,
      lp.period_type::text AS period_type,lr.absence_category AS category,1 AS priority
    FROM public.leave_requests lr JOIN public.leave_request_periods lp ON lp.leave_request_id=lr.id
    WHERE lr.status='APPROVED' AND lr.deleted_at IS NULL
      AND lp.schedule_date BETWEEN p_date_start AND p_date_end
      AND (p_teacher_id IS NULL OR lr.teacher_id=p_teacher_id)
    UNION ALL
    SELECT coalesce(cs.absent_teacher_id,sc.teacher_id),cs.schedule_date,cs.period,'TEACHING'::text,'SCHOOL_DUTY'::text,2
    FROM public.coverage_slots cs JOIN public.substitute_constraints sc ON sc.id=cs.official_duty_constraint_id
    WHERE cs.source='OFFICIAL_DUTY' AND cs.deleted_at IS NULL AND cs.status<>'CANCELLED'
      AND sc.is_active AND sc.deleted_at IS NULL AND coalesce(cs.absent_teacher_id,sc.teacher_id) IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND (p_teacher_id IS NULL OR cs.absent_teacher_id=p_teacher_id)
    UNION ALL
    SELECT coalesce(cs.absent_teacher_id,nm.teacher_id),cs.schedule_date,cs.period,
      'TEACHING'::text,coalesce(cs.absence_category,'UNCLASSIFIED')::text,3
    FROM public.coverage_slots cs
    -- Older GDrive imports sometimes have only a teacher-name snapshot.
    -- Resolve a *unique* exact normalized name; ambiguous names stay unattributed.
    LEFT JOIN LATERAL (
      SELECT (array_agg(t.id))[1] AS teacher_id
      FROM public.teachers t
      WHERE lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) =
            lower(regexp_replace(trim(cs.absent_teacher_name_snapshot),'\s+',' ','g'))
      HAVING count(*)=1
    ) nm ON cs.absent_teacher_id IS NULL
    WHERE cs.source IN ('LEGACY_IMPORT','ADMIN_MANUAL') AND cs.deleted_at IS NULL
      AND cs.status <> 'CANCELLED' AND coalesce(cs.absent_teacher_id,nm.teacher_id) IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND (p_teacher_id IS NULL OR cs.absent_teacher_id=p_teacher_id)
  ), unique_units AS (
    SELECT DISTINCT ON (teacher_id,date,period) teacher_id,date,period,period_type,category
    FROM raw
    WHERE teacher_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.teachers t
        WHERE t.id=raw.teacher_id
          AND lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) <> 'guru belum ditentukan'
      )
    ORDER BY teacher_id,date,period,priority
  ), grouped AS (
    SELECT category,COUNT(*)::int AS jp_total,
      COUNT(*) FILTER(WHERE period>0 AND period_type='TEACHING')::int AS jp_teaching,
      COUNT(*) FILTER(WHERE period=0 OR period_type='FREE')::int AS jp_other,
      COUNT(DISTINCT date)::int AS days,COUNT(DISTINCT teacher_id)::int AS teachers
    FROM unique_units GROUP BY category
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('category',category,'total_jp',jp_total,
    'teaching_jp',jp_teaching,'other_jp',jp_other,'days',days,'teachers',teachers)
    ORDER BY category),'[]'::jsonb) INTO v_result FROM grouped;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_leave_category_summary_v320(date,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_leave_category_summary_v320(date,date,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.ejadwal_teacher_leave_profile_v320(
  p_teacher_id uuid,p_date_start date,p_date_end date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_base jsonb; v_units jsonb; v_duties jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  v_base := public.ejadwal_teacher_leave_profile_v2(p_teacher_id,p_date_start,p_date_end);
  SELECT coalesce(jsonb_agg(u.value || jsonb_build_object('absence_category',
    CASE WHEN u.value->>'source'='APPROVED' THEN coalesce((
      SELECT lr.absence_category FROM public.leave_request_periods lp
      JOIN public.leave_requests lr ON lr.id=lp.leave_request_id
      WHERE lr.teacher_id=p_teacher_id AND lr.status='APPROVED' AND lr.deleted_at IS NULL
        AND lp.schedule_date=(u.value->>'date')::date
        AND lp.period=(u.value->>'period')::integer
      ORDER BY lr.decided_at DESC NULLS LAST,lr.created_at DESC LIMIT 1), 'UNCLASSIFIED')
    ELSE coalesce((
      SELECT cs.absence_category
      FROM public.coverage_slots cs
      WHERE (cs.absent_teacher_id=p_teacher_id OR (
          cs.absent_teacher_id IS NULL AND EXISTS (
            SELECT 1 FROM public.teachers t WHERE t.id=p_teacher_id
              AND lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) =
                  lower(regexp_replace(trim(cs.absent_teacher_name_snapshot),'\s+',' ','g'))
              AND (SELECT count(*) FROM public.teachers exact_names
                  WHERE lower(regexp_replace(trim(exact_names.full_name),'\s+',' ','g')) =
                        lower(regexp_replace(trim(cs.absent_teacher_name_snapshot),'\s+',' ','g'))) = 1
          )))
        AND cs.schedule_date=(u.value->>'date')::date
        AND cs.period=(u.value->>'period')::integer
        AND cs.source IN ('LEGACY_IMPORT','ADMIN_MANUAL')
        AND cs.deleted_at IS NULL AND cs.status <> 'CANCELLED'
      ORDER BY CASE WHEN cs.absence_category='UNCLASSIFIED' THEN 1 ELSE 0 END,
        cs.updated_at DESC NULLS LAST LIMIT 1), 'UNCLASSIFIED') END
  ) ORDER BY u.value->>'date',(u.value->>'period')::integer),'[]'::jsonb)
  INTO v_units FROM jsonb_array_elements(coalesce(v_base->'units','[]'::jsonb)) u(value)
  WHERE u.value->>'source' <> 'APPROVED' OR EXISTS (
    SELECT 1 FROM public.leave_request_periods lp
    JOIN public.leave_requests lr ON lr.id=lp.leave_request_id
    WHERE lr.teacher_id=p_teacher_id AND lr.status='APPROVED' AND lr.deleted_at IS NULL
      AND lp.schedule_date=(u.value->>'date')::date
      AND lp.period=(u.value->>'period')::integer
  );
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'date',d.schedule_date,'period',d.period,'period_type','TEACHING',
    'reason',d.reason,'source','OFFICIAL_DUTY','request_type','UNKNOWN',
    'absence_category','SCHOOL_DUTY') ORDER BY d.schedule_date,d.period),'[]'::jsonb)
  INTO v_duties FROM (
    SELECT DISTINCT ON (cs.schedule_date,cs.period)
      cs.schedule_date,cs.period,coalesce(nullif(trim(cs.reason_snapshot),''),sc.reason,'Tugas Sekolah') AS reason
    FROM public.coverage_slots cs
    JOIN public.substitute_constraints sc ON sc.id=cs.official_duty_constraint_id
    WHERE cs.source='OFFICIAL_DUTY' AND cs.absent_teacher_id=p_teacher_id
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end AND cs.period BETWEEN 0 AND 6
      AND cs.deleted_at IS NULL AND cs.status <> 'CANCELLED'
      AND sc.deleted_at IS NULL AND sc.is_active
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_units) u
        WHERE u.value->>'date'=cs.schedule_date::text AND (u.value->>'period')::int=cs.period)
    ORDER BY cs.schedule_date,cs.period,cs.updated_at DESC
  ) d;
  RETURN jsonb_set(v_base,'{units}',v_units || v_duties,true);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_teacher_leave_profile_v320(uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_teacher_leave_profile_v320(uuid,date,date) TO authenticated;

-- Aggregation for management. One unique teacher/date/JP, never a per-class sum.
-- A request's stated category requires APPROVED status; incidental official duty
-- has its own verified origin and never manufactures a personal leave request.
-- RC1.2: per-teacher category activity. V3.18 remains source of *effective teaching*;
-- this RPC supplies unavailable-to-teach JP/days including official school duty.
-- One key per teacher/date/JP, priority APPROVED > OFFICIAL_DUTY > legacy/manual.
-- ALL recomputes distinct days/JP directly and never sums overlapping day counters.
CREATE OR REPLACE FUNCTION public.ejadwal_leave_category_teacher_activity_v320(
  p_date_start date,p_date_end date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end<p_date_start
    OR p_date_end-p_date_start>180 OR p_date_end>(now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RAISE EXCEPTION 'INVALID_ANALYTICS_RANGE';
  END IF;
  WITH raw AS (
    SELECT lr.teacher_id,lp.schedule_date AS date,lp.period,
      lp.period_type::text AS period_type,lr.absence_category AS category,1 AS priority
    FROM public.leave_requests lr JOIN public.leave_request_periods lp ON lp.leave_request_id=lr.id
    WHERE lr.status='APPROVED' AND lr.deleted_at IS NULL
      AND lp.schedule_date BETWEEN p_date_start AND p_date_end
    UNION ALL
    SELECT coalesce(cs.absent_teacher_id,sc.teacher_id),cs.schedule_date,cs.period,'TEACHING'::text,'SCHOOL_DUTY'::text,2
    FROM public.coverage_slots cs JOIN public.substitute_constraints sc ON sc.id=cs.official_duty_constraint_id
    WHERE cs.source='OFFICIAL_DUTY' AND cs.deleted_at IS NULL AND cs.status<>'CANCELLED'
      AND sc.is_active AND sc.deleted_at IS NULL AND coalesce(cs.absent_teacher_id,sc.teacher_id) IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
    UNION ALL
    SELECT coalesce(cs.absent_teacher_id,nm.teacher_id),cs.schedule_date,cs.period,
      'TEACHING'::text,coalesce(cs.absence_category,'UNCLASSIFIED')::text,3
    FROM public.coverage_slots cs
    -- Older GDrive imports sometimes have only a teacher-name snapshot.
    -- Resolve a *unique* exact normalized name; ambiguous names stay unattributed.
    LEFT JOIN LATERAL (
      SELECT (array_agg(t.id))[1] AS teacher_id
      FROM public.teachers t
      WHERE lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) =
            lower(regexp_replace(trim(cs.absent_teacher_name_snapshot),'\s+',' ','g'))
      HAVING count(*)=1
    ) nm ON cs.absent_teacher_id IS NULL
    WHERE cs.source IN ('LEGACY_IMPORT','ADMIN_MANUAL') AND cs.deleted_at IS NULL
      AND cs.status <> 'CANCELLED' AND coalesce(cs.absent_teacher_id,nm.teacher_id) IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
  ), unique_units AS (
    SELECT DISTINCT ON (teacher_id,date,period) teacher_id,date,period,period_type,category
    FROM raw
    WHERE teacher_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.teachers t
        WHERE t.id=raw.teacher_id
          AND lower(regexp_replace(trim(t.full_name),'\s+',' ','g')) <> 'guru belum ditentukan'
      )
    ORDER BY teacher_id,date,period,priority
  ), grouped AS (
    SELECT teacher_id,
      CASE WHEN GROUPING(category)=1 THEN 'ALL'::text ELSE category END AS category,
      COUNT(*) FILTER (WHERE period BETWEEN 1 AND 6 AND period_type='TEACHING')::int AS teaching_jp,
      COUNT(*) FILTER (WHERE period=0 OR period_type='FREE')::int AS other_jp,
      COUNT(DISTINCT date)::int AS days
    FROM unique_units
    GROUP BY GROUPING SETS ((teacher_id,category),(teacher_id))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'teacher_id',teacher_id,'category',category,
    'teaching_jp',teaching_jp,'other_jp',other_jp,'days',days)
    ORDER BY teacher_id,category),'[]'::jsonb) INTO v_result
  FROM grouped;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_leave_category_teacher_activity_v320(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_leave_category_teacher_activity_v320(date,date) TO authenticated;

COMMIT;
