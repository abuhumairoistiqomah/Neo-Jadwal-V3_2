-- E-JADWAL V3.19 RC4.4 - Existing Task for Team Teaching
-- Apply after RC4.3; test in staging before production.
-- No new tables or columns: coverage_slots -> learning_tasks -> task_resources.
-- Restriction revocation from RC4.3 still cancels its coverage + tasks.
begin;

-- Shared task persistence for NO_SUBSTITUTE: same learning_tasks + task_resources
-- used by badal. No new task column and no fabricated substitute teacher.
create or replace function public.ejadwal_save_team_teaching_task_v319(
  p_coverage_id uuid, p_task_text text, p_resources jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_actor uuid:=auth.uid();
 v_slot public.coverage_slots%rowtype;
 v_task_id uuid;
 v_text text:=trim(coalesce(p_task_text,''));
 v_resources jsonb:=coalesce(p_resources,'[]'::jsonb);
 v_resource jsonb;
 v_type text;
 v_url text;
begin
 if v_actor is null or not public.current_user_is_staff() or not exists(
   select 1 from public.user_roles where user_id=v_actor and role in ('ADMIN','WAKASEK')
 ) then raise exception 'ADMIN_OR_WAKASEK_REQUIRED'; end if;
 if length(v_text)>10000 then raise exception 'TEAM_TASK_TEXT_TOO_LONG'; end if;
 if jsonb_typeof(v_resources)<>'array' or jsonb_array_length(v_resources)>20 then
   raise exception 'INVALID_TEAM_TASK_RESOURCES';
 end if;
 select * into v_slot from public.coverage_slots
   where id=p_coverage_id and status='NO_SUBSTITUTE' and deleted_at is null for update;
 if not found then raise exception 'TEAM_TASK_COVERAGE_NOT_ACTIVE'; end if;
 select lt.id into v_task_id from public.learning_tasks lt
   where lt.coverage_slot_id=p_coverage_id and lt.deleted_at is null
   order by lt.created_at,lt.id limit 1 for update;
 -- Approved teacher-owned tasks always win; admin cannot silently overwrite
 -- the owner's canonical assignment during a no-badal acknowledgement.
 if v_slot.source='LEAVE_WORKFLOW' and v_task_id is not null then return; end if;
 if v_text='' and jsonb_array_length(v_resources)=0 then return; end if;
 if v_task_id is null then
   insert into public.learning_tasks(coverage_slot_id,description,created_by)
     values(p_coverage_id,v_text,v_actor) returning id into v_task_id;
 else
   update public.learning_tasks set description=v_text, updated_at=now() where id=v_task_id;
   delete from public.task_resources where task_id=v_task_id;
 end if;
 for v_resource in select value from jsonb_array_elements(v_resources) loop
   v_type:=upper(trim(coalesce(v_resource->>'resource_type','LINK')));
   v_url:=trim(coalesce(v_resource->>'url',''));
   if v_type not in ('LINK','DRIVE_FILE') or v_url !~* '^https?://' or length(v_url)>2000
     or (v_type='DRIVE_FILE' and nullif(trim(v_resource->>'drive_file_id'),'') is null)
   then raise exception 'INVALID_TEAM_TASK_RESOURCE'; end if;
   insert into public.task_resources(task_id,resource_type,label,url,drive_file_id,file_name,mime_type)
    values(v_task_id,v_type,nullif(trim(v_resource->>'label'),''),v_url,
     nullif(trim(v_resource->>'drive_file_id'),''),
     nullif(trim(v_resource->>'file_name'),''),nullif(trim(v_resource->>'mime_type'),''));
 end loop;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,after_data)
 values(v_actor,'TEAM_TEACHING_TASK_SAVED','coverage_slot',p_coverage_id::text,
   jsonb_build_object('task_id',v_task_id,'has_text',v_text<>'','resource_count',jsonb_array_length(v_resources)));
end;$$;
revoke all on function public.ejadwal_save_team_teaching_task_v319(uuid,text,jsonb) from public,anon;
grant execute on function public.ejadwal_save_team_teaching_task_v319(uuid,text,jsonb) to authenticated;

create or replace function public.ejadwal_acknowledge_inval_team_teaching_v319(p_row jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_actor uuid := auth.uid();
 v_date date;
 v_period smallint;
 v_class_id uuid;
 v_class_name text;
 v_absent uuid;
 v_absent_name text;
 v_master_id uuid;
 v_incidental_id uuid;
 v_subject text;
 v_master_subject text;
 v_incidental_subject text;
 v_reason text;
 v_has_override boolean := false;
 v_absent_scheduled boolean := false;
 v_colleague_available boolean := false;
 v_weekday int;
 v_old public.coverage_slots%rowtype;
 v_slot uuid;
 v_source text;
begin
 if v_actor is null or not public.current_user_is_staff() or not exists (
   select 1 from public.user_roles where user_id=v_actor and role in ('ADMIN','WAKASEK')
 ) then raise exception 'ADMIN_OR_WAKASEK_REQUIRED'; end if;
 if coalesce(p_row->>'coverage_decision','') <> 'NO_SUBSTITUTE'
    or nullif(trim(p_row->>'substitute_teacher_id'),'') is not null then
   raise exception 'INVALID_NO_SUBSTITUTE_DECISION';
 end if;
 v_date:=nullif(trim(p_row->>'schedule_date'),'')::date;
 v_period:=nullif(trim(p_row->>'period'),'')::smallint;
 v_absent:=nullif(trim(p_row->>'absent_teacher_id'),'')::uuid;
 if v_date is null or v_period is null or v_period not between 1 and 6 or v_absent is null
   then raise exception 'INVALID_NO_SUBSTITUTE_SLOT'; end if;
 select c.id,c.display_name into v_class_id,v_class_name from public.classes c
  where c.is_active and (lower(c.code)=lower(trim(p_row->>'class_code'))
    or lower(c.display_name)=lower(trim(p_row->>'class_code')))
  order by case when lower(c.code)=lower(trim(p_row->>'class_code')) then 0 else 1 end,c.id limit 1;
 select full_name into v_absent_name from public.teachers where id=v_absent and is_active;
 if v_class_id is null or v_absent_name is null then raise exception 'NO_SUBSTITUTE_CLASS_OR_TEACHER_NOT_FOUND'; end if;
 v_weekday:=extract(isodow from v_date)::int;
 select sm.id,sm.subject into v_master_id,v_master_subject from public.schedule_master sm
  where sm.class_id=v_class_id and sm.day_of_week=v_weekday and sm.period=v_period
   and sm.is_active and sm.deleted_at is null order by sm.id limit 1;
 select si.id,si.override_subject into v_incidental_id,v_incidental_subject
  from public.schedule_incidentals si where si.schedule_date=v_date
   and si.class_id=v_class_id and si.period=v_period and si.deleted_at is null
  order by si.updated_at desc,si.id limit 1;
 select exists(select 1 from public.schedule_incidental_teacher_overrides ito
  where ito.incidental_id=v_incidental_id) into v_has_override;
 v_subject:=coalesce(nullif(trim(p_row->>'subject'),''),
  nullif(trim(v_incidental_subject),''),nullif(trim(v_master_subject),''),'');
 if v_has_override then
   select exists(select 1 from public.schedule_incidental_teacher_overrides ito
     where ito.incidental_id=v_incidental_id and ito.teacher_id=v_absent and ito.action='SET') into v_absent_scheduled;
 else
   select exists(select 1 from public.schedule_master_teachers smt
     where smt.schedule_id=v_master_id and smt.teacher_id=v_absent) into v_absent_scheduled;
 end if;
 if not v_absent_scheduled then raise exception 'NO_SUBSTITUTE_ABSENT_TEACHER_NOT_SCHEDULED'; end if;
 if exists(select 1 from public.academic_events ae
   where ae.status='ACTIVE' and ae.date_start<=v_date and ae.date_end>=v_date
   and (ae.period_start is null or v_period between ae.period_start and ae.period_end)
   and (ae.scope='ALL' or ae.class_id=v_class_id)
   and (v_incidental_id is null or not v_has_override or
     concat_ws(' ',ae.event_name,ae.event_type) ~* 'libur|holiday|cuti bersama')) then
   raise exception 'NO_SUBSTITUTE_KBM_CANCELLED_BY_CALENDAR';
 end if;
 -- Same class, same JP: require another currently available scheduled teacher.
 -- This is not a bypass for a genuinely uncovered classroom.
 with colleague as (
   select smt.teacher_id from public.schedule_master_teachers smt
    where not v_has_override and smt.schedule_id=v_master_id
   union
   select ito.teacher_id from public.schedule_incidental_teacher_overrides ito
    where v_has_override and ito.incidental_id=v_incidental_id and ito.action='SET'
 )
 select exists(select 1 from colleague c join public.teachers t on t.id=c.teacher_id and t.is_active
  where c.teacher_id is not null and c.teacher_id<>v_absent
    and not exists(select 1 from public.leave_request_periods lrp
      join public.leave_requests lr on lr.id=lrp.leave_request_id
      where lr.teacher_id=c.teacher_id and lr.status='APPROVED' and lr.deleted_at is null
        and lrp.schedule_date=v_date and lrp.period=v_period)
    and not exists(select 1 from public.ejadwal_teacher_duty_assignments_v319 a
      join public.ejadwal_teacher_duty_events_v319 e on e.id=a.event_id
      where a.teacher_id=c.teacher_id and e.status='ACTIVE' and a.duty_role in ('PARTICIPANT','STAFF')
        and (v_date between e.date_start and e.date_end or a.compensation_date=v_date))
    and not exists(select 1 from public.substitute_constraints sc
      where sc.teacher_id=c.teacher_id and sc.is_active and sc.deleted_at is null
        and sc.blocks_normal_teaching and v_period between sc.period_start and sc.period_end
        and ((sc.constraint_type='DATE' and sc.specific_date=v_date)
          or (sc.constraint_type='WEEKLY' and (sc.day_of_week is null or sc.day_of_week=v_weekday)
            and (sc.valid_from is null or sc.valid_from<=v_date)
            and (sc.valid_until is null or sc.valid_until>=v_date))))
    and not exists(select 1 from public.coverage_slots cs
      where cs.schedule_date=v_date and cs.period=v_period and cs.absent_teacher_id=c.teacher_id
        and cs.deleted_at is null and cs.status not in ('CANCELLED','EXPIRED'))
 ) into v_colleague_available;
 if not v_colleague_available then raise exception 'TEAM_TEACHING_NOT_AVAILABLE'; end if;
 -- Lock the absent teacher's exact operational coverage, including approved WAITING.
 perform pg_advisory_xact_lock(hashtext(v_date::text||'|'||v_class_id::text||'|'||v_period::text||'|'||v_absent::text));
 select * into v_old from public.coverage_slots cs
   where cs.schedule_date=v_date and cs.class_id=v_class_id and cs.period=v_period
     and cs.absent_teacher_id=v_absent and cs.deleted_at is null
     and cs.status not in ('CANCELLED','EXPIRED')
   order by case when cs.source='LEAVE_WORKFLOW' then 0 else 1 end,cs.updated_at desc limit 1 for update;
 if found and (v_old.substitute_teacher_id is not null or v_old.status not in ('WAITING','NO_SUBSTITUTE')) then
   raise exception 'COVERAGE_ALREADY_ASSIGNED';
 end if;
 v_reason:=trim(coalesce(p_row->>'reason',''));
 if v_old.id is not null then
   v_slot:=v_old.id;
   update public.coverage_slots set status='NO_SUBSTITUTE',substitute_teacher_id=null,
     substitute_teacher_name_snapshot=null,
     subject_snapshot=coalesce(nullif(v_subject,''),subject_snapshot),
     reason_snapshot=coalesce(nullif(v_reason,''),reason_snapshot),
     schedule_master_id=coalesce(v_master_id,schedule_master_id),
     schedule_incidental_id=coalesce(v_incidental_id,schedule_incidental_id),
     assigned_by=v_actor,assigned_at=now(),updated_at=now()
   where id=v_slot;
 else
   insert into public.coverage_slots(schedule_date,class_id,class_name_snapshot,period,subject_snapshot,
     absent_teacher_id,absent_teacher_name_snapshot,substitute_teacher_id,substitute_teacher_name_snapshot,
     reason_snapshot,source,status,schedule_master_id,schedule_incidental_id,assigned_by,assigned_at)
   values(v_date,v_class_id,v_class_name,v_period,v_subject,v_absent,v_absent_name,null,null,
     v_reason,'ADMIN_MANUAL','NO_SUBSTITUTE',v_master_id,v_incidental_id,v_actor,now())
   returning id into v_slot;
 end if;
 -- RC4.4: save the EXISTING task/material for this NO_SUBSTITUTE slot
 -- inside the same transaction as the coverage decision.
 perform public.ejadwal_save_team_teaching_task_v319(
   v_slot, p_row->>'task_text', coalesce(p_row->'task_resources','[]'::jsonb));
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(v_actor,'ACK_INVAL_TEAM_TEACHING','coverage_slot',v_slot::text,
   case when v_old.id is not null then to_jsonb(v_old) else null end,
   jsonb_build_object('status','NO_SUBSTITUTE','handled_by','EXISTING_TEAM_TEACHING',
     'schedule_date',v_date,'period',v_period,'class_id',v_class_id,'source',coalesce(v_old.source,'ADMIN_MANUAL')));
 return v_slot;
end;$$;
revoke all on function public.ejadwal_acknowledge_inval_team_teaching_v319(jsonb) from public,anon;
grant execute on function public.ejadwal_acknowledge_inval_team_teaching_v319(jsonb) to authenticated;

-- OFFICIAL_DUTY: wrap the already-validated RC4.2 acknowledgement so
-- coverage + instruction persist atomically; keep old 4-arg RPC compatible.
create or replace function public.ejadwal_acknowledge_official_duty_team_teaching_task_v319(
 p_constraint_id uuid, p_date date, p_period smallint, p_class_id uuid,
 p_task_text text default '', p_task_resources jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_response jsonb;
 v_slot_id uuid;
begin
 v_response:=public.ejadwal_acknowledge_official_duty_team_teaching_v319(
    p_constraint_id,p_date,p_period,p_class_id);
 v_slot_id:=nullif(v_response->>'coverage_slot_id','')::uuid;
 if v_slot_id is null then raise exception 'TEAM_TASK_COVERAGE_NOT_FOUND'; end if;
 perform public.ejadwal_save_team_teaching_task_v319(v_slot_id,p_task_text,p_task_resources);
 return v_response;
end;$$;
revoke all on function public.ejadwal_acknowledge_official_duty_team_teaching_task_v319(uuid,date,smallint,uuid,text,jsonb) from public,anon;
grant execute on function public.ejadwal_acknowledge_official_duty_team_teaching_task_v319(uuid,date,smallint,uuid,text,jsonb) to authenticated;

commit;
