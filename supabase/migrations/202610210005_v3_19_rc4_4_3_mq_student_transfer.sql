-- RC4.4.3: explicit, auditable MQ student delegation into a teacher's existing
-- teaching group. This acknowledges one coverage as physically combined; it
-- never silently assigns a new teacher or changes schedule_master.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ejadwal_mq_student_transfers_v319 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 coverage_slot_id uuid NOT NULL REFERENCES public.coverage_slots(id) ON DELETE RESTRICT,
 schedule_date date NOT NULL,
 period smallint NOT NULL CHECK(period BETWEEN 1 AND 6),
 source_class_name text NOT NULL,
 receiving_class_name text NOT NULL,
 receiving_teacher_name text NOT NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ejadwal_mq_transfer_active_coverage_idx
 ON public.ejadwal_mq_student_transfers_v319(coverage_slot_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ejadwal_mq_transfer_date_idx
 ON public.ejadwal_mq_student_transfers_v319(schedule_date,period) WHERE deleted_at IS NULL;
ALTER TABLE public.ejadwal_mq_student_transfers_v319 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ejadwal_mq_student_transfers_v319 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ejadwal_mq_student_transfers_v319 TO anon,authenticated;
DROP POLICY IF EXISTS ejadwal_mq_transfer_public_read ON public.ejadwal_mq_student_transfers_v319;
CREATE POLICY ejadwal_mq_transfer_public_read ON public.ejadwal_mq_student_transfers_v319
 FOR SELECT TO anon,authenticated USING (deleted_at IS NULL);

CREATE OR REPLACE FUNCTION public.ejadwal_confirm_mq_student_transfer_v319(
 p_coverage_id uuid, p_receiving_class text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_cov public.coverage_slots%rowtype;
 v_source public.classes%rowtype;
 v_receiver public.classes%rowtype;
 v_teacher text;
 v_source_subject text;
 v_receiver_subject text;
 v_master_source text;
 v_master_receiver text;
 v_override_source text;
 v_override_receiver text;
 v_source_start time; v_source_end time;
 v_receiver_start time; v_receiver_end time;
 v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
 IF p_coverage_id IS NULL OR nullif(btrim(coalesce(p_receiving_class,'')),'') IS NULL THEN
   RAISE EXCEPTION 'TRANSFER_MISSING_INPUT'; END IF;
 SELECT * INTO v_cov FROM public.coverage_slots WHERE id=p_coverage_id FOR UPDATE;
 IF NOT FOUND OR v_cov.deleted_at IS NOT NULL OR v_cov.status NOT IN ('ASSIGNED','COMPLETED')
   OR v_cov.substitute_teacher_id IS NULL THEN RAISE EXCEPTION 'TRANSFER_COVERAGE_NOT_ASSIGNED'; END IF;
 IF v_cov.period NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'TRANSFER_JP0_NOT_SUPPORTED'; END IF;
 SELECT * INTO v_source FROM public.classes WHERE id=v_cov.class_id AND is_active;
 SELECT * INTO v_receiver FROM public.classes WHERE is_active
   AND (lower(btrim(code))=lower(btrim(p_receiving_class))
     OR lower(btrim(display_name))=lower(btrim(p_receiving_class)))
 ORDER BY CASE WHEN lower(btrim(code))=lower(btrim(p_receiving_class)) THEN 0 ELSE 1 END,id LIMIT 1;
 SELECT full_name INTO v_teacher FROM public.teachers WHERE id=v_cov.substitute_teacher_id AND is_active;
 IF v_source.id IS NULL OR v_receiver.id IS NULL OR v_teacher IS NULL
   OR v_source.id=v_receiver.id THEN RAISE EXCEPTION 'TRANSFER_INVALID_CLASSES_OR_TEACHER'; END IF;
 IF v_source.gender<>v_receiver.gender AND v_source.gender<>'UNKNOWN' AND v_receiver.gender<>'UNKNOWN' THEN
   RAISE EXCEPTION 'TRANSFER_CROSS_GENDER_NOT_ALLOWED'; END IF;
 IF v_source.display_name !~* '(^|[[:space:]])MQ([[:space:]]|$)'
   OR v_receiver.display_name !~* '(^|[[:space:]])MQ([[:space:]]|$)' THEN
   RAISE EXCEPTION 'TRANSFER_ONLY_MQ'; END IF;
 IF NOT public.ejadwal_teacher_scheduled_for_leave_slot(
   v_cov.substitute_teacher_id,v_cov.schedule_date,v_receiver.id,v_cov.period) THEN
   RAISE EXCEPTION 'TRANSFER_RECEIVER_NOT_SCHEDULED'; END IF;
 -- The receiver must truly be available on that JP, not merely in the master.
 IF EXISTS (SELECT 1 FROM public.coverage_slots cs WHERE cs.absent_teacher_id=v_cov.substitute_teacher_id
   AND cs.schedule_date=v_cov.schedule_date AND cs.period=v_cov.period
   AND cs.deleted_at IS NULL AND cs.status NOT IN ('CANCELLED','EXPIRED'))
 OR EXISTS (SELECT 1 FROM public.leave_request_periods lrp JOIN public.leave_requests lr ON lr.id=lrp.leave_request_id
   WHERE lr.teacher_id=v_cov.substitute_teacher_id AND lr.status='APPROVED' AND lr.deleted_at IS NULL
    AND lrp.schedule_date=v_cov.schedule_date AND lrp.period=v_cov.period)
 OR EXISTS (SELECT 1 FROM public.ejadwal_teacher_duty_assignments_v319 a
   JOIN public.ejadwal_teacher_duty_events_v319 e ON e.id=a.event_id
   WHERE a.teacher_id=v_cov.substitute_teacher_id AND e.status='ACTIVE'
   AND a.duty_role IN ('PARTICIPANT','STAFF')
   AND (v_cov.schedule_date BETWEEN e.date_start AND e.date_end OR a.compensation_date=v_cov.schedule_date)) THEN
   RAISE EXCEPTION 'TRANSFER_RECEIVER_UNAVAILABLE'; END IF;
 -- Never acknowledge unrelated simultaneous subjects as one lesson.
 SELECT subject INTO v_master_source FROM public.schedule_master
 WHERE class_id=v_source.id AND day_of_week=extract(isodow from v_cov.schedule_date)::smallint
   AND period=v_cov.period AND is_active AND deleted_at IS NULL ORDER BY id LIMIT 1;
 SELECT subject INTO v_master_receiver FROM public.schedule_master
 WHERE class_id=v_receiver.id AND day_of_week=extract(isodow from v_cov.schedule_date)::smallint
   AND period=v_cov.period AND is_active AND deleted_at IS NULL ORDER BY id LIMIT 1;
 SELECT override_subject INTO v_override_source FROM public.schedule_incidentals
 WHERE schedule_date=v_cov.schedule_date AND class_id=v_source.id AND period=v_cov.period
 AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT override_subject INTO v_override_receiver FROM public.schedule_incidentals
 WHERE schedule_date=v_cov.schedule_date AND class_id=v_receiver.id AND period=v_cov.period
 AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 1;
 v_source_subject:=coalesce(nullif(btrim(v_override_source),''),nullif(btrim(v_master_source),''),nullif(btrim(v_cov.subject_snapshot),''));
 v_receiver_subject:=coalesce(nullif(btrim(v_override_receiver),''),nullif(btrim(v_master_receiver),''));
 IF v_source_subject IS NULL OR v_receiver_subject IS NULL OR
   lower(btrim(v_source_subject))<>lower(btrim(v_receiver_subject)) THEN
   RAISE EXCEPTION 'TRANSFER_DIFFERENT_OR_MISSING_SUBJECT'; END IF;
 -- Date-specific clock overrides must not merge lessons at different times.
 SELECT COALESCE(si.override_start_time,sm.start_time),COALESCE(si.override_end_time,sm.end_time)
 INTO v_source_start,v_source_end
 FROM (SELECT v_source.id AS id) x
 LEFT JOIN LATERAL (SELECT start_time,end_time FROM public.schedule_master
   WHERE class_id=x.id AND day_of_week=extract(isodow from v_cov.schedule_date)::smallint
    AND period=v_cov.period AND is_active AND deleted_at IS NULL ORDER BY id LIMIT 1) sm ON true
 LEFT JOIN LATERAL (SELECT override_start_time,override_end_time FROM public.schedule_incidentals
   WHERE class_id=x.id AND schedule_date=v_cov.schedule_date AND period=v_cov.period
    AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 1) si ON true;
 SELECT COALESCE(si.override_start_time,sm.start_time),COALESCE(si.override_end_time,sm.end_time)
 INTO v_receiver_start,v_receiver_end
 FROM (SELECT v_receiver.id AS id) x
 LEFT JOIN LATERAL (SELECT start_time,end_time FROM public.schedule_master
   WHERE class_id=x.id AND day_of_week=extract(isodow from v_cov.schedule_date)::smallint
    AND period=v_cov.period AND is_active AND deleted_at IS NULL ORDER BY id LIMIT 1) sm ON true
 LEFT JOIN LATERAL (SELECT override_start_time,override_end_time FROM public.schedule_incidentals
   WHERE class_id=x.id AND schedule_date=v_cov.schedule_date AND period=v_cov.period
    AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 1) si ON true;
 IF (v_source_start IS NOT NULL AND v_receiver_start IS NOT NULL AND v_source_start<>v_receiver_start)
 OR (v_source_end IS NOT NULL AND v_receiver_end IS NOT NULL AND v_source_end<>v_receiver_end) THEN
   RAISE EXCEPTION 'TRANSFER_DIFFERENT_CLOCK'; END IF;
 IF EXISTS(SELECT 1 FROM public.ejadwal_mq_student_transfers_v319
   WHERE coverage_slot_id=p_coverage_id AND deleted_at IS NULL) THEN
   RAISE EXCEPTION 'TRANSFER_ALREADY_CONFIRMED'; END IF;
 INSERT INTO public.ejadwal_mq_student_transfers_v319(
  coverage_slot_id,schedule_date,period,source_class_name,receiving_class_name,receiving_teacher_name)
 VALUES(v_cov.id,v_cov.schedule_date,v_cov.period,v_source.display_name,v_receiver.display_name,v_teacher)
 RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_confirm_mq_student_transfer_v319(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_confirm_mq_student_transfer_v319(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ejadwal_revoke_mq_student_transfer_v319(p_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
 UPDATE public.ejadwal_mq_student_transfers_v319
 SET deleted_at=now(),deleted_by=auth.uid() WHERE id=p_transfer_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'TRANSFER_NOT_ACTIVE'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_revoke_mq_student_transfer_v319(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_revoke_mq_student_transfer_v319(uuid) TO authenticated;
COMMIT;
