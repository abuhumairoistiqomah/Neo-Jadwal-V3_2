select * from (values
  ('coverage_status_supports_expired', exists (
    select 1 from pg_constraint
    where conrelid = 'public.coverage_slots'::regclass
      and conname = 'coverage_slots_status_check'
      and pg_get_constraintdef(oid) ilike '%EXPIRED%'
  )),
  ('active_coverage_index_excludes_expired', exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'coverage_slots_active_identity_uidx'
      and indexdef ilike '%EXPIRED%'
  )),
  ('waiting_expiry_rpc_exists', to_regprocedure('public.ejadwal_expire_stale_waiting_coverage(date)') is not null),
  ('authenticated_can_expire_waiting', has_function_privilege('authenticated', 'public.ejadwal_expire_stale_waiting_coverage(date)', 'EXECUTE')),
  ('quick_editor_v2_exists', to_regprocedure('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)') is not null),
  ('quick_editor_v2_authenticated', has_function_privilege('authenticated', 'public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)', 'EXECUTE')),
  ('quick_editor_v2_requires_conflict_confirmation', position('TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED' in pg_get_functiondef('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)'::regprocedure)) > 0),
  ('quick_editor_v2_audits_override', position('teacher_conflict_override' in pg_get_functiondef('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)'::regprocedure)) > 0)
) as checks(check_name, ok);
