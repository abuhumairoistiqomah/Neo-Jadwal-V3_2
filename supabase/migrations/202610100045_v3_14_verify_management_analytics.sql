select * from (
  values
    ('management_analytics_rpc_exists', to_regprocedure('public.ejadwal_management_analytics_v1(date,date)') is not null),
    ('management_analytics_is_security_definer', exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='ejadwal_management_analytics_v1' and p.prosecdef
    )),
    ('authenticated_can_execute_management_analytics', has_function_privilege('authenticated','public.ejadwal_management_analytics_v1(date,date)','EXECUTE')),
    ('anon_cannot_execute_management_analytics', not has_function_privilege('anon','public.ejadwal_management_analytics_v1(date,date)','EXECUTE')),
    ('leave_request_periods_exists', to_regclass('public.leave_request_periods') is not null),
    ('coverage_slots_exists', to_regclass('public.coverage_slots') is not null),
    ('leave_task_tables_exist', to_regclass('public.leave_request_tasks') is not null and to_regclass('public.leave_request_task_resources') is not null),
    ('coverage_task_tables_exist', to_regclass('public.learning_tasks') is not null and to_regclass('public.task_resources') is not null),
    ('leave_periods_support_jp0', exists(
      select 1 from pg_constraint
      where conrelid='public.leave_request_periods'::regclass
        and contype='c'
        and pg_get_constraintdef(oid) ilike '%period >= 0%'
        and pg_get_constraintdef(oid) ilike '%period <= 6%'
    )),
    ('regular_workload_source_exists', to_regclass('public.schedule_master_teachers') is not null)
) as checks(check_name, ok);
