select 'leave_request_tasks_exists' as check_name,
       to_regclass('public.leave_request_tasks') is not null as ok
union all
select 'leave_request_task_resources_exists',
       to_regclass('public.leave_request_task_resources') is not null
union all
select 'public_leave_v3_exists',
       to_regprocedure('public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb)') is not null
union all
select 'anon_can_execute_public_leave_v3',
       has_function_privilege('anon','public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb)','EXECUTE')
union all
select 'anon_cannot_direct_write_leave_tasks',
       not has_table_privilege('anon','public.leave_request_tasks','INSERT')
       and not has_table_privilege('anon','public.leave_request_task_resources','INSERT')
union all
select 'public_upload_validator_exists',
       to_regprocedure('public.ejadwal_validate_public_task_upload(text,text,smallint)') is not null
union all
select 'public_upload_attach_exists',
       to_regprocedure('public.ejadwal_attach_public_leave_task_file(text,text,smallint,text,text,text,text)') is not null
union all
select 'decision_rpc_still_exists',
       to_regprocedure('public.ejadwal_decide_leave_request(uuid,text,text)') is not null
union all
select 'inval_bundle_v3_preserves_teacher_tasks',
       to_regprocedure('public.ejadwal_save_inval_bundle_v3(jsonb,jsonb,text)') is not null;
