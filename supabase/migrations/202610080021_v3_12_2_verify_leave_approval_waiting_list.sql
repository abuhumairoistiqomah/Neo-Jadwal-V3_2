-- E-Jadwal V3.12.2 verifier. Run after migration 020.

select 'decision_rpc_exists' as check_name,
       to_regprocedure('public.ejadwal_decide_leave_request(uuid,text,text)') is not null as ok
union all
select 'anon_cannot_execute_decision_rpc',
       not has_function_privilege('anon', 'public.ejadwal_decide_leave_request(uuid,text,text)', 'EXECUTE')
union all
select 'authenticated_can_execute_decision_rpc',
       has_function_privilege('authenticated', 'public.ejadwal_decide_leave_request(uuid,text,text)', 'EXECUTE')
union all
select 'coverage_supports_waiting',
       exists (
         select 1 from pg_constraint
         where conrelid = 'public.coverage_slots'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) ilike '%WAITING%ASSIGNED%'
       )
union all
select 'coverage_supports_leave_workflow_source',
       exists (
         select 1 from pg_constraint
         where conrelid = 'public.coverage_slots'::regclass
           and contype = 'c'
           and pg_get_constraintdef(oid) ilike '%LEAVE_WORKFLOW%'
       )
union all
select 'leave_request_slots_exists',
       to_regclass('public.leave_request_slots') is not null
union all
select 'leave_request_periods_exists',
       to_regclass('public.leave_request_periods') is not null
union all
select 'staff_helper_exists',
       to_regprocedure('public.current_user_is_staff()') is not null;
