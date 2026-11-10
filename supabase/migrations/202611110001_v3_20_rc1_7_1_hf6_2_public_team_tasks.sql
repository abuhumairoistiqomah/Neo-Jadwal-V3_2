-- V3.20 RC1.7.1 HF6.2 — public, read-only operational tasks across selected dates.
-- School workflow intentionally permits viewing instructional badal tasks without
-- individual teacher login. This function is accessible to anyone holding the
-- public E-Jadwal URL; DO NOT place confidential files in task descriptions.
-- Retains v3 phone-number expiry and its sanitized leave/teacher projections.
-- Does not grant direct access to underlying tables or edit permissions.

create or replace function public.ejadwal_public_schedule_snapshot_v4()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select public.ejadwal_public_schedule_snapshot_v3() as payload
  ), live_coverage as (
    select cs.id
    from public.coverage_slots cs
    where cs.deleted_at is null
      and cs.status not in ('CANCELLED', 'EXPIRED')
  ), visible_tasks as (
    select lt.id, lt.coverage_slot_id, lt.description, lt.deleted_at
    from public.learning_tasks lt
    join live_coverage cs on cs.id = lt.coverage_slot_id
    where lt.deleted_at is null
  )
  select base.payload || jsonb_build_object(
    'learningTasks', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from visible_tasks t
    ),
    'taskResources', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from (
        select tr.id, tr.task_id, tr.resource_type, tr.label, tr.url
        from public.task_resources tr
        join visible_tasks t on t.id = tr.task_id
      ) r
    )
  ) from base;
$$;

revoke all on function public.ejadwal_public_schedule_snapshot_v4() from public;
grant execute on function public.ejadwal_public_schedule_snapshot_v4() to anon, authenticated;

comment on function public.ejadwal_public_schedule_snapshot_v4() is
  'Public read-only teaching tasks/links for all non-cancelled, undeleted coverage dates; inherits sanitized v3 schedule and per-date expiring phone contacts. Never exposes private leave reasons or direct table grants.';
