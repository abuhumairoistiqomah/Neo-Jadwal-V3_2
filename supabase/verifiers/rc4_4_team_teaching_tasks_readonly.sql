-- RC4.4 READ-ONLY verifier: run AFTER applying 202610210004...
-- This file changes no data.
select 'team_task_writer' as check_name,
       to_regprocedure('public.ejadwal_save_team_teaching_task_v319(uuid,text,jsonb)') is not null as installed
union all
select 'general_no_substitute_ack',
       to_regprocedure('public.ejadwal_acknowledge_inval_team_teaching_v319(jsonb)') is not null
union all
select 'official_duty_task_ack',
       to_regprocedure('public.ejadwal_acknowledge_official_duty_team_teaching_task_v319(uuid,date,smallint,uuid,text,jsonb)') is not null;

select cs.source, cs.status,
       count(*)::integer as no_substitute_slots,
       count(*) filter (where exists (
          select 1 from public.learning_tasks lt
          where lt.coverage_slot_id=cs.id and lt.deleted_at is null
            and nullif(trim(lt.description),'') is not null
       ))::integer as slots_with_task_text
from public.coverage_slots cs
where cs.status='NO_SUBSTITUTE' and cs.deleted_at is null
  and cs.source in ('ADMIN_MANUAL','LEAVE_WORKFLOW','OFFICIAL_DUTY')
group by cs.source,cs.status
order by cs.source;
