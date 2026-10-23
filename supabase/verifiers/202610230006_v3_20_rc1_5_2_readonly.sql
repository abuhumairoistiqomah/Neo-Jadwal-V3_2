-- V3.20 RC1.5.2 read-only verification: first query checks schema/function,
-- second summarizes remaining legacy-copy marker rows for manual review.
select
  exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='schedule_incidentals'
      and column_name='copied_from_incidental_id') as provenance_column_exists,
  to_regprocedure('public.ejadwal_copy_incidental_lessons_v320_rc152(date,uuid,integer[],uuid[],boolean,boolean,boolean)')
    is not null as faithful_copy_rpc_exists;

select
  count(*) filter(where copied_from_incidental_id is not null) as copies_with_provenance,
  count(*) filter(where incidental_type ilike 'COPY_INCIDENTAL_RC15%') as legacy_type_markers_remaining,
  count(*) filter(where reason like 'Salin jadwal insidental dari %') as legacy_reason_markers_remaining
from public.schedule_incidentals
where deleted_at is null;

select id, schedule_date, class_id, period, reason, incidental_type,
       override_is_combined, override_class_mode, override_special_note,
       copied_from_incidental_id
from public.schedule_incidentals
where deleted_at is null and copied_from_incidental_id is not null
order by updated_at desc limit 20;
