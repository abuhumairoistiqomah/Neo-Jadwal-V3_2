-- RC1.7.1 calendar-integration hotfix: guest-safe view of booked room times.
-- Only title/time/date/room are exposed. No organizer, description, actor, audit.
-- Does not modify old reservations or the timetable master.
BEGIN;
CREATE OR REPLACE FUNCTION public.ejadwal_public_room_calendar_rc171(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_rows jsonb;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>7
 THEN RAISE EXCEPTION 'DATE_RANGE_INVALID'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'room_id',r.room_id,'event_date',r.event_date,
  'start_time',r.start_time,'end_time',r.end_time,'title',r.title,
  'status',r.status) ORDER BY r.event_date,r.start_time,r.title),'[]'::jsonb)
 INTO v_rows FROM public.room_event_reservations r
 WHERE r.event_date BETWEEN p_from AND p_to AND r.status='ACTIVE';
 RETURN v_rows;
END; $$;
REVOKE ALL ON FUNCTION public.ejadwal_public_room_calendar_rc171(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ejadwal_public_room_calendar_rc171(date,date) TO anon,authenticated;
COMMIT;
