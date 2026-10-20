-- E-JADWAL V3.19 RC2: planned teacher activity assignments + compensatory days.
-- NO attendance assertions, leave_requests inserts, substitute_constraints writes,
-- or schedule/analytics modifications. RC3 will integrate availability.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ejadwal_teacher_duty_events_v319 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 180),
 date_start date NOT NULL,
 date_end date NOT NULL,
 scope text NOT NULL CHECK(scope IN ('IKHWAN','AKHWAT','ALL','OTHER')),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
 updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ejadwal_v319_duty_valid_dates CHECK(date_end>=date_start)
);
CREATE TABLE IF NOT EXISTS public.ejadwal_teacher_duty_assignments_v319 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL REFERENCES public.ejadwal_teacher_duty_events_v319(id) ON DELETE RESTRICT,
 teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
 duty_role text NOT NULL CHECK(duty_role IN ('PARTICIPANT','STAFF','REMAINS_ON_DUTY')),
 compensation_date date,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,teacher_id),
 CHECK(duty_role<>'REMAINS_ON_DUTY' OR compensation_date IS NULL)
);
CREATE INDEX IF NOT EXISTS ejadwal_v319_duty_dates_idx ON public.ejadwal_teacher_duty_events_v319(date_start,date_end,status);
CREATE INDEX IF NOT EXISTS ejadwal_v319_comp_date_idx ON public.ejadwal_teacher_duty_assignments_v319(compensation_date,teacher_id) WHERE compensation_date IS NOT NULL;
ALTER TABLE public.ejadwal_teacher_duty_events_v319 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejadwal_teacher_duty_assignments_v319 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ejadwal_teacher_duty_events_v319 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.ejadwal_teacher_duty_assignments_v319 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ejadwal_teacher_duty_events_v319 TO authenticated;
GRANT SELECT ON public.ejadwal_teacher_duty_assignments_v319 TO authenticated;
DROP POLICY IF EXISTS ejadwal_v319_duty_events_staff_read ON public.ejadwal_teacher_duty_events_v319;
CREATE POLICY ejadwal_v319_duty_events_staff_read ON public.ejadwal_teacher_duty_events_v319
 FOR SELECT TO authenticated USING((SELECT public.current_user_is_staff()));
DROP POLICY IF EXISTS ejadwal_v319_duty_assignments_staff_read ON public.ejadwal_teacher_duty_assignments_v319;
CREATE POLICY ejadwal_v319_duty_assignments_staff_read ON public.ejadwal_teacher_duty_assignments_v319
 FOR SELECT TO authenticated USING((SELECT public.current_user_is_staff()));
-- Reuse audit infrastructure from V3.13.3 so edits/cancellation are attributable.
DROP TRIGGER IF EXISTS audit_teacher_duty_event_v319 ON public.ejadwal_teacher_duty_events_v319;
CREATE TRIGGER audit_teacher_duty_event_v319 AFTER INSERT OR UPDATE ON public.ejadwal_teacher_duty_events_v319
 FOR EACH ROW EXECUTE FUNCTION public.ejadwal_audit_operational_rule_change();
DROP TRIGGER IF EXISTS audit_teacher_duty_assignment_v319 ON public.ejadwal_teacher_duty_assignments_v319;
CREATE TRIGGER audit_teacher_duty_assignment_v319 AFTER INSERT OR DELETE ON public.ejadwal_teacher_duty_assignments_v319
 FOR EACH ROW EXECUTE FUNCTION public.ejadwal_audit_operational_rule_change();

-- One transaction per event: validate participant list before mutating anything.
CREATE OR REPLACE FUNCTION public.ejadwal_save_teacher_duty_v319(
 p_event_id uuid, p_event jsonb, p_assignments jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_actor uuid:=auth.uid(); v_id uuid; v_title text; v_start date; v_end date;
 v_scope text; v_notes text; v_row jsonb; v_teacher uuid; v_role text;
 v_comp date; v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF v_actor IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
 IF p_event IS NULL OR jsonb_typeof(p_event)<>'object' OR p_assignments IS NULL OR jsonb_typeof(p_assignments)<>'array' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
 v_title:=btrim(coalesce(p_event->>'title',''));
 v_scope:=p_event->>'scope'; v_notes:=btrim(coalesce(p_event->>'notes',''));
 IF length(v_title) NOT BETWEEN 1 AND 180 OR length(v_notes)>2000
 OR v_scope IS NULL OR v_scope NOT IN ('IKHWAN','AKHWAT','ALL','OTHER') THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
 -- Date regex prevents most accidental casts; PostgreSQL cast also validates calendar day.
 IF coalesce(p_event->>'date_start','') !~ '^\d{4}-\d{2}-\d{2}$'
 OR coalesce(p_event->>'date_end','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'INVALID_EVENT_DATES'; END IF;
 v_start:=(p_event->>'date_start')::date; v_end:=(p_event->>'date_end')::date;
 IF v_end<v_start THEN RAISE EXCEPTION 'INVALID_EVENT_RANGE'; END IF;
 IF jsonb_array_length(p_assignments)=0 OR jsonb_array_length(p_assignments)>500 THEN RAISE EXCEPTION 'INVALID_PARTICIPANT_COUNT'; END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(p_assignments) LOOP
   IF jsonb_typeof(v_row)<>'object' THEN RAISE EXCEPTION 'INVALID_PARTICIPANT'; END IF;
   v_teacher:=(v_row->>'teacher_id')::uuid; v_role:=v_row->>'duty_role';
   IF v_teacher IS NULL OR v_teacher=ANY(v_seen) OR v_role IS NULL OR v_role NOT IN ('PARTICIPANT','STAFF','REMAINS_ON_DUTY') THEN RAISE EXCEPTION 'INVALID_OR_DUPLICATE_TEACHER'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.teachers WHERE id=v_teacher AND is_active=true) THEN RAISE EXCEPTION 'TEACHER_NOT_ACTIVE'; END IF;
   v_seen:=array_append(v_seen,v_teacher);
   IF nullif(v_row->>'compensation_date','') IS NOT NULL THEN
     IF (v_row->>'compensation_date') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'INVALID_COMPENSATION_DATE'; END IF;
     v_comp:=(v_row->>'compensation_date')::date;
     IF v_role='REMAINS_ON_DUTY' OR v_comp<=v_end THEN RAISE EXCEPTION 'INVALID_COMPENSATION_DATE'; END IF;
   END IF;
 END LOOP;
 IF p_event_id IS NULL THEN
   INSERT INTO public.ejadwal_teacher_duty_events_v319(title,date_start,date_end,scope,notes,created_by,updated_by)
   VALUES(v_title,v_start,v_end,v_scope,v_notes,v_actor,v_actor) RETURNING id INTO v_id;
 ELSE
   SELECT id INTO v_id FROM public.ejadwal_teacher_duty_events_v319 WHERE id=p_event_id AND status='ACTIVE' FOR UPDATE;
   IF v_id IS NULL THEN RAISE EXCEPTION 'EVENT_NOT_ACTIVE_OR_MISSING'; END IF;
   UPDATE public.ejadwal_teacher_duty_events_v319 SET title=v_title,date_start=v_start,date_end=v_end,scope=v_scope,notes=v_notes,updated_by=v_actor,updated_at=now() WHERE id=v_id;
   DELETE FROM public.ejadwal_teacher_duty_assignments_v319 WHERE event_id=v_id;
 END IF;
 INSERT INTO public.ejadwal_teacher_duty_assignments_v319(event_id,teacher_id,duty_role,compensation_date)
 SELECT v_id,(x->>'teacher_id')::uuid,x->>'duty_role',nullif(x->>'compensation_date','')::date
 FROM jsonb_array_elements(p_assignments) AS a(x);
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_save_teacher_duty_v319(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_save_teacher_duty_v319(uuid,jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ejadwal_cancel_teacher_duty_v319(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_user_is_staff() THEN RAISE EXCEPTION 'STAFF_REQUIRED'; END IF;
 UPDATE public.ejadwal_teacher_duty_events_v319 SET status='CANCELLED',updated_at=now(),updated_by=auth.uid()
 WHERE id=p_event_id AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_ACTIVE_OR_MISSING'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_cancel_teacher_duty_v319(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_cancel_teacher_duty_v319(uuid) TO authenticated;
COMMIT;
