select 'inval_bundle_v2_exists' as check_name,
       to_regprocedure('public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text)') is not null as ok
union all
select 'anon_cannot_execute_bundle_v2',
       not has_function_privilege('anon','public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text)','EXECUTE')
union all
select 'authenticated_can_execute_bundle_v2',
       has_function_privilege('authenticated','public.ejadwal_save_inval_bundle_v2(jsonb,jsonb,text)','EXECUTE')
union all
select 'learning_tasks_exists', to_regclass('public.learning_tasks') is not null
union all
select 'task_resources_exists', to_regclass('public.task_resources') is not null
union all
select 'link_resource_supported', exists (
  select 1 from pg_constraint where conrelid='public.task_resources'::regclass and pg_get_constraintdef(oid) ilike '%LINK%'
)
union all
select 'drive_file_resource_supported', exists (
  select 1 from pg_constraint where conrelid='public.task_resources'::regclass and pg_get_constraintdef(oid) ilike '%DRIVE_FILE%'
);
