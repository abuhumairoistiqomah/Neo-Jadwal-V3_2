-- E-Jadwal V3.5 — Auth / RLS Foundation
-- Apply AFTER 202610030001_v3_4_initial_schema.sql
--
-- Goals:
-- 1) Keep anonymous browser access closed.
-- 2) Allow signed-in users to read operational master/schedule data.
-- 3) Scope leave/task access to the involved teacher or staff.
-- 4) Reserve sensitive mutations for ADMIN/WAKASEK as appropriate.
-- 5) Provide helper functions that avoid recursive RLS lookups.

begin;

-- ---------------------------------------------------------------------------
-- Security helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_user_has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = required_role
  );
$$;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('WAKASEK', 'ADMIN')
  );
$$;

create or replace function public.current_user_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.teacher_id
  from public.user_profiles up
  where up.user_id = auth.uid()
    and up.is_active = true
  limit 1;
$$;

create or replace function public.current_user_can_view_coverage(target_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coverage_slots cs
    where cs.id = target_slot_id
      and cs.deleted_at is null
      and (
        public.current_user_is_staff()
        or cs.absent_teacher_id = public.current_user_teacher_id()
        or cs.substitute_teacher_id = public.current_user_teacher_id()
      )
  );
$$;

create or replace function public.current_user_can_manage_coverage_task(target_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coverage_slots cs
    where cs.id = target_slot_id
      and cs.deleted_at is null
      and (
        public.current_user_is_staff()
        or cs.absent_teacher_id = public.current_user_teacher_id()
      )
  );
$$;

create or replace function public.current_user_can_view_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_tasks lt
    where lt.id = target_task_id
      and lt.deleted_at is null
      and public.current_user_can_view_coverage(lt.coverage_slot_id)
  );
$$;

create or replace function public.current_user_can_manage_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_tasks lt
    where lt.id = target_task_id
      and lt.deleted_at is null
      and public.current_user_can_manage_coverage_task(lt.coverage_slot_id)
  );
$$;

revoke all on function public.current_user_has_role(text) from public;
revoke all on function public.current_user_is_staff() from public;
revoke all on function public.current_user_teacher_id() from public;
revoke all on function public.current_user_can_view_coverage(uuid) from public;
revoke all on function public.current_user_can_manage_coverage_task(uuid) from public;
revoke all on function public.current_user_can_view_task(uuid) from public;
revoke all on function public.current_user_can_manage_task(uuid) from public;

grant execute on function public.current_user_has_role(text) to authenticated;
grant execute on function public.current_user_is_staff() to authenticated;
grant execute on function public.current_user_teacher_id() to authenticated;
grant execute on function public.current_user_can_view_coverage(uuid) to authenticated;
grant execute on function public.current_user_can_manage_coverage_task(uuid) to authenticated;
grant execute on function public.current_user_can_view_task(uuid) to authenticated;
grant execute on function public.current_user_can_manage_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit API grants. The project was created with automatic table exposure
-- disabled, so access is granted intentionally here and then filtered by RLS.
-- ---------------------------------------------------------------------------
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

grant usage on schema public to authenticated;

grant select on table
  public.user_profiles,
  public.user_roles,
  public.teachers,
  public.classes,
  public.rooms,
  public.schedule_master,
  public.schedule_master_teachers,
  public.schedule_incidentals,
  public.schedule_incidental_teacher_overrides,
  public.academic_events,
  public.leave_requests,
  public.coverage_slots,
  public.learning_tasks,
  public.task_resources,
  public.audit_logs
  to authenticated;

grant insert, update, delete on table
  public.user_profiles,
  public.user_roles,
  public.teachers,
  public.classes,
  public.rooms,
  public.schedule_master,
  public.schedule_master_teachers,
  public.schedule_incidentals,
  public.schedule_incidental_teacher_overrides,
  public.academic_events,
  public.leave_requests,
  public.coverage_slots,
  public.learning_tasks,
  public.task_resources
  to authenticated;

-- ---------------------------------------------------------------------------
-- Drop policies first so this migration is safe to re-run in staging.
-- ---------------------------------------------------------------------------
drop policy if exists user_profiles_select_self_staff on public.user_profiles;
drop policy if exists user_profiles_admin_write on public.user_profiles;
drop policy if exists user_roles_select_self_staff on public.user_roles;
drop policy if exists user_roles_admin_write on public.user_roles;

drop policy if exists teachers_authenticated_read on public.teachers;
drop policy if exists teachers_admin_write on public.teachers;
drop policy if exists classes_authenticated_read on public.classes;
drop policy if exists classes_admin_write on public.classes;
drop policy if exists rooms_authenticated_read on public.rooms;
drop policy if exists rooms_admin_write on public.rooms;
drop policy if exists schedule_master_authenticated_read on public.schedule_master;
drop policy if exists schedule_master_admin_write on public.schedule_master;
drop policy if exists schedule_master_teachers_authenticated_read on public.schedule_master_teachers;
drop policy if exists schedule_master_teachers_admin_write on public.schedule_master_teachers;
drop policy if exists schedule_incidentals_authenticated_read on public.schedule_incidentals;
drop policy if exists schedule_incidentals_admin_write on public.schedule_incidentals;
drop policy if exists schedule_incidental_teacher_overrides_authenticated_read on public.schedule_incidental_teacher_overrides;
drop policy if exists schedule_incidental_teacher_overrides_admin_write on public.schedule_incidental_teacher_overrides;
drop policy if exists academic_events_authenticated_read on public.academic_events;
drop policy if exists academic_events_admin_write on public.academic_events;

drop policy if exists leave_requests_teacher_select on public.leave_requests;
drop policy if exists leave_requests_teacher_insert on public.leave_requests;
drop policy if exists leave_requests_staff_all on public.leave_requests;

drop policy if exists coverage_slots_teacher_select on public.coverage_slots;
drop policy if exists coverage_slots_staff_all on public.coverage_slots;

drop policy if exists learning_tasks_involved_select on public.learning_tasks;
drop policy if exists learning_tasks_owner_insert on public.learning_tasks;
drop policy if exists learning_tasks_owner_update on public.learning_tasks;
drop policy if exists learning_tasks_owner_delete on public.learning_tasks;
drop policy if exists learning_tasks_staff_all on public.learning_tasks;

drop policy if exists task_resources_involved_select on public.task_resources;
drop policy if exists task_resources_owner_insert on public.task_resources;
drop policy if exists task_resources_owner_update on public.task_resources;
drop policy if exists task_resources_owner_delete on public.task_resources;
drop policy if exists task_resources_staff_all on public.task_resources;

drop policy if exists audit_logs_staff_select on public.audit_logs;

-- ---------------------------------------------------------------------------
-- Identity / role tables
-- ---------------------------------------------------------------------------
create policy user_profiles_select_self_staff
on public.user_profiles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_staff()
);

create policy user_profiles_admin_write
on public.user_profiles
for all
to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy user_roles_select_self_staff
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_user_is_staff()
);

create policy user_roles_admin_write
on public.user_roles
for all
to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

-- ---------------------------------------------------------------------------
-- Shared operational reference data: signed-in users read, ADMIN writes.
-- ---------------------------------------------------------------------------
create policy teachers_authenticated_read
on public.teachers for select to authenticated using (true);
create policy teachers_admin_write
on public.teachers for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy classes_authenticated_read
on public.classes for select to authenticated using (true);
create policy classes_admin_write
on public.classes for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy rooms_authenticated_read
on public.rooms for select to authenticated using (true);
create policy rooms_admin_write
on public.rooms for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy schedule_master_authenticated_read
on public.schedule_master for select to authenticated using (true);
create policy schedule_master_admin_write
on public.schedule_master for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy schedule_master_teachers_authenticated_read
on public.schedule_master_teachers for select to authenticated using (true);
create policy schedule_master_teachers_admin_write
on public.schedule_master_teachers for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy schedule_incidentals_authenticated_read
on public.schedule_incidentals for select to authenticated using (true);
create policy schedule_incidentals_admin_write
on public.schedule_incidentals for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy schedule_incidental_teacher_overrides_authenticated_read
on public.schedule_incidental_teacher_overrides for select to authenticated using (true);
create policy schedule_incidental_teacher_overrides_admin_write
on public.schedule_incidental_teacher_overrides for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create policy academic_events_authenticated_read
on public.academic_events for select to authenticated using (true);
create policy academic_events_admin_write
on public.academic_events for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

-- ---------------------------------------------------------------------------
-- Leave workflow
-- Teacher: own request only. Staff: operational approval access.
-- ---------------------------------------------------------------------------
create policy leave_requests_teacher_select
on public.leave_requests
for select
to authenticated
using (
  teacher_id = public.current_user_teacher_id()
);

create policy leave_requests_teacher_insert
on public.leave_requests
for insert
to authenticated
with check (
  teacher_id = public.current_user_teacher_id()
  and submitted_by = auth.uid()
  and status = 'SUBMITTED'
);

create policy leave_requests_staff_all
on public.leave_requests
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- ---------------------------------------------------------------------------
-- Coverage / badal queue
-- Teachers see slots where they are absent/substitute. Staff manage all.
-- ---------------------------------------------------------------------------
create policy coverage_slots_teacher_select
on public.coverage_slots
for select
to authenticated
using (
  absent_teacher_id = public.current_user_teacher_id()
  or substitute_teacher_id = public.current_user_teacher_id()
);

create policy coverage_slots_staff_all
on public.coverage_slots
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- ---------------------------------------------------------------------------
-- Learning tasks / Drive-link metadata
-- Absent teacher owns task content; substitute can read; staff can manage.
-- ---------------------------------------------------------------------------
create policy learning_tasks_involved_select
on public.learning_tasks
for select
to authenticated
using (public.current_user_can_view_coverage(coverage_slot_id));

create policy learning_tasks_owner_insert
on public.learning_tasks
for insert
to authenticated
with check (
  public.current_user_can_manage_coverage_task(coverage_slot_id)
  and (created_by is null or created_by = auth.uid() or public.current_user_is_staff())
);

create policy learning_tasks_owner_update
on public.learning_tasks
for update
to authenticated
using (public.current_user_can_manage_coverage_task(coverage_slot_id))
with check (public.current_user_can_manage_coverage_task(coverage_slot_id));

create policy learning_tasks_owner_delete
on public.learning_tasks
for delete
to authenticated
using (public.current_user_can_manage_coverage_task(coverage_slot_id));

create policy learning_tasks_staff_all
on public.learning_tasks
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

create policy task_resources_involved_select
on public.task_resources
for select
to authenticated
using (public.current_user_can_view_task(task_id));

create policy task_resources_owner_insert
on public.task_resources
for insert
to authenticated
with check (public.current_user_can_manage_task(task_id));

create policy task_resources_owner_update
on public.task_resources
for update
to authenticated
using (public.current_user_can_manage_task(task_id))
with check (public.current_user_can_manage_task(task_id));

create policy task_resources_owner_delete
on public.task_resources
for delete
to authenticated
using (public.current_user_can_manage_task(task_id));

create policy task_resources_staff_all
on public.task_resources
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- ---------------------------------------------------------------------------
-- Audit logs are read-only from browser clients in V3.5.
-- Writes will later be performed by trusted DB/server mechanisms.
-- ---------------------------------------------------------------------------
create policy audit_logs_staff_select
on public.audit_logs
for select
to authenticated
using (public.current_user_is_staff());

commit;
