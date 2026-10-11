-- V3.12.1 verification. Every row should return ok = true.
select 'leave_request_periods_exists' as check_name,
       to_regclass('public.leave_request_periods') is not null as ok;

select 'leave_request_periods_rls_enabled' as check_name,
       coalesce((select relrowsecurity from pg_class where oid = 'public.leave_request_periods'::regclass), false) as ok;

select 'anon_cannot_write_period_table' as check_name,
       not has_table_privilege('anon', 'public.leave_request_periods', 'INSERT')
       and not has_table_privilege('anon', 'public.leave_request_periods', 'UPDATE')
       and not has_table_privilege('anon', 'public.leave_request_periods', 'DELETE') as ok;

select 'public_v2_rpc_exists' as check_name,
       to_regprocedure('public.ejadwal_submit_public_leave_request_v2(text,date,text,text,text,jsonb,jsonb)') is not null as ok;

select 'anon_can_execute_public_v2_rpc' as check_name,
       has_function_privilege('anon', 'public.ejadwal_submit_public_leave_request_v2(text,date,text,text,text,jsonb,jsonb)', 'EXECUTE') as ok;

select 'school_period_validator_exists' as check_name,
       to_regprocedure('public.ejadwal_school_period_active(date,smallint)') is not null as ok;

select 'teacher_period_validator_exists' as check_name,
       to_regprocedure('public.ejadwal_teacher_has_active_teaching_at_period(uuid,date,smallint)') is not null as ok;

select 'period_type_constraint_exists' as check_name,
       exists (
         select 1 from pg_constraint
         where conrelid = 'public.leave_request_periods'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) ilike '%TEACHING%FREE%'
       ) as ok;
