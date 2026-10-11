select * from (values
  ('waiting_expiry_rpc_exists', to_regprocedure('public.ejadwal_expire_stale_waiting_coverage(date)') is not null),
  ('authenticated_can_expire_waiting', has_function_privilege('authenticated', 'public.ejadwal_expire_stale_waiting_coverage(date)', 'EXECUTE')),
  ('master_quick_edit_v3_exists', to_regprocedure('public.ejadwal_update_schedule_master_v3(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean)') is not null),
  ('authenticated_can_execute_master_v3', has_function_privilege('authenticated', 'public.ejadwal_update_schedule_master_v3(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean)', 'EXECUTE')),
  ('incidental_upsert_v2_exists', to_regprocedure('public.ejadwal_upsert_schedule_incidental_v2(uuid,date,uuid,smallint,text,text,text,boolean,text,uuid[],text[],text,text,text,boolean)') is not null),
  ('incidental_session_v2_exists', to_regprocedure('public.ejadwal_upsert_schedule_incidental_session_v2(jsonb,date,text,text,text,boolean,text,uuid[],text[],text,text,text,boolean)') is not null),
  ('schedule_master_supports_alternating', exists (
    select 1 from pg_constraint where conname = 'schedule_master_class_mode_check' and pg_get_constraintdef(oid) ilike '%ALTERNATING%'
  )),
  ('schedule_incidentals_support_alternating', exists (
    select 1 from pg_constraint where conname = 'schedule_incidentals_override_class_mode_check' and pg_get_constraintdef(oid) ilike '%ALTERNATING%'
  )),
  ('management_analytics_rpc_still_exists', to_regprocedure('public.ejadwal_management_analytics_v1(date,date)') is not null),
  ('master_quick_edit_v2_still_exists', to_regprocedure('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)') is not null)
) as checks(check_name, ok)
order by check_name;
