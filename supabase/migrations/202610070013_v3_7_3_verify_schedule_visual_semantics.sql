select
  'schedule_master.class_mode' as check_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedule_master' and column_name = 'class_mode'
  ) as ok;

select
  'schedule_incidentals.override_class_mode' as check_name,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'schedule_incidentals' and column_name = 'override_class_mode'
  ) as ok;

select
  class_mode,
  count(*) as row_count
from public.schedule_master
where deleted_at is null
group by class_mode
order by class_mode;
