-- E-Jadwal V3.11 — Verify Inval Write Cutover
-- Read-only. Every check should return ok = true.

with expected_functions(signature) as (
  values
    ('ejadwal_save_inval_bundle(jsonb,jsonb,text)'::text),
    ('ejadwal_update_inval_assignment(uuid,uuid,text,uuid[],text)'::text),
    ('ejadwal_delete_inval_assignment(uuid,text)'::text)
), function_checks as (
  select
    ef.signature,
    to_regprocedure('public.' || ef.signature) is not null as exists_ok,
    coalesce(has_function_privilege('authenticated', 'public.' || ef.signature, 'EXECUTE'), false) as authenticated_execute,
    coalesce(has_function_privilege('anon', 'public.' || ef.signature, 'EXECUTE'), false) as anon_execute
  from expected_functions ef
), live_duplicate_groups as (
  select count(*)::int as n
  from (
    select schedule_date, class_id, period, absent_teacher_id
    from public.coverage_slots
    where deleted_at is null
      and status <> 'CANCELLED'
      and source <> 'LEGACY_IMPORT'
      and absent_teacher_id is not null
    group by schedule_date, class_id, period, absent_teacher_id
    having count(*) > 1
  ) d
), audit_grants as (
  select
    has_table_privilege('authenticated', 'public.audit_logs', 'SELECT') as can_select,
    has_table_privilege('authenticated', 'public.audit_logs', 'INSERT') as can_insert
)
select * from (
  select
    'rpc_' || replace(replace(fc.signature, '(', '_'), ')', '') as check_name,
    fc.exists_ok and fc.authenticated_execute and not fc.anon_execute as ok,
    'exists=' || fc.exists_ok::text || ', authenticated_execute=' || fc.authenticated_execute::text || ', anon_execute=' || fc.anon_execute::text as detail
  from function_checks fc

  union all

  select
    'audit_browser_is_read_only',
    coalesce((select can_select and not can_insert from audit_grants), false),
    'authenticated select=' || coalesce((select can_select::text from audit_grants), 'false') || ', insert=' || coalesce((select can_insert::text from audit_grants), 'false')

  union all

  select
    'no_duplicate_active_operational_coverage',
    coalesce((select n from live_duplicate_groups), 0) = 0,
    'duplicate groups=' || coalesce((select n from live_duplicate_groups), 0)::text

  union all

  select
    'constraint_override_evidence_table_rls',
    coalesce((select rowsecurity from pg_tables where schemaname='public' and tablename='coverage_constraint_overrides'), false),
    'rowsecurity=' || coalesce((select rowsecurity::text from pg_tables where schemaname='public' and tablename='coverage_constraint_overrides'), 'missing')
) checks
order by check_name;
