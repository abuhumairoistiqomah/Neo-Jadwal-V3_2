-- READ-ONLY verifier for RC1.7.1 HF7. Do not put in migrations.
select 'task_password_table_exists' check_name,
  to_regclass('public.leave_task_passwords') is not null as ok;
select 'task_password_seed_trigger_exists' check_name,
  exists(select 1 from pg_trigger where tgname='trg_ejadwal_seed_task_password_hf7' and not tgisinternal) as ok;
select 'list_password_rpc_exists' check_name,
  to_regprocedure('public.ejadwal_list_leave_task_passwords_hf7(uuid[])') is not null as ok;
select 'change_password_rpc_exists' check_name,
  to_regprocedure('public.ejadwal_set_leave_task_password_hf7(uuid,text)') is not null as ok;
select 'password_unlock_rpc_exists' check_name,
  to_regprocedure('public.ejadwal_unlock_leave_task_hf7(text,date,smallint,text)') is not null as ok;
select 'anon_cannot_read_password_table' check_name,
  not has_table_privilege('anon','public.leave_task_passwords','SELECT') as ok;
select 'authenticated_cannot_read_password_table_directly' check_name,
  not has_table_privilege('authenticated','public.leave_task_passwords','SELECT') as ok;
select 'anon_can_unlock_with_password' check_name,
  has_function_privilege('anon','public.ejadwal_unlock_leave_task_hf7(text,date,smallint,text)','EXECUTE') as ok;
select 'anon_cannot_list_passwords' check_name,
  not has_function_privilege('anon','public.ejadwal_list_leave_task_passwords_hf7(uuid[])','EXECUTE') as ok;
select 'anon_cannot_change_password' check_name,
  not has_function_privilege('anon','public.ejadwal_set_leave_task_password_hf7(uuid,text)','EXECUTE') as ok;
-- Count only; no passwords are emitted.
select 'active_approved_requests_missing_password' check_name,
  count(*) = 0 as ok
from public.leave_requests lr
left join public.leave_task_passwords tp on tp.leave_request_id=lr.id
where lr.status='APPROVED' and lr.deleted_at is null and tp.leave_request_id is null;
