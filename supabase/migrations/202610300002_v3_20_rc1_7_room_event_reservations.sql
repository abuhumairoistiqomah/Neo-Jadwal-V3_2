-- E-JADWAL V3.20 RC1.7 / part B: staff-managed room event reservations.
-- All times are local school times (Asia/Jakarta); end is exclusive.
-- Writes serialized per room/date; existing scheduled lessons, dated overrides,
-- additional lessons, legacy room blocks and other events block reservations.
BEGIN;
CREATE TABLE IF NOT EXISTS public.room_event_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  event_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  title text NOT NULL,
  organizer text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_event_valid_time_ck CHECK(start_time<end_time),
  CONSTRAINT room_event_title_ck CHECK(length(btrim(title)) BETWEEN 3 AND 180),
  CONSTRAINT room_event_organizer_ck CHECK(length(btrim(organizer)) BETWEEN 2 AND 160)
);
CREATE INDEX IF NOT EXISTS room_event_reservations_lookup_idx
 ON public.room_event_reservations(room_id,event_date,start_time,end_time) WHERE status='ACTIVE';
ALTER TABLE public.room_event_reservations ENABLE ROW LEVEL SECURITY;
-- Reads and mutations are exclusively through the staff-guarded RPCs below.
REVOKE ALL ON public.room_event_reservations FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.ejadwal_period_start_rc17(p_period int)
RETURNS time LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p_period
 WHEN 0 THEN '07:00'::time WHEN 1 THEN '07:30'::time WHEN 2 THEN '08:15'::time
 WHEN 3 THEN '09:00'::time WHEN 4 THEN '10:15'::time WHEN 5 THEN '11:00'::time
 WHEN 6 THEN '11:45'::time ELSE NULL END $$;
CREATE OR REPLACE FUNCTION public.ejadwal_period_end_rc17(p_period int)
RETURNS time LANGUAGE sql IMMUTABLE AS $$ SELECT CASE p_period
 WHEN 0 THEN '07:40'::time WHEN 1 THEN '08:15'::time WHEN 2 THEN '09:00'::time
 WHEN 3 THEN '09:45'::time WHEN 4 THEN '11:00'::time WHEN 5 THEN '11:45'::time
 WHEN 6 THEN '12:30'::time ELSE NULL END $$;

-- Returns conflict DETAILS, not a boolean, so admin understands why blocked.
CREATE OR REPLACE FUNCTION public.ejadwal_room_conflicts_rc17(
 p_room_id text,p_date date,p_start time,p_end time,p_exclude_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles
   WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK'))
 THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
 IF p_room_id IS NULL OR p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR p_start>=p_end
 THEN RAISE EXCEPTION 'INVALID_ROOM_DATE_OR_TIME'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(conflicts) ORDER BY conflict_type,label), '[]'::jsonb)
 INTO v_result FROM (
   SELECT 'EVENT'::text AS conflict_type, r.title AS label,
     r.start_time::text AS starts, r.end_time::text AS ends
   FROM public.room_event_reservations r WHERE r.room_id=p_room_id
     AND r.event_date=p_date AND r.status='ACTIVE'
     AND (p_exclude_id IS NULL OR r.id<>p_exclude_id)
     AND p_start<r.end_time AND p_end>r.start_time
   UNION ALL
   SELECT 'LESSON'::text, concat(c.code,' • JP',sm.period,' • ',sm.subject),
     coalesce(si.override_start_time,sm.start_time,public.ejadwal_period_start_rc17(sm.period))::text,
     coalesce(si.override_end_time,sm.end_time,public.ejadwal_period_end_rc17(sm.period))::text
   FROM public.schedule_master sm
   JOIN public.classes c ON c.id=sm.class_id
   LEFT JOIN LATERAL (
     SELECT s.override_room_id,s.override_start_time,s.override_end_time
     FROM public.schedule_incidentals s
     WHERE s.class_id=sm.class_id AND s.schedule_date=p_date AND s.period=sm.period
       AND s.deleted_at IS NULL
     ORDER BY s.updated_at DESC,s.id DESC LIMIT 1
   ) si ON true
   WHERE sm.is_active AND sm.deleted_at IS NULL
     AND sm.day_of_week=extract(isodow FROM p_date)::smallint
     AND coalesce(si.override_room_id,sm.room_id)=p_room_id
     AND p_start<coalesce(si.override_end_time,sm.end_time,public.ejadwal_period_end_rc17(sm.period))
     AND p_end>coalesce(si.override_start_time,sm.start_time,public.ejadwal_period_start_rc17(sm.period))
   UNION ALL
   SELECT 'ADDITIONAL_LESSON'::text,concat(c.code,' • JP',si.period,' • ',coalesce(si.override_subject,'Kegiatan Insidental')),
     coalesce(si.override_start_time,public.ejadwal_period_start_rc17(si.period))::text,
     coalesce(si.override_end_time,public.ejadwal_period_end_rc17(si.period))::text
   FROM public.schedule_incidentals si JOIN public.classes c ON c.id=si.class_id
   WHERE si.schedule_date=p_date AND si.deleted_at IS NULL AND si.kind='ADDITIONAL'
     AND si.override_room_id=p_room_id
     AND NOT EXISTS(SELECT 1 FROM public.schedule_master sm WHERE sm.class_id=si.class_id
       AND sm.period=si.period AND sm.day_of_week=extract(isodow FROM p_date)::smallint
       AND sm.deleted_at IS NULL AND sm.is_active)
     AND p_start<coalesce(si.override_end_time,public.ejadwal_period_end_rc17(si.period))
     AND p_end>coalesce(si.override_start_time,public.ejadwal_period_start_rc17(si.period))
   UNION ALL
   SELECT 'BLOCKED_ROOM'::text,coalesce(ru.reason,'Ruangan tidak tersedia'),
      CASE WHEN ru.period_start IS NULL THEN '00:00' ELSE public.ejadwal_period_start_rc17(ru.period_start)::text END,
      CASE WHEN ru.period_end IS NULL THEN '23:59' ELSE public.ejadwal_period_end_rc17(ru.period_end)::text END
   FROM public.room_unavailability ru WHERE ru.room_id=p_room_id
     AND p_date BETWEEN ru.date_start AND ru.date_end
     AND ru.status='ACTIVE' AND ru.deleted_at IS NULL
     AND (ru.period_start IS NULL OR
       (p_start<public.ejadwal_period_end_rc17(ru.period_end) AND
        p_end>public.ejadwal_period_start_rc17(ru.period_start)))
 ) conflicts;
 RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_room_conflicts_rc17(text,date,time,time,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_room_conflicts_rc17(text,date,time,time,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ejadwal_upsert_room_event_rc17(
 p_room_id text,p_event_date date,p_start_time time,p_end_time time,
 p_title text,p_organizer text,p_description text DEFAULT NULL,p_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_conflicts jsonb;v_old public.room_event_reservations%ROWTYPE;
        v_new public.room_event_reservations%ROWTYPE;v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role IN ('ADMIN','WAKASEK'))
 THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
 IF p_room_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.rooms WHERE id=p_room_id AND status='ACTIVE')
 THEN RAISE EXCEPTION 'ACTIVE_ROOM_REQUIRED'; END IF;
 IF p_event_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL OR p_start_time>=p_end_time
 THEN RAISE EXCEPTION 'INVALID_DATE_OR_TIME'; END IF;
 IF length(btrim(coalesce(p_title,''))) NOT BETWEEN 3 AND 180
   OR length(btrim(coalesce(p_organizer,''))) NOT BETWEEN 2 AND 160
   OR length(coalesce(p_description,''))>2000 THEN RAISE EXCEPTION 'INVALID_EVENT_DETAILS'; END IF;
 -- Collision serialisation for concurrent event writes to one room/date.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_room_id||'|'||p_event_date::text,31700));
 IF p_id IS NOT NULL THEN
   SELECT * INTO v_old FROM public.room_event_reservations WHERE id=p_id FOR UPDATE;
   IF v_old.id IS NULL OR v_old.status<>'ACTIVE' THEN RAISE EXCEPTION 'ACTIVE_EVENT_NOT_FOUND'; END IF;
   IF v_old.room_id<>p_room_id OR v_old.event_date<>p_event_date THEN
     RAISE EXCEPTION 'MOVE_EVENT_CANCEL_AND_RECREATE';
   END IF;
 END IF;
 v_conflicts:=public.ejadwal_room_conflicts_rc17(p_room_id,p_event_date,p_start_time,p_end_time,p_id);
 IF jsonb_array_length(v_conflicts)>0 THEN
   RAISE EXCEPTION 'ROOM_TIME_CONFLICT: %', v_conflicts::text;
 END IF;
 IF p_id IS NULL THEN
   INSERT INTO public.room_event_reservations(room_id,event_date,start_time,end_time,title,organizer,description,created_by,updated_by)
   VALUES(p_room_id,p_event_date,p_start_time,p_end_time,btrim(p_title),btrim(p_organizer),
     nullif(btrim(coalesce(p_description,'')),''),v_actor,v_actor) RETURNING * INTO v_new;
 ELSE
   UPDATE public.room_event_reservations SET start_time=p_start_time,end_time=p_end_time,
     title=btrim(p_title),organizer=btrim(p_organizer),description=nullif(btrim(coalesce(p_description,'')),''),
     updated_by=v_actor,updated_at=now() WHERE id=p_id RETURNING * INTO v_new;
 END IF;
 INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
 VALUES(v_actor,CASE WHEN p_id IS NULL THEN 'RC17_ROOM_EVENT_CREATE' ELSE 'RC17_ROOM_EVENT_UPDATE' END,
   'room_event_reservation',v_new.id::text,
   CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,to_jsonb(v_new),gen_random_uuid());
 RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_upsert_room_event_rc17(text,date,time,time,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_upsert_room_event_rc17(text,date,time,time,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ejadwal_cancel_room_event_rc17(
 p_id uuid,p_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.room_event_reservations%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles
   WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK')) THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
 IF length(btrim(coalesce(p_note,'')))<5 THEN RAISE EXCEPTION 'AUDIT_NOTE_REQUIRED'; END IF;
 SELECT * INTO v_old FROM public.room_event_reservations WHERE id=p_id FOR UPDATE;
 IF v_old.id IS NULL OR v_old.status<>'ACTIVE' THEN RAISE EXCEPTION 'ACTIVE_EVENT_NOT_FOUND'; END IF;
 UPDATE public.room_event_reservations SET status='CANCELLED',updated_by=auth.uid(),updated_at=now() WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
 VALUES(auth.uid(),'RC17_ROOM_EVENT_CANCEL','room_event_reservation',p_id::text,to_jsonb(v_old),
   to_jsonb(v_old)||jsonb_build_object('status','CANCELLED','note',btrim(p_note)),gen_random_uuid());
 RETURN jsonb_build_object('id',p_id,'status','CANCELLED');
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_cancel_room_event_rc17(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_cancel_room_event_rc17(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ejadwal_list_room_events_rc17(p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles
   WHERE user_id=auth.uid() AND role IN ('ADMIN','WAKASEK')) THEN RAISE EXCEPTION 'ADMIN_OR_WAKASEK_REQUIRED'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>60 THEN RAISE EXCEPTION 'DATE_RANGE_INVALID'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.event_date,r.start_time,r.title),'[]'::jsonb)
 INTO v_rows FROM public.room_event_reservations r
 WHERE r.event_date BETWEEN p_from AND p_to AND r.status='ACTIVE';
 RETURN v_rows;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_list_room_events_rc17(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ejadwal_list_room_events_rc17(date,date) TO authenticated;
COMMIT;
