-- E-JADWAL V3.16.2: reversible, auditable soft deletion for the MANUAL education calendar.
-- Apply AFTER 202610170002_v3_16_education_calendar.sql.
-- Does not touch academic_events, schedule, badal, or teacher data.
begin;

alter table public.education_calendar_events
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null,
  add column if not exists restored_at timestamptz null,
  add column if not exists restored_by uuid null references auth.users(id) on delete set null;

create index if not exists education_calendar_live_dates_idx
  on public.education_calendar_events (start_date, end_date)
  where deleted_at is null and status in ('PUBLISHED','CANCELLED');

-- IMPORTANT: PostgreSQL permissive SELECT policies combine using OR.
-- Both non-admin policies MUST exclude deleted rows; merely adding another
-- restrictive-looking permissive policy would NOT protect deleted secrets.
drop policy if exists education_events_public_select on public.education_calendar_events;
create policy education_events_public_select on public.education_calendar_events
  for select to anon, authenticated
  using (deleted_at is null and status in ('PUBLISHED','CANCELLED') and management_only = false);

drop policy if exists education_events_staff_secret_select on public.education_calendar_events;
create policy education_events_staff_secret_select on public.education_calendar_events
  for select to authenticated
  using (deleted_at is null and management_only = true and status in ('PUBLISHED','CANCELLED') and public.current_user_is_staff());
-- Existing education_events_admin_select remains unchanged so a logged-in ADMIN
-- can inspect soft-deleted rows to restore them. ADMIN insert/update remain unchanged.

-- Audit metadata comes from the database clock and authenticated user, not from
-- the browser. These functions bypass row policies but explicitly verify ADMIN.
create or replace function public.ejadwal_soft_delete_education_event_v1(p_event_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_changed integer;
begin
  if auth.uid() is null or not public.current_user_has_role('ADMIN') then
    raise exception 'Login Supabase dengan role ADMIN diperlukan.' using errcode = '42501';
  end if;
  update public.education_calendar_events
    set deleted_at = now(), deleted_by = auth.uid()
  where id = p_event_id and deleted_at is null;
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

create or replace function public.ejadwal_restore_education_event_v1(p_event_id uuid)
returns boolean language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_changed integer;
begin
  if auth.uid() is null or not public.current_user_has_role('ADMIN') then
    raise exception 'Login Supabase dengan role ADMIN diperlukan.' using errcode = '42501';
  end if;
  update public.education_calendar_events
    set deleted_at = null, restored_at = now(), restored_by = auth.uid()
  where id = p_event_id and deleted_at is not null;
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

revoke all on function public.ejadwal_soft_delete_education_event_v1(uuid) from public, anon;
revoke all on function public.ejadwal_restore_education_event_v1(uuid) from public, anon;
grant execute on function public.ejadwal_soft_delete_education_event_v1(uuid) to authenticated;
grant execute on function public.ejadwal_restore_education_event_v1(uuid) to authenticated;

-- No hard-delete permission or policy is added. Soft deletion is reversible.
commit;
