-- E-Jadwal V3.7.3 — preserve class relationship semantics used by timetable colors.

alter table public.schedule_master
  add column if not exists class_mode text;

update public.schedule_master
set class_mode = case when is_combined then 'COMBINED' else 'NORMAL' end
where class_mode is null;

alter table public.schedule_master
  alter column class_mode set default 'NORMAL';

alter table public.schedule_master
  alter column class_mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'schedule_master_class_mode_check'
      and conrelid = 'public.schedule_master'::regclass
  ) then
    alter table public.schedule_master
      add constraint schedule_master_class_mode_check
      check (class_mode in ('NORMAL', 'COMBINED', 'ALTERNATING'));
  end if;
end $$;

alter table public.schedule_incidentals
  add column if not exists override_class_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'schedule_incidentals_override_class_mode_check'
      and conrelid = 'public.schedule_incidentals'::regclass
  ) then
    alter table public.schedule_incidentals
      add constraint schedule_incidentals_override_class_mode_check
      check (override_class_mode is null or override_class_mode in ('NORMAL', 'COMBINED', 'ALTERNATING'));
  end if;
end $$;

-- Existing COMBINED rows can be reconstructed from the old boolean immediately.
-- ALTERNATING rows cannot be reconstructed from the old schema, so rerun the
-- repeatable V3 migration after applying this migration to repopulate from Sheet.
update public.schedule_master
set class_mode = 'COMBINED'
where is_combined is true;
