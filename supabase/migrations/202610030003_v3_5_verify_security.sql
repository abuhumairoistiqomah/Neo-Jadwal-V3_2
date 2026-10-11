-- E-Jadwal V3.5 — read-only verification helpers
-- Safe to run in SQL Editor after the V3.5 RLS migration.

-- 1) All E-Jadwal tables should show rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'academic_events', 'audit_logs', 'classes', 'coverage_slots',
    'learning_tasks', 'leave_requests', 'rooms',
    'schedule_incidental_teacher_overrides', 'schedule_incidentals',
    'schedule_master', 'schedule_master_teachers', 'task_resources',
    'teachers', 'user_profiles', 'user_roles'
  )
order by tablename;

-- 2) List installed policies for review.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) Anonymous role should have no table privileges on public E-Jadwal tables.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;
