-- E-Jadwal V3.6.2 — Verify Migration Hardening
-- Read-only verifier. Every row should return ok = true.

with active_identity_index as (
  select indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'coverage_slots'
    and indexname = 'coverage_slots_active_identity_uidx'
),
legacy_key_index as (
  select indexdef
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'coverage_slots'
    and indexname = 'coverage_slots_legacy_log_id_uidx'
),
live_duplicates as (
  select count(*)::int as duplicate_groups
  from (
    select schedule_date, class_id, period, absent_teacher_id
    from public.coverage_slots
    where deleted_at is null
      and absent_teacher_id is not null
      and status <> 'CANCELLED'
      and source <> 'LEGACY_IMPORT'
    group by schedule_date, class_id, period, absent_teacher_id
    having count(*) > 1
  ) d
),
legacy_key_duplicates as (
  select count(*)::int as duplicate_groups
  from (
    select legacy_log_id
    from public.coverage_slots
    where legacy_log_id is not null
    group by legacy_log_id
    having count(*) > 1
  ) d
),
coverage_rls as (
  select rowsecurity
  from pg_tables
  where schemaname = 'public' and tablename = 'coverage_slots'
),
legacy_class_constraint as (
  select pg_get_constraintdef(c.oid) as constraint_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'coverage_slots'
    and c.conname = 'coverage_slots_live_class_required_ck'
)
select * from (
  select
    'active_identity_index_excludes_legacy'::text as check_name,
    exists (
      select 1 from active_identity_index
      where indexdef ilike '%source%LEGACY_IMPORT%'
    ) as ok,
    coalesce((select indexdef from active_identity_index limit 1), 'MISSING') as detail

  union all

  select
    'legacy_log_id_unique_index_exists',
    exists (select 1 from legacy_key_index),
    coalesce((select indexdef from legacy_key_index limit 1), 'MISSING')

  union all

  select
    'no_duplicate_active_operational_coverage',
    coalesce((select duplicate_groups from live_duplicates), 0) = 0,
    'duplicate groups=' || coalesce((select duplicate_groups from live_duplicates), 0)::text

  union all

  select
    'no_duplicate_legacy_log_id',
    coalesce((select duplicate_groups from legacy_key_duplicates), 0) = 0,
    'duplicate groups=' || coalesce((select duplicate_groups from legacy_key_duplicates), 0)::text

  union all

  select
    'coverage_slots_rls_enabled',
    coalesce((select rowsecurity from coverage_rls), false),
    'rowsecurity=' || coalesce((select rowsecurity::text from coverage_rls), 'MISSING')

  union all

  select
    'live_class_constraint_preserved',
    exists (
      select 1 from legacy_class_constraint
      where constraint_def ilike '%LEGACY_IMPORT%'
        and constraint_def ilike '%class_id%'
    ),
    coalesce((select constraint_def from legacy_class_constraint limit 1), 'MISSING')
) checks
order by check_name;
