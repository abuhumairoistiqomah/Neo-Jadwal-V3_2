-- E-Jadwal V3.14.3 verifier — analytics RPC repair + PNG release guard
with checks as (
  select 'management_analytics_rpc_exists'::text as check_name,
         to_regprocedure('public.ejadwal_management_analytics_v1(date,date)') is not null as ok
  union all
  select 'management_analytics_returns_jsonb',
         coalesce((
           select p.prorettype = 'jsonb'::regtype
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='ejadwal_management_analytics_v1'
             and pg_get_function_identity_arguments(p.oid)='p_date_start date, p_date_end date'
           limit 1
         ), false)
  union all
  select 'authenticated_can_execute_management_analytics',
         has_function_privilege('authenticated','public.ejadwal_management_analytics_v1(date,date)','EXECUTE')
  union all
  select 'anon_cannot_execute_management_analytics',
         not has_function_privilege('anon','public.ejadwal_management_analytics_v1(date,date)','EXECUTE')
  union all
  select 'analytics_grouping_uses_exact_absent_identity',
         coalesce((
           select position(
             'coalesce(cs.absent_teacher_id::text, lower(trim(cs.absent_teacher_name_snapshot)), ''unknown'')'
             in lower(pg_get_functiondef(p.oid))
           ) > 0
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='ejadwal_management_analytics_v1'
             and pg_get_function_identity_arguments(p.oid)='p_date_start date, p_date_end date'
           limit 1
         ), false)
)
select * from checks order by check_name;
