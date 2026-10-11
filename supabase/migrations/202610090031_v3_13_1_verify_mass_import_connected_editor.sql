-- E-Jadwal V3.13.1 verifier — one result set.
select * from (
  select 'teacher_alias_table_exists'::text as check_name,
         to_regclass('public.schedule_teacher_aliases') is not null as ok
  union all
  select 'import_batch_table_exists', to_regclass('public.schedule_import_batches') is not null
  union all
  select 'alias_rpc_exists', to_regprocedure('public.ejadwal_upsert_schedule_teacher_alias(text,uuid)') is not null
  union all
  select 'publish_rpc_exists', to_regprocedure('public.ejadwal_publish_schedule_import_v1(jsonb,text,text,text)') is not null
  union all
  select 'quick_edit_rpc_exists', to_regprocedure('public.ejadwal_update_schedule_master_v1(uuid[],uuid,smallint,smallint,time,time,text,text,boolean,uuid[],text[],text)') is not null
  union all
  select 'anon_cannot_publish', not has_function_privilege('anon', 'public.ejadwal_publish_schedule_import_v1(jsonb,text,text,text)', 'EXECUTE')
  union all
  select 'authenticated_can_publish_rpc', has_function_privilege('authenticated', 'public.ejadwal_publish_schedule_import_v1(jsonb,text,text,text)', 'EXECUTE')
  union all
  select 'authenticated_can_quick_edit_rpc', has_function_privilege('authenticated', 'public.ejadwal_update_schedule_master_v1(uuid[],uuid,smallint,smallint,time,time,text,text,boolean,uuid[],text[],text)', 'EXECUTE')
  union all
  select 'schedule_master_soft_delete_columns_exist', exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='schedule_master' and column_name='deleted_at'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='schedule_master' and column_name='deleted_by'
  )
  union all
  select 'audit_log_exists', to_regclass('public.audit_logs') is not null
  union all
  select 'leave_period_accepts_jp0', exists (
    select 1 from pg_constraint
    where conrelid = 'public.leave_request_periods'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%period >= 0%'
      and pg_get_constraintdef(oid) ilike '%period <= 6%'
  )
  union all
  select 'homeroom_class_normalizer_exists',
         to_regprocedure('public.ejadwal_normalize_class_label(text)') is not null
  union all
  select 'homeroom_validator_supports_jp0', exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='ejadwal_teacher_scheduled_for_leave_slot'
      and pg_get_functiondef(p.oid) ilike '%p_period = 0%'
      and pg_get_functiondef(p.oid) ilike '%additional_task%'
  )
  union all
  select 'public_leave_v2_accepts_seven_periods', exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='ejadwal_submit_public_leave_request_v2'
      and pg_get_functiondef(p.oid) ilike '%jsonb_array_length(p_periods) > 7%'
      and pg_get_functiondef(p.oid) ilike '%v_period < 0%'
  )
  union all
  select 'mass_replace_preserves_jp0', exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname='ejadwal_publish_schedule_import_v1'
      and pg_get_functiondef(p.oid) ilike '%period between 1 and 6%'
  )

) checks
order by check_name;
