-- E-Jadwal V3.5.2 — verification only. This query changes no data.

-- A) Both new tables should exist with RLS=true.
select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('substitute_constraints', 'coverage_constraint_overrides')
order by tablename;

-- B) Expected policies should be present.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('substitute_constraints', 'coverage_constraint_overrides')
order by tablename, policyname;

-- C) Useful structural checks for the migration.
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('substitute_constraints', 'coverage_constraint_overrides')
order by c.table_name, c.ordinal_position;
