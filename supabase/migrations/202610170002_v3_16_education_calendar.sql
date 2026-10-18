-- E-Jadwal V3.16: independent manual education calendar, no link to academic_events.
-- Apply AFTER V3.15 on STAGING. Browser uses publishable key; RLS is authorization boundary.
begin;
create table if not exists public.education_calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text not null default '',
  category text not null default 'Lainnya',
  start_date date not null,
  end_date date not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','CANCELLED')),
  management_only boolean not null default false,
  audience_rule jsonb not null default '{"all":true,"groups":[]}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint education_calendar_date_order check (start_date <= end_date),
  constraint education_calendar_valid_audience check(
    jsonb_typeof(audience_rule) = 'object'
    and jsonb_typeof(audience_rule->'all') = 'boolean'
    and jsonb_typeof(audience_rule->'groups') = 'array'
  )
);
create index if not exists education_calendar_dates_idx on public.education_calendar_events(start_date,end_date)
  where status in ('PUBLISHED','CANCELLED');
drop trigger if exists education_calendar_updated_at on public.education_calendar_events;
create trigger education_calendar_updated_at before update on public.education_calendar_events
  for each row execute function public.set_updated_at();

-- Organizational tags contain only teacher UUID + category code, no confidential event detail.
-- They are readable to permit anonymous teachers to receive targeted PUBLIC reminders.
create table if not exists public.education_audience_memberships (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  team_code text not null check (length(trim(team_code)) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key(teacher_id,team_code)
);
create index if not exists education_audience_team_idx on public.education_audience_memberships(team_code);

alter table public.education_calendar_events enable row level security;
alter table public.education_audience_memberships enable row level security;
-- Explicit anonymous grants are needed because default Supabase policies may revoke anon access.
grant select on public.education_calendar_events to anon, authenticated;
grant select on public.education_audience_memberships to anon, authenticated;
grant insert,update on public.education_calendar_events to authenticated;
revoke delete on public.education_calendar_events from authenticated; -- preserve cancelled-event history
grant insert,update,delete on public.education_audience_memberships to authenticated;

drop policy if exists education_events_public_select on public.education_calendar_events;
create policy education_events_public_select on public.education_calendar_events
  for select to anon, authenticated
  using (status in ('PUBLISHED','CANCELLED') and management_only = false);
drop policy if exists education_events_staff_secret_select on public.education_calendar_events;
create policy education_events_staff_secret_select on public.education_calendar_events
  for select to authenticated
  using (management_only = true and status in ('PUBLISHED','CANCELLED') and public.current_user_is_staff());
drop policy if exists education_events_admin_select on public.education_calendar_events;
create policy education_events_admin_select on public.education_calendar_events
  for select to authenticated using (public.current_user_has_role('ADMIN'));
drop policy if exists education_events_admin_insert on public.education_calendar_events;
create policy education_events_admin_insert on public.education_calendar_events
  for insert to authenticated with check (public.current_user_has_role('ADMIN'));
drop policy if exists education_events_admin_update on public.education_calendar_events;
create policy education_events_admin_update on public.education_calendar_events
  for update to authenticated using (public.current_user_has_role('ADMIN')) with check (public.current_user_has_role('ADMIN'));
-- No DELETE policy: cancel an event (status CANCELLED) instead of hard-deleting it.

drop policy if exists education_audience_public_read on public.education_audience_memberships;
create policy education_audience_public_read on public.education_audience_memberships
  for select to anon, authenticated using (true);
drop policy if exists education_audience_admin_insert on public.education_audience_memberships;
create policy education_audience_admin_insert on public.education_audience_memberships
  for insert to authenticated with check(public.current_user_has_role('ADMIN'));
drop policy if exists education_audience_admin_delete on public.education_audience_memberships;
create policy education_audience_admin_delete on public.education_audience_memberships
  for delete to authenticated using(public.current_user_has_role('ADMIN'));

-- No grants/policies on other tables are changed. Absolutely no automatic schedule effects.
commit;
