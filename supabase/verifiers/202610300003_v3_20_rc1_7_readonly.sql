-- V3.20 RC1.7 / Safe read-only schema verifier. Run after both RC1.7 migrations.
SELECT 'room_event_reservations' AS feature,
  to_regclass('public.room_event_reservations') IS NOT NULL AS installed
UNION ALL SELECT 'leave_reason_correction',to_regprocedure('public.ejadwal_correct_leave_reason_rc17(uuid,text,text,text)') IS NOT NULL
UNION ALL SELECT 'manual_reason_correction',to_regprocedure('public.ejadwal_correct_manual_inval_reason_rc17(uuid,text,text)') IS NOT NULL
UNION ALL SELECT 'manual_inval_category',to_regprocedure('public.ejadwal_save_inval_bundle_rc17(jsonb,jsonb,text,text)') IS NOT NULL
UNION ALL SELECT 'management_task_edit',to_regprocedure('public.ejadwal_edit_leave_task_rc17(uuid,smallint,text,text,text)') IS NOT NULL
UNION ALL SELECT 'room_conflict_detector',to_regprocedure('public.ejadwal_room_conflicts_rc17(text,date,time without time zone,time without time zone,uuid)') IS NOT NULL
UNION ALL SELECT 'room_event_writer',to_regprocedure('public.ejadwal_upsert_room_event_rc17(text,date,time without time zone,time without time zone,text,text,text,uuid)') IS NOT NULL
UNION ALL SELECT 'room_event_cancel',to_regprocedure('public.ejadwal_cancel_room_event_rc17(uuid,text)') IS NOT NULL
UNION ALL SELECT 'room_event_list',to_regprocedure('public.ejadwal_list_room_events_rc17(date,date)') IS NOT NULL
UNION ALL SELECT 'leave_task_sync_trigger',EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_leave_request_tasks_sync_coverage' AND NOT tgisinternal);
-- Security flags: table must have RLS enabled and only staff-guarded RPC exposed.
SELECT c.relname AS relation,c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon','public.room_event_reservations','INSERT') AS anon_can_insert,
  has_table_privilege('authenticated','public.room_event_reservations','INSERT') AS authenticated_direct_insert
FROM pg_class c WHERE c.oid='public.room_event_reservations'::regclass;
-- Existing events (counts only, no personal/room details):
SELECT status,count(*) AS event_count FROM public.room_event_reservations GROUP BY status;
