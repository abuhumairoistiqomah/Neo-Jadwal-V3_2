-- E-JADWAL V3.20 RC1.5.1 • READ-ONLY VERIFIER
-- Run AFTER the RC1.5.1 migration. Never changes database data.
select
  to_regprocedure('public.ejadwal_copy_incidental_lessons_v320_rc151(date,uuid,integer[],uuid[],boolean,boolean,boolean)')
    is not null as rc151_copy_rpc_ready,
  to_regprocedure('public.ejadwal_copy_incidental_lessons_v320_rc15(date,uuid,integer[],uuid[],boolean,boolean,boolean)')
    is not null as legacy_rc15_rpc_preserved;

-- Historic copy inventory, including targets created by RC1.5.
select si.incidental_type, count(*) as active_copied_slots,
       count(*) filter (where exists (
         select 1 from public.schedule_incidental_teacher_overrides ito
         where ito.incidental_id = si.id and ito.action = 'SET'
       )) as copied_slots_with_explicit_teacher_team,
       min(si.schedule_date) as first_day, max(si.schedule_date) as last_day
from public.schedule_incidentals si
where si.deleted_at is null
  and si.incidental_type ilike 'COPY_INCIDENTAL_RC15%'
group by si.incidental_type
order by si.incidental_type;

-- Review dated copy target teams in detail, without creating/updating records.
select si.schedule_date, c.display_name as class_name, si.period,
       si.override_subject as subject, si.override_room_id as room_id,
       si.incidental_type,
       string_agg(coalesce(t.full_name, ito.teacher_name_snapshot, ''), ' / ' order by ito.position)
         as explicit_teacher_team
from public.schedule_incidentals si
join public.classes c on c.id = si.class_id
left join public.schedule_incidental_teacher_overrides ito on ito.incidental_id = si.id and ito.action = 'SET'
left join public.teachers t on t.id = ito.teacher_id
where si.deleted_at is null
  and si.incidental_type ilike 'COPY_INCIDENTAL_RC15%'
group by si.id, si.schedule_date, c.display_name, si.period,
         si.override_subject, si.override_room_id, si.incidental_type
order by si.schedule_date desc, c.display_name, si.period
limit 100;
