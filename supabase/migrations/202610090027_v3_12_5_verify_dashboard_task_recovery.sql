-- V3.12.5 verifier — one result set, target 9/9 TRUE.
select 'task_upload_preserve_trigger_exists' as check_name,
       exists (select 1 from pg_trigger where tgname = 'trg_leave_requests_preserve_task_upload' and not tgisinternal) as ok
union all
select 'task_sync_function_exists',
       to_regprocedure('public.ejadwal_sync_leave_task_to_coverage(uuid,smallint)') is not null
union all
select 'task_sync_task_trigger_exists',
       exists (select 1 from pg_trigger where tgname = 'trg_leave_request_tasks_sync_coverage' and not tgisinternal)
union all
select 'task_sync_resource_trigger_exists',
       exists (select 1 from pg_trigger where tgname = 'trg_leave_request_task_resources_sync_coverage' and not tgisinternal)
union all
select 'recover_task_rpc_exists',
       to_regprocedure('public.ejadwal_recover_public_task_upload(text,text,text)') is not null
union all
select 'anon_can_recover_task_access',
       has_function_privilege('anon','public.ejadwal_recover_public_task_upload(text,text,text)','EXECUTE')
union all
select 'complete_late_task_rpc_exists',
       to_regprocedure('public.ejadwal_complete_public_leave_task(text,text,smallint,text,jsonb)') is not null
union all
select 'anon_can_complete_late_task',
       has_function_privilege('anon','public.ejadwal_complete_public_leave_task(text,text,smallint,text,jsonb)','EXECUTE')
union all
select 'public_upload_validator_allows_approved_source',
       position('APPROVED' in pg_get_functiondef('public.ejadwal_validate_public_task_upload(text,text,smallint)'::regprocedure)) > 0;
