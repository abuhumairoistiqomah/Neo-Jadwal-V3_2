-- V3.14.6 RC3.4.8.2 — Restore operational substitute-teaching tasks in guest view.
--
-- Scope: tasks/resources that belong to currently valid coverage_slots on
-- the current/future SCHOOL day (Asia/Jakarta). Not the teacher's private leave
-- request, personal reason, raw notes, or unrelated Drive files.
--
-- IMPORTANT: the guest view is unauthenticated. These particular substitute
-- instructions and links must be deliberately shareable with school users who
-- open the public E-Jadwal site. Restricted Google Drive files may still ask
-- viewers to sign in with their permitted Google account.
--
-- Additive RPC, keeping the original v1 untouched for rollback.
-- Must be applied AFTER 202610120003_v3_14_6_guest_supabase_read.sql.

create or replace function public.ejadwal_public_schedule_snapshot_v2()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with live_coverage as (
    select cs.id
    from public.coverage_slots cs
    where cs.deleted_at is null
      and cs.status not in ('CANCELLED', 'EXPIRED')
      and cs.schedule_date >= (now() at time zone 'Asia/Jakarta')::date
  ),
  visible_tasks as (
    select lt.id, lt.coverage_slot_id, lt.description, lt.deleted_at
    from public.learning_tasks lt
    join live_coverage cs on cs.id = lt.coverage_slot_id
    where lt.deleted_at is null
  )
  select public.ejadwal_public_schedule_snapshot_v1() || jsonb_build_object(
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
  );
$$;

revoke all on function public.ejadwal_public_schedule_snapshot_v2() from public;
grant execute on function public.ejadwal_public_schedule_snapshot_v2() to anon, authenticated;

comment on function public.ejadwal_public_schedule_snapshot_v2() is
  'Public schedule projection with instructional descriptions/links for live, non-cancelled substitute slots from the current Jakarta school date. Excludes private leave reasons, phone numbers, teacher notes and unrelated task resources; read-only.';
