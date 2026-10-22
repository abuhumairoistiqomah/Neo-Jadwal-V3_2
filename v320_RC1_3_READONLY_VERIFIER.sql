-- RC1.3 read-only deployment check. Does not alter any records.
select
  'atomic_badal_subject_rpc_exists' as pemeriksaan,
  to_regprocedure('public.ejadwal_save_inval_bundle_v320_rc13(jsonb,jsonb,text)') is not null as pass;

select
  'migration_source_columns' as pemeriksaan,
  exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='schedule_incidentals' and column_name='override_subject') as incidental_subject,
  exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='coverage_slots' and column_name='subject_snapshot') as coverage_subject;

-- Run AFTER a manual test to compare dated subject + coverage snapshot.
-- Replace date/class name if a specific test is available; this query returns
-- only a small recent sample and contains no personal leave reason.
select
  cs.schedule_date, c.display_name as kelas, cs.period as jp,
  cs.subject_snapshot as mapel_log_badal, si.override_subject as mapel_jadwal_bertanggal,
  cs.status, cs.source
from public.coverage_slots cs
join public.classes c on c.id=cs.class_id
left join lateral (
  select s.override_subject from public.schedule_incidentals s
  where s.schedule_date=cs.schedule_date and s.class_id=cs.class_id
    and s.period=cs.period and s.deleted_at is null
  order by s.updated_at desc,s.id desc limit 1
) si on true
where cs.deleted_at is null and cs.source <> 'LEGACY_IMPORT'
  and cs.status in ('ASSIGNED','NO_SUBSTITUTE')
order by cs.updated_at desc limit 30;
