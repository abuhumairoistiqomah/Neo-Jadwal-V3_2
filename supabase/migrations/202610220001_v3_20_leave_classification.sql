-- V3.20 RC1: reason category is separate from FULL_DAY/PARTIAL and from badal coverage.
-- Apply in Supabase staging first. No automated historical reason classification.
BEGIN;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS absence_category text NOT NULL DEFAULT 'UNCLASSIFIED';
ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_absence_category_ck;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_absence_category_ck
  CHECK(absence_category IN ('PERSONAL','SCHOOL_DUTY','UNCLASSIFIED'));
CREATE INDEX IF NOT EXISTS leave_requests_absence_category_idx
  ON public.leave_requests(absence_category,date_start) WHERE deleted_at IS NULL;

-- Delegates all evidence and slot validators to the preexisting v4. Category update
-- occurs inside the SAME transaction; a failure rolls back the entire draft.
CREATE OR REPLACE FUNCTION public.ejadwal_submit_public_leave_request_v320(
  p_teacher_name text, p_schedule_date date, p_request_type text, p_reason text,
  p_detail text DEFAULT NULL, p_slots jsonb DEFAULT '[]'::jsonb,
  p_periods jsonb DEFAULT '[]'::jsonb, p_tasks jsonb DEFAULT '[]'::jsonb,
  p_evidence_extension text DEFAULT NULL, p_absence_category text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_id uuid;
BEGIN
  IF p_absence_category NOT IN ('PERSONAL','SCHOOL_DUTY') OR p_absence_category IS NULL THEN
    RAISE EXCEPTION 'ABSENCE_CATEGORY_REQUIRED';
  END IF;
  v_result := public.ejadwal_submit_public_leave_request_v4(p_teacher_name,p_schedule_date,
    p_request_type,p_reason,p_detail,p_slots,p_periods,p_tasks,p_evidence_extension);
  v_id := nullif(v_result->>'request_id','')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'LEAVE_DRAFT_CREATION_FAILED'; END IF;
  UPDATE public.leave_requests SET absence_category=p_absence_category,updated_at=now() WHERE id=v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEAVE_DRAFT_NOT_FOUND'; END IF;
  RETURN v_result || jsonb_build_object('absence_category',p_absence_category);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_submit_public_leave_request_v320(text,date,text,text,text,jsonb,jsonb,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ejadwal_submit_public_leave_request_v320(text,date,text,text,text,jsonb,jsonb,jsonb,text,text) TO anon,authenticated;

-- Reuses the existing authenticated staff-only authorization/approval RPC.
CREATE OR REPLACE FUNCTION public.ejadwal_submit_staff_leave_v320(
  p_teacher_name text,p_schedule_date date,p_request_type text,p_reason text,
  p_detail text DEFAULT NULL,p_slots jsonb DEFAULT '[]'::jsonb,
  p_periods jsonb DEFAULT '[]'::jsonb,p_tasks jsonb DEFAULT '[]'::jsonb,
  p_approve_now boolean DEFAULT false,p_authorization_note text DEFAULT NULL,
  p_absence_category text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  IF p_absence_category NOT IN ('PERSONAL','SCHOOL_DUTY') OR p_absence_category IS NULL THEN
    RAISE EXCEPTION 'ABSENCE_CATEGORY_REQUIRED';
  END IF;
  v_result := public.ejadwal_submit_staff_leave_v1(p_teacher_name,p_schedule_date,
    p_request_type,p_reason,p_detail,p_slots,p_periods,p_tasks,p_approve_now,p_authorization_note);
  v_id := nullif(v_result->>'request_id','')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'STAFF_LEAVE_INSERT_FAILED'; END IF;
  UPDATE public.leave_requests SET absence_category=p_absence_category,updated_at=now() WHERE id=v_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_LEAVE_NOT_FOUND'; END IF;
  RETURN v_result || jsonb_build_object('absence_category',p_absence_category);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_submit_staff_leave_v320(text,date,text,text,text,jsonb,jsonb,jsonb,boolean,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_submit_staff_leave_v320(text,date,text,text,text,jsonb,jsonb,jsonb,boolean,text,text) TO authenticated;

-- Staff classification corrections are audited. Only an approved, non-deleted
-- request can be reclassified. Old UNKNOWN rows are never silently guessed.
CREATE OR REPLACE FUNCTION public.ejadwal_set_leave_category_v320(
  p_leave_request_id uuid,p_absence_category text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.leave_requests%ROWTYPE; v_actor uuid:=auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
  IF p_absence_category NOT IN ('PERSONAL','SCHOOL_DUTY','UNCLASSIFIED') OR p_absence_category IS NULL THEN
    RAISE EXCEPTION 'ABSENCE_CATEGORY_INVALID';
  END IF;
  IF length(trim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'CLASSIFICATION_NOTE_REQUIRED'; END IF;
  SELECT * INTO v_row FROM public.leave_requests WHERE id=p_leave_request_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.deleted_at IS NOT NULL OR v_row.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'ACTIVE_APPROVED_LEAVE_REQUIRED';
  END IF;
  IF v_row.absence_category <> p_absence_category THEN
    UPDATE public.leave_requests SET absence_category=p_absence_category,updated_at=now() WHERE id=v_row.id;
    INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
    VALUES(v_actor,'V320_LEAVE_CLASSIFICATION','leave_request',v_row.id::text,
      jsonb_build_object('absence_category',v_row.absence_category),
      jsonb_build_object('absence_category',p_absence_category,'note',trim(p_note)),gen_random_uuid());
  END IF;
  RETURN jsonb_build_object('request_id',v_row.id,'absence_category',p_absence_category);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_set_leave_category_v320(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_set_leave_category_v320(uuid,text,text) TO authenticated;

-- Preserve the previous statistics logic; add category from the exact approved
-- request or verified OFFICIAL_DUTY coverage. Legacy stays UNCLASSIFIED.
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
    ELSE 'UNCLASSIFIED' END
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
    SELECT cs.absent_teacher_id,cs.schedule_date,cs.period,'TEACHING'::text,'SCHOOL_DUTY'::text,2
    FROM public.coverage_slots cs JOIN public.substitute_constraints sc ON sc.id=cs.official_duty_constraint_id
    WHERE cs.source='OFFICIAL_DUTY' AND cs.deleted_at IS NULL AND cs.status<>'CANCELLED'
      AND sc.is_active AND sc.deleted_at IS NULL AND cs.absent_teacher_id IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND (p_teacher_id IS NULL OR cs.absent_teacher_id=p_teacher_id)
    UNION ALL
    SELECT cs.absent_teacher_id,cs.schedule_date,cs.period,'TEACHING'::text,'UNCLASSIFIED'::text,3
    FROM public.coverage_slots cs
    WHERE cs.source IN ('LEGACY_IMPORT','ADMIN_MANUAL') AND cs.deleted_at IS NULL
      AND cs.status <> 'CANCELLED' AND cs.absent_teacher_id IS NOT NULL
      AND cs.schedule_date BETWEEN p_date_start AND p_date_end
      AND (p_teacher_id IS NULL OR cs.absent_teacher_id=p_teacher_id)
  ), unique_units AS (
    SELECT DISTINCT ON (teacher_id,date,period) teacher_id,date,period,period_type,category
    FROM raw WHERE teacher_id IS NOT NULL ORDER BY teacher_id,date,period,priority
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
COMMIT;
