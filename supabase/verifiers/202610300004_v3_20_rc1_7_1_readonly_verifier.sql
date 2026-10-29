-- RC1.7.1 read-only verifier: no writes.
SELECT 'event_table' AS check_name,
 to_regclass('public.room_event_reservations') IS NOT NULL AS passed
UNION ALL SELECT 'calendar_rpc',
 to_regprocedure('public.ejadwal_public_room_calendar_rc171(date,date)') IS NOT NULL
UNION ALL SELECT 'reserve_rpc',
 to_regprocedure('public.ejadwal_upsert_room_event_rc17(text,date,time without time zone,time without time zone,text,text,text,uuid)') IS NOT NULL
UNION ALL SELECT 'teacher_task_rpc',
 to_regprocedure('public.ejadwal_edit_leave_task_rc17(uuid,smallint,text,text,text)') IS NOT NULL;
SELECT has_function_privilege('anon', 'public.ejadwal_public_room_calendar_rc171(date,date)', 'EXECUTE') AS anon_can_read_calendar;
