-- V3.13.3 verifier — one result set.
select * from (
  select 1 as seq, 'academic_events_group_code_exists' as check_name,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'academic_events' and column_name = 'admin_group_code'
    ) as ok
  union all
  select 2, 'academic_events_staff_write_policy_exists',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'academic_events' and policyname = 'academic_events_staff_write'
    )
  union all
  select 3, 'substitute_constraints_staff_write_policy_exists',
    exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'substitute_constraints' and policyname = 'substitute_constraints_staff_all'
    )
  union all
  select 4, 'operational_audit_function_exists',
    to_regprocedure('public.ejadwal_audit_operational_rule_change()') is not null
  union all
  select 5, 'constraint_audit_trigger_exists',
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'substitute_constraints'
        and t.tgname = 'audit_operational_rule_change' and not t.tgisinternal
    )
  union all
  select 6, 'calendar_audit_trigger_exists',
    exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'academic_events'
        and t.tgname = 'audit_operational_rule_change' and not t.tgisinternal
    )
  union all
  select 7, 'substitute_constraints_support_hard_block',
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'substitute_constraints'
        and column_name = 'override_allowed' and data_type = 'boolean'
    )
  union all
  select 8, 'substitute_constraints_support_jp0',
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.substitute_constraints'::regclass
        and pg_get_constraintdef(oid) ilike '%period_start%0%6%'
    )
  union all
  select 9, 'academic_events_support_jp0',
    exists (
      select 1 from pg_constraint
      where conrelid = 'public.academic_events'::regclass
        and pg_get_constraintdef(oid) ilike '%period_start%0%6%'
    )
) checks
order by seq;
