-- V3.6.1 verification only. No writes.

select
  'room_unavailability_table' as check_name,
  to_regclass('public.room_unavailability') is not null as ok;

select
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'room_unavailability';

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'room_unavailability'
order by policyname;

select
  column_name,
  is_nullable,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'coverage_slots'
  and column_name in ('class_id', 'class_name_snapshot')
order by column_name;
