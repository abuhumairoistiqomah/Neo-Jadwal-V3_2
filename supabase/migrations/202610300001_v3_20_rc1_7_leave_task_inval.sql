-- E-JADWAL V3.20 RC1.7 / part A: consistent leave reason, category and teacher-owned tasks.
-- STAGING FIRST. Additive RPCs, no destructive backfill.
BEGIN;

-- One canonical leave request reason; coverage snapshots are a denormalized view used by WA,
-- substitute history and admin screens. All updates and audit occur in one transaction.
CREATE OR REPLACE FUNCTION public.ejadwal_correct_leave_reason_rc17(
  p_leave_request_id uuid, p_reason text, p_detail text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.leave_requests%ROWTYPE; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK')
  ) THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 240 THEN RAISE EXCEPTION 'LEAVE_REASON_INVALID'; END IF;
  IF length(btrim(coalesce(p_detail,'')))>2000 THEN RAISE EXCEPTION 'LEAVE_DETAIL_TOO_LONG'; END IF;
  IF length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'AUDIT_NOTE_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.leave_requests WHERE id=p_leave_request_id FOR UPDATE;
  IF v_old.id IS NULL OR v_old.status<>'APPROVED' OR v_old.deleted_at IS NOT NULL
  THEN RAISE EXCEPTION 'ACTIVE_APPROVED_LEAVE_REQUIRED'; END IF;
  IF v_old.reason IS NOT DISTINCT FROM btrim(p_reason) AND
     v_old.detail IS NOT DISTINCT FROM nullif(btrim(coalesce(p_detail,'')),'')
  THEN RETURN jsonb_build_object('unchanged',true,'request_id',v_old.id); END IF;
  UPDATE public.leave_requests SET reason=btrim(p_reason),
    detail=nullif(btrim(coalesce(p_detail,'')),''),updated_at=now() WHERE id=v_old.id;
  UPDATE public.coverage_slots SET reason_snapshot=btrim(p_reason),updated_at=now()
    WHERE leave_request_id=v_old.id AND source='LEAVE_WORKFLOW' AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
  VALUES(auth.uid(),'RC17_LEAVE_REASON_CORRECT','leave_request',v_old.id::text,
    jsonb_build_object('reason',v_old.reason,'detail',v_old.detail),
    jsonb_build_object('reason',btrim(p_reason),'detail',nullif(btrim(coalesce(p_detail,'')),''),
      'note',btrim(p_note),'coverage_rows_synced',v_count),gen_random_uuid());
  RETURN jsonb_build_object('request_id',v_old.id,'coverage_rows_synced',v_count);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_correct_leave_reason_rc17(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_correct_leave_reason_rc17(uuid,text,text,text) TO authenticated;

-- Manual Inval has no leave_request parent, so its canonical reason is the coverage row.
CREATE OR REPLACE FUNCTION public.ejadwal_correct_manual_inval_reason_rc17(
  p_coverage_slot_id uuid, p_reason text, p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.coverage_slots%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK')) THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 240 THEN RAISE EXCEPTION 'INVAL_REASON_INVALID'; END IF;
  IF length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'AUDIT_NOTE_REQUIRED'; END IF;
  SELECT * INTO v_old FROM public.coverage_slots WHERE id=p_coverage_slot_id FOR UPDATE;
  IF v_old.id IS NULL OR v_old.source<>'ADMIN_MANUAL' OR v_old.deleted_at IS NOT NULL
    OR v_old.status='CANCELLED' THEN RAISE EXCEPTION 'ACTIVE_MANUAL_COVERAGE_REQUIRED'; END IF;
  IF v_old.reason_snapshot IS DISTINCT FROM btrim(p_reason) THEN
    UPDATE public.coverage_slots SET reason_snapshot=btrim(p_reason),updated_at=now() WHERE id=v_old.id;
    INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
    VALUES(auth.uid(),'RC17_MANUAL_INVAL_REASON_CORRECT','coverage_slot',v_old.id::text,
      jsonb_build_object('reason',v_old.reason_snapshot),
      jsonb_build_object('reason',btrim(p_reason),'note',btrim(p_note)),gen_random_uuid());
  END IF;
  RETURN jsonb_build_object('coverage_slot_id',v_old.id,'reason',btrim(p_reason));
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_correct_manual_inval_reason_rc17(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_correct_manual_inval_reason_rc17(uuid,text,text) TO authenticated;

-- Wrap the EXISTING battle-tested writer. One category for the entire manual session.
-- IDs returned by the writer are scoped to this call, so no existing unrelated rows
-- are overwritten. Failed classification rolls back the earlier write atomically.
CREATE OR REPLACE FUNCTION public.ejadwal_save_inval_bundle_rc17(
  p_rows jsonb, p_room_incidental jsonb DEFAULT NULL,
  p_override_note text DEFAULT NULL, p_absence_category text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb; v_slot jsonb; v_id uuid; v_source text; v_updated integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK')) THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
  IF p_absence_category IS NULL OR p_absence_category NOT IN ('PERSONAL','SCHOOL_DUTY')
    THEN RAISE EXCEPTION 'ABSENCE_CATEGORY_REQUIRED'; END IF;
  v_result:=public.ejadwal_save_inval_bundle_v320_rc13(p_rows,p_room_incidental,p_override_note);
  FOR v_slot IN SELECT value FROM jsonb_array_elements(coalesce(v_result->'coverage_slot_ids','[]'::jsonb)) LOOP
    v_id:=(trim(both '"' from v_slot::text))::uuid;
    SELECT source INTO v_source FROM public.coverage_slots WHERE id=v_id FOR UPDATE;
    IF v_source='ADMIN_MANUAL' THEN
      UPDATE public.coverage_slots SET absence_category=p_absence_category,updated_at=now() WHERE id=v_id;
      v_updated:=v_updated+1;
    ELSIF v_source='LEAVE_WORKFLOW' THEN
      -- The approved leave request (not a new operator selection) owns classification.
      NULL;
    ELSE
      RAISE EXCEPTION 'RC17_UNEXPECTED_COVERAGE_SOURCE: %',coalesce(v_source,'missing');
    END IF;
  END LOOP;
  IF v_updated>0 THEN
    INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
    VALUES(auth.uid(),'RC17_MANUAL_INVAL_CATEGORY','inval_bundle',coalesce(v_result->>'request_id',''),null,
      jsonb_build_object('absence_category',p_absence_category,'updated_slots',v_updated),gen_random_uuid());
  END IF;
  RETURN v_result || jsonb_build_object('absence_category',p_absence_category);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_save_inval_bundle_rc17(jsonb,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_save_inval_bundle_rc17(jsonb,jsonb,text,text) TO authenticated;

-- Edit authoritative teacher-owned task. Existing trigger
-- trg_leave_request_tasks_sync_coverage synchronizes all class coverage descriptions.
-- Attachments live in leave_request_task_resources and are left untouched.
CREATE OR REPLACE FUNCTION public.ejadwal_edit_leave_task_rc17(
  p_leave_request_id uuid,p_period smallint,p_description text,
  p_expected_description text,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_leave public.leave_requests%ROWTYPE; v_task public.leave_request_tasks%ROWTYPE;
  v_old text; v_new text:=btrim(coalesce(p_description,''));
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK')) THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
  IF p_period NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'TASK_ONLY_JP1_TO_JP6'; END IF;
  IF length(v_new)>5000 THEN RAISE EXCEPTION 'TASK_TEXT_TOO_LONG'; END IF;
  IF length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'AUDIT_NOTE_REQUIRED'; END IF;
  SELECT * INTO v_leave FROM public.leave_requests WHERE id=p_leave_request_id FOR UPDATE;
  IF v_leave.id IS NULL OR v_leave.status<>'APPROVED' OR v_leave.deleted_at IS NOT NULL
  THEN RAISE EXCEPTION 'ACTIVE_APPROVED_LEAVE_REQUIRED'; END IF;
  SELECT * INTO v_task FROM public.leave_request_tasks
    WHERE leave_request_id=p_leave_request_id AND period=p_period FOR UPDATE;
  v_old:=coalesce(v_task.description,'');
  IF v_old IS DISTINCT FROM coalesce(p_expected_description,'')
    THEN RAISE EXCEPTION 'TASK_STALE_REFRESH_REQUIRED'; END IF;
  IF v_old IS DISTINCT FROM v_new THEN
    IF v_task.id IS NULL THEN
      INSERT INTO public.leave_request_tasks(leave_request_id,period,description)
      VALUES(p_leave_request_id,p_period,v_new);
    ELSE
      UPDATE public.leave_request_tasks SET description=v_new,updated_at=now() WHERE id=v_task.id;
    END IF;
    INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
    VALUES(auth.uid(),'RC17_LEAVE_TASK_EDIT','leave_request_task',p_leave_request_id::text||':'||p_period::text,
      jsonb_build_object('period',p_period,'description',v_old),
      jsonb_build_object('period',p_period,'description',v_new,'note',btrim(p_note)),gen_random_uuid());
  END IF;
  RETURN jsonb_build_object('leave_request_id',p_leave_request_id,'period',p_period,'description',v_new);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_edit_leave_task_rc17(uuid,smallint,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_edit_leave_task_rc17(uuid,smallint,text,text,text) TO authenticated;
COMMIT;
