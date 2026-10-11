-- E-Jadwal V3.4 — Persistence & Data Architecture
-- Target: Supabase PostgreSQL (STAGING first)
--
-- IMPORTANT:
-- 1) This migration creates schema only. It does NOT import Google Sheets data.
-- 2) Google Drive remains the file store. This database stores only Drive metadata/links.
-- 3) Legacy `akun.password` values are intentionally NOT migrated.
-- 4) RLS is enabled without end-user policies in V3.4. Client access stays closed
--    until V3.5 wires Supabase Auth + repository policies.

begin;

-- ---------------------------------------------------------------------------
-- Common trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity / authorization
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  teacher_id uuid null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('TEACHER', 'WAKASEK', 'ADMIN')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  short_name text null,
  gender text not null default 'UNKNOWN' check (gender in ('IKHWAN', 'AKHWAT', 'UNKNOWN')),
  whatsapp_e164 text null,
  primary_subjects_text text null,
  subject_cluster text null,
  levels_text text null,
  additional_task text null,
  notes text null,
  legacy_name text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  drop constraint if exists user_profiles_teacher_id_fkey;
alter table public.user_profiles
  add constraint user_profiles_teacher_id_fkey
  foreign key (teacher_id) references public.teachers(id) on delete set null;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  gender text not null default 'UNKNOWN' check (gender in ('IKHWAN', 'AKHWAT', 'UNKNOWN')),
  grade_level smallint null check (grade_level is null or grade_level between 1 and 12),
  program text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  capacity integer null check (capacity is null or capacity >= 0),
  location text null,
  room_type text null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recurring master schedule
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_master (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  day_of_week smallint not null check (day_of_week between 1 and 7), -- Monday=1
  period smallint not null check (period between 0 and 6),
  start_time time null,
  end_time time null,
  subject text not null default '',
  room_id text null references public.rooms(id) on delete set null,
  is_combined boolean not null default false,
  other_teachers_supervise boolean not null default false,
  special_note text null,
  is_active boolean not null default true,
  legacy_row_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.schedule_master_teachers (
  schedule_id uuid not null references public.schedule_master(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  teacher_id uuid null references public.teachers(id) on delete set null,
  teacher_name_snapshot text not null default '',
  created_at timestamptz not null default now(),
  primary key (schedule_id, position)
);

-- ---------------------------------------------------------------------------
-- Date-specific schedule changes
--
-- Null override fields mean INHERIT from master. This mirrors V3.3 canonical
-- field-level inheritance instead of treating blank as destructive overwrite.
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_incidentals (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  period smallint not null check (period between 0 and 6),
  kind text not null default 'OVERRIDE' check (kind in ('OVERRIDE', 'ADDITIONAL')),
  override_subject text null,
  override_room_id text null references public.rooms(id) on delete set null,
  override_is_combined boolean null,
  override_special_note text null,
  reason text null,
  incidental_type text null,
  legacy_row_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.schedule_incidental_teacher_overrides (
  incidental_id uuid not null references public.schedule_incidentals(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  action text not null default 'SET' check (action in ('SET', 'CLEAR')),
  teacher_id uuid null references public.teachers(id) on delete set null,
  teacher_name_snapshot text null,
  created_at timestamptz not null default now(),
  primary key (incidental_id, position),
  constraint incidental_teacher_action_payload_ck check (
    (action = 'CLEAR' and teacher_id is null and coalesce(teacher_name_snapshot, '') = '')
    or
    (action = 'SET' and (teacher_id is not null or coalesce(teacher_name_snapshot, '') <> ''))
  )
);

-- ---------------------------------------------------------------------------
-- Academic calendar
-- UUID is the real row identity. legacy_event_code is intentionally NOT unique:
-- the current sheet can repeat one code across multiple target classes.
-- ---------------------------------------------------------------------------
create table if not exists public.academic_events (
  id uuid primary key default gen_random_uuid(),
  legacy_event_code text null,
  date_start date not null,
  date_end date not null,
  event_name text not null,
  event_type text not null,
  scope text not null default 'ALL' check (scope in ('ALL', 'CLASS')),
  class_id uuid null references public.classes(id) on delete cascade,
  period_start smallint null check (period_start is null or period_start between 0 and 6),
  period_end smallint null check (period_end is null or period_end between 0 and 6),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_events_date_order_ck check (date_end >= date_start),
  constraint academic_events_period_pair_ck check (
    (period_start is null and period_end is null)
    or
    (period_start is not null and period_end is not null and period_end >= period_start)
  ),
  constraint academic_events_scope_ck check (
    (scope = 'ALL' and class_id is null)
    or
    (scope = 'CLASS' and class_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Leave approval workflow
-- ---------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  date_start date not null,
  date_end date not null,
  reason text not null,
  detail text null,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED', 'APPROVED', 'DECLINED', 'CANCELLED')),
  submitted_by uuid null references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_by uuid null references auth.users(id) on delete set null,
  decided_at timestamptz null,
  decision_note text null,
  cancelled_by uuid null references auth.users(id) on delete set null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_order_ck check (date_end >= date_start)
);

-- One operational row = one absent teacher in one concrete class/date/JP.
-- Approved leave requests generate rows here; existing Log_Izin imports here too.
create table if not exists public.coverage_slots (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid null references public.leave_requests(id) on delete set null,
  schedule_date date not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  period smallint not null check (period between 0 and 6),
  subject_snapshot text not null default '',
  absent_teacher_id uuid null references public.teachers(id) on delete set null,
  absent_teacher_name_snapshot text not null default '',
  substitute_teacher_id uuid null references public.teachers(id) on delete set null,
  substitute_teacher_name_snapshot text null,
  reason_snapshot text null,
  status text not null default 'WAITING'
    check (status in ('WAITING', 'ASSIGNED', 'NO_SUBSTITUTE', 'CANCELLED', 'COMPLETED')),
  source text not null default 'LEAVE_WORKFLOW'
    check (source in ('LEAVE_WORKFLOW', 'LEGACY_IMPORT', 'ADMIN_MANUAL')),
  schedule_master_id uuid null references public.schedule_master(id) on delete set null,
  schedule_incidental_id uuid null references public.schedule_incidentals(id) on delete set null,
  assigned_by uuid null references auth.users(id) on delete set null,
  assigned_at timestamptz null,
  legacy_log_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Task content + Google Drive metadata only (NO Supabase Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.learning_tasks (
  id uuid primary key default gen_random_uuid(),
  coverage_slot_id uuid not null references public.coverage_slots(id) on delete cascade,
  description text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  deleted_by uuid null references auth.users(id) on delete set null
);

create table if not exists public.task_resources (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.learning_tasks(id) on delete cascade,
  resource_type text not null check (resource_type in ('LINK', 'DRIVE_FILE')),
  label text null,
  url text not null,
  drive_file_id text null,
  file_name text null,
  mime_type text null,
  created_at timestamptz not null default now(),
  constraint task_resource_drive_payload_ck check (
    resource_type <> 'DRIVE_FILE' or drive_file_id is not null
  )
);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated by default as identity primary key,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb null,
  after_data jsonb null,
  request_id uuid null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes for the hot paths used by the canonical schedule / Inval workflow
-- ---------------------------------------------------------------------------
create index if not exists teachers_full_name_lower_idx
  on public.teachers (lower(full_name));
create index if not exists schedule_master_day_class_period_idx
  on public.schedule_master (day_of_week, class_id, period)
  where deleted_at is null and is_active = true;
create index if not exists schedule_master_teacher_teacher_idx
  on public.schedule_master_teachers (teacher_id)
  where teacher_id is not null;
create index if not exists schedule_incidentals_date_class_period_idx
  on public.schedule_incidentals (schedule_date, class_id, period)
  where deleted_at is null;
create index if not exists academic_events_date_idx
  on public.academic_events (date_start, date_end, status);
create index if not exists leave_requests_teacher_status_idx
  on public.leave_requests (teacher_id, status, date_start, date_end);
create index if not exists coverage_slots_date_class_period_idx
  on public.coverage_slots (schedule_date, class_id, period)
  where deleted_at is null;
create index if not exists coverage_slots_absent_teacher_date_idx
  on public.coverage_slots (absent_teacher_id, schedule_date)
  where deleted_at is null;
create index if not exists coverage_slots_substitute_teacher_date_idx
  on public.coverage_slots (substitute_teacher_id, schedule_date)
  where deleted_at is null and substitute_teacher_id is not null;
create unique index if not exists coverage_slots_active_identity_uidx
  on public.coverage_slots (schedule_date, class_id, period, absent_teacher_id)
  where deleted_at is null and absent_teacher_id is not null and status <> 'CANCELLED';
create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles', 'teachers', 'classes', 'rooms', 'schedule_master',
    'schedule_incidentals', 'academic_events', 'leave_requests',
    'coverage_slots', 'learning_tasks'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS: safe-by-default. Policies are deliberately deferred to V3.5.
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.rooms enable row level security;
alter table public.schedule_master enable row level security;
alter table public.schedule_master_teachers enable row level security;
alter table public.schedule_incidentals enable row level security;
alter table public.schedule_incidental_teacher_overrides enable row level security;
alter table public.academic_events enable row level security;
alter table public.leave_requests enable row level security;
alter table public.coverage_slots enable row level security;
alter table public.learning_tasks enable row level security;
alter table public.task_resources enable row level security;
alter table public.audit_logs enable row level security;

commit;
