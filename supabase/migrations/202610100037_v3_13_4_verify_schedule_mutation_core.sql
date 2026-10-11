select * from (values
  ('incidental_upsert_rpc_exists', to_regprocedure('public.ejadwal_upsert_schedule_incidental_v1(uuid,date,uuid,smallint,text,text,text,boolean,uuid[],text[],text,text,text,boolean)') is not null),
  ('incidental_session_upsert_rpc_exists', to_regprocedure('public.ejadwal_upsert_schedule_incidental_session_v1(jsonb,date,text,text,text,boolean,uuid[],text[],text,text,text,boolean)') is not null),
  ('incidental_delete_rpc_exists', to_regprocedure('public.ejadwal_delete_schedule_incidental_v1(uuid,text)') is not null),
  ('authenticated_can_execute_incidental_upsert', has_function_privilege('authenticated','public.ejadwal_upsert_schedule_incidental_v1(uuid,date,uuid,smallint,text,text,text,boolean,uuid[],text[],text,text,text,boolean)','EXECUTE')),
  ('anon_cannot_execute_incidental_upsert', not has_function_privilege('anon','public.ejadwal_upsert_schedule_incidental_v1(uuid,date,uuid,smallint,text,text,text,boolean,uuid[],text[],text,text,text,boolean)','EXECUTE')),
  ('authenticated_can_execute_incidental_delete', has_function_privilege('authenticated','public.ejadwal_delete_schedule_incidental_v1(uuid,text)','EXECUTE')),
  ('schedule_incidentals_support_jp0', exists(select 1 from pg_constraint where conrelid='public.schedule_incidentals'::regclass and pg_get_constraintdef(oid) ilike '%period%0%6%')),
  ('schedule_incidentals_has_override_kind', exists(select 1 from pg_constraint where conrelid='public.schedule_incidentals'::regclass and pg_get_constraintdef(oid) ilike '%OVERRIDE%ADDITIONAL%')),
  ('schedule_incidentals_active_slot_index_exists', to_regclass('public.schedule_incidentals_active_slot_idx') is not null),
  ('master_quick_edit_still_exists', to_regprocedure('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)') is not null),
  ('audit_logs_exists', to_regclass('public.audit_logs') is not null)
) as checks(check_name, ok);
