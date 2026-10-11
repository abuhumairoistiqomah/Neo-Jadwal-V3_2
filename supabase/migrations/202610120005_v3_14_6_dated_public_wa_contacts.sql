-- V3.14.6 RC3.4.8.3 — Dated WhatsApp contact for public badal workflow.
-- Apply AFTER 202610120004_v3_14_6_public_badal_tasks.sql.
-- Scope: only phone numbers belonging to a live dated coverage slot.
-- We never modify the public teacher directory, RLS, or private leave reasons.
-- Guest contacts expire at midnight in Asia/Jakarta on the NEXT DAY.
-- All date authorization is evaluated on the server at request time.

create or replace function public.ejadwal_public_schedule_snapshot_v3()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select public.ejadwal_public_schedule_snapshot_v2() as payload
  ), dated_coverage as (
    select coalesce(jsonb_agg(
      item.value || jsonb_build_object(
        'absent_teacher_whatsapp_e164',
          case when (item.value->>'schedule_date')::date >= (now() at time zone 'Asia/Jakarta')::date
            then absent.whatsapp_e164 else null::text end,
        'substitute_teacher_whatsapp_e164',
          case when (item.value->>'schedule_date')::date >= (now() at time zone 'Asia/Jakarta')::date
            then substitute.whatsapp_e164 else null::text end
      )
    ), '[]'::jsonb) as rows
    from base
    cross join lateral jsonb_array_elements(base.payload->'coverageSlots') as item(value)
    left join public.teachers absent
      on absent.id::text = item.value->>'absent_teacher_id' and absent.is_active = true
    left join public.teachers substitute
      on substitute.id::text = item.value->>'substitute_teacher_id' and substitute.is_active = true
    where item.value->>'status' not in ('CANCELLED', 'EXPIRED')
  )
  select base.payload || jsonb_build_object('coverageSlots', dated_coverage.rows)
  from base, dated_coverage;
$$;

revoke all on function public.ejadwal_public_schedule_snapshot_v3() from public;
grant execute on function public.ejadwal_public_schedule_snapshot_v3() to anon, authenticated;

comment on function public.ejadwal_public_schedule_snapshot_v3() is
  'Public read-only dated coverage contacts. No global teacher phone directory; old coverage phone fields become null from the following Asia/Jakarta day. Based on public v2 tasks projection.';
