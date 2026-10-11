-- Verification only: V3.6 legacy-import support.
select
  c.relname as index_name,
  pg_get_indexdef(i.indexrelid) as definition
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'teachers_legacy_row_id_uidx',
    'schedule_master_legacy_row_id_uidx',
    'schedule_incidentals_legacy_row_id_uidx',
    'academic_events_legacy_row_id_uidx',
    'coverage_slots_legacy_log_id_uidx'
  )
order by c.relname;
