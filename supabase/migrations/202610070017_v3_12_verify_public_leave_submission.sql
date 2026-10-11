-- E-Jadwal V3.12 — verification only. No data is modified.

with checks as (
  select
    'leave_request_metadata_columns'::text as check_name,
    (
      select count(*) = 3
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'leave_requests'
        and column_name in ('request_code', 'request_type', 'source')
    ) as ok

  union all

  select
    'leave_request_slots_exists',
    to_regclass('public.leave_request_slots') is not null

  union all

  select
    'leave_request_slots_rls_enabled',
    coalesce((select relrowsecurity from pg_class where oid = 'public.leave_request_slots'::regclass), false)

  union all

  select
    'public_submit_rpc_exists',
    to_regprocedure('public.ejadwal_submit_public_leave_request(text,date,text,text,text,jsonb)') is not null

  union all

  select
    'anon_can_execute_submit_rpc',
    has_function_privilege('anon', 'public.ejadwal_submit_public_leave_request(text,date,text,text,text,jsonb)', 'EXECUTE')

  union all

  select
    'anon_cannot_insert_leave_requests_directly',
    not has_table_privilege('anon', 'public.leave_requests', 'INSERT')

  union all

  select
    'anon_cannot_write_leave_slots_directly',
    not has_table_privilege('anon', 'public.leave_request_slots', 'INSERT')
    and not has_table_privilege('anon', 'public.leave_request_slots', 'UPDATE')
    and not has_table_privilege('anon', 'public.leave_request_slots', 'DELETE')

  union all

  select
    'internal_slot_validator_not_public',
    not has_function_privilege('anon', 'public.ejadwal_teacher_scheduled_for_leave_slot(uuid,date,uuid,smallint)', 'EXECUTE')
)
select * from checks order by check_name;
