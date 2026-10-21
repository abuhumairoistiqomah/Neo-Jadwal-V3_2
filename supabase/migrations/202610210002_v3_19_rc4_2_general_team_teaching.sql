-- V3.19 RC4.2: universal operator/approved-waiting "no additional substitute" decision.
-- Must apply AFTER RC4.1. Stage first. No synthetic substitute identity or new leave.
-- One RPC call = one Postgres transaction; any failed team verification rolls back
-- all normal and no-substitute coverage changes submitted in that bundle.
begin;

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
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
 values(v_actor,'ACK_INVAL_TEAM_TEACHING','coverage_slot',v_slot::text,
   case when v_old.id is not null then to_jsonb(v_old) else null end,
   jsonb_build_object('status','NO_SUBSTITUTE','handled_by','EXISTING_TEAM_TEACHING',
     'schedule_date',v_date,'period',v_period,'class_id',v_class_id,'source',coalesce(v_old.source,'ADMIN_MANUAL')));
 return v_slot;
end;$$;
revoke all on function public.ejadwal_acknowledge_inval_team_teaching_v319(jsonb) from public,anon;
grant execute on function public.ejadwal_acknowledge_inval_team_teaching_v319(jsonb) to authenticated;

create or replace function public.ejadwal_save_inval_bundle_v319_rc42(
 p_rows jsonb,p_room_incidental jsonb default null,p_override_note text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_row jsonb;
 v_assigned jsonb:='[]'::jsonb;
 v_no_ids jsonb:='[]'::jsonb;
 v_assigned_result jsonb:='{}'::jsonb;
 v_slot uuid;
 v_seen text[]:='{}'::text[];
 v_identity text;
begin
 if auth.uid() is null or not public.current_user_is_staff() or not exists(
  select 1 from public.user_roles where user_id=auth.uid() and role in ('ADMIN','WAKASEK')) then
  raise exception 'ADMIN_OR_WAKASEK_REQUIRED';
 end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then
   raise exception 'INVAL_ROWS_REQUIRED';
 end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
   v_identity:=concat_ws('|',v_row->>'schedule_date',lower(trim(v_row->>'class_code')),
     v_row->>'period',v_row->>'absent_teacher_id');
   if v_identity=any(v_seen) then raise exception 'DUPLICATE_COVERAGE_IN_BUNDLE'; end if;
   v_seen:=array_append(v_seen,v_identity);
   if v_row->>'coverage_decision'='NO_SUBSTITUTE' then
     v_slot:=public.ejadwal_acknowledge_inval_team_teaching_v319(v_row);
     v_no_ids:=v_no_ids||to_jsonb(v_slot::text);
   else
     if nullif(trim(v_row->>'substitute_teacher_id'),'') is null then
       raise exception 'SUBSTITUTE_REQUIRED_UNLESS_TEAM_TEACHING';
     end if;
     v_assigned:=v_assigned||jsonb_build_array(v_row);
   end if;
 end loop;
 if jsonb_array_length(v_assigned)>0 then
   v_assigned_result:=public.ejadwal_save_inval_bundle_v3(v_assigned,p_room_incidental,p_override_note);
 elsif p_room_incidental is not null then
   raise exception 'ROOM_RELOCATION_WITHOUT_SUBSTITUTE_NOT_SUPPORTED';
 end if;
 return jsonb_build_object('request_id',coalesce(v_assigned_result->>'request_id',gen_random_uuid()::text),
   'coverage_slot_ids',coalesce(v_assigned_result->'coverage_slot_ids','[]'::jsonb)||v_no_ids,
   'room_incidental_id',v_assigned_result->'room_incidental_id');
end;$$;
revoke all on function public.ejadwal_save_inval_bundle_v319_rc42(jsonb,jsonb,text) from public,anon;
grant execute on function public.ejadwal_save_inval_bundle_v319_rc42(jsonb,jsonb,text) to authenticated;
comment on function public.ejadwal_save_inval_bundle_v319_rc42(jsonb,jsonb,text) is
 'RC4.2 atomic mixed bundle: assigned substitute or explicitly verified team teaching without fake teacher.';

-- Fix BOTH previously deployed official-duty writers: preserve master subject.
create or replace function public.ejadwal_assign_official_duty_badal_v1(
  p_constraint_id uuid,
  p_date date,
  p_period smallint,
  p_class_id uuid,
  p_substitute_teacher_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_rule public.substitute_constraints%rowtype;
  v_absent_name text;
  v_substitute_name text;
  v_class_name text;
  v_master_id uuid;
  v_incidental_id uuid;
  v_subject text;
  v_incidental_subject text;
  v_has_team boolean;
  v_teacher_assigned boolean;
  v_slot_id uuid;
  v_weekday int;
  v_before jsonb;
begin
  if auth.uid() is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
  if p_constraint_id is null or p_date is null or p_period is null
    or p_period not between 0 and 6 or p_class_id is null or p_substitute_teacher_id is null then
    raise exception 'OFFICIAL_DUTY_REQUIRED_FIELDS';
  end if;
  select * into v_rule from public.substitute_constraints
    where id = p_constraint_id for update;
  if not found or not v_rule.is_active or v_rule.deleted_at is not null
      or not v_rule.blocks_normal_teaching or not v_rule.requires_badal then
    raise exception 'OFFICIAL_DUTY_RULE_NOT_ENABLED';
  end if;
  v_weekday := extract(isodow from p_date)::int;
  if p_period < v_rule.period_start or p_period > v_rule.period_end
      or (v_rule.constraint_type = 'DATE' and v_rule.specific_date is distinct from p_date)
      or (v_rule.constraint_type = 'WEEKLY' and
        ((v_rule.day_of_week is not null and v_rule.day_of_week <> v_weekday)
         or (v_rule.valid_from is not null and p_date < v_rule.valid_from)
         or (v_rule.valid_until is not null and p_date > v_rule.valid_until))) then
    raise exception 'OUTSIDE_OFFICIAL_DUTY_RESTRICTION';
  end if;
  if p_substitute_teacher_id = v_rule.teacher_id then raise exception 'SELF_SUBSTITUTION_FORBIDDEN'; end if;
  -- Preserve the established hard/soft substitute constraint policy.
  perform public.ejadwal_validate_substitute_constraints(
    p_substitute_teacher_id, p_date, p_period, '{}'::uuid[]
  );
  select full_name into v_absent_name from public.teachers where id=v_rule.teacher_id and is_active;
  select full_name into v_substitute_name from public.teachers where id=p_substitute_teacher_id and is_active;
  select display_name into v_class_name from public.classes where id=p_class_id and is_active;
  if v_absent_name is null or v_substitute_name is null or v_class_name is null then
    raise exception 'OFFICIAL_DUTY_TEACHER_OR_CLASS_NOT_FOUND';
  end if;

  -- The class/period must be an actual instructional assignment of this teacher.
  if p_period = 0 then
    -- Homeroom is commonly an implicit responsibility, not schedule_master JP0.
    select exists (
      select 1 from public.teachers t
      join public.classes c on c.id=p_class_id
      where t.id=v_rule.teacher_id
        and lower(coalesce(t.additional_task,'')) ~ 'wali|pendamping'
        and position(upper(c.display_name) in upper(coalesce(t.notes,''))) > 0
    ) into v_teacher_assigned;
    v_subject := 'Homeroom Session';
  else
  select id, subject into v_master_id, v_subject
    from public.schedule_master where class_id=p_class_id and day_of_week=v_weekday
    and period=p_period and is_active and deleted_at is null
    order by id limit 1;
  -- Keep master subject when NO dated incidental exists. A missing SELECT INTO
  -- row would otherwise reset v_subject to NULL (root cause of blank WhatsApp mapel).
  select id, override_subject into v_incidental_id,v_incidental_subject
    from public.schedule_incidentals where schedule_date=p_date and class_id=p_class_id
    and period=p_period and deleted_at is null order by updated_at desc,id limit 1;
  if nullif(trim(coalesce(v_incidental_subject,'')),'') is not null then
    v_subject := trim(v_incidental_subject);
  end if;
  select exists(select 1 from public.schedule_incidental_teacher_overrides ito
    where ito.incidental_id=v_incidental_id) into v_has_team;
  if v_has_team then
    select exists(select 1 from public.schedule_incidental_teacher_overrides ito
      where ito.incidental_id=v_incidental_id and ito.action='SET' and ito.teacher_id=v_rule.teacher_id)
      into v_teacher_assigned;
  else
    select exists(select 1 from public.schedule_master_teachers smt
      where smt.schedule_id=v_master_id and smt.teacher_id=v_rule.teacher_id)
      into v_teacher_assigned;
  end if;
  end if;
  if not v_teacher_assigned then raise exception 'OFFICIAL_DUTY_NO_ACTIVE_TEACHING'; end if;

  -- A calendar event cancelling KBM must not create a fictitious substitute.
  if exists (
    select 1 from public.academic_events ae
    where ae.status='ACTIVE' and ae.date_start<=p_date and ae.date_end>=p_date
      and (ae.period_start is null or p_period between ae.period_start and ae.period_end)
      and (ae.scope='ALL' or ae.class_id=p_class_id)
      and (v_incidental_id is null or not v_has_team
        or concat_ws(' ',ae.event_name,ae.event_type) ~* 'libur|holiday|cuti bersama')
  ) then raise exception 'OFFICIAL_DUTY_KBM_CANCELLED_BY_CALENDAR'; end if;

  -- Avoid double-booking a personal leave or another restriction for same teacher/class/JP.
  select cs.id into v_slot_id
    from public.coverage_slots cs
    where cs.schedule_date=p_date and cs.class_id=p_class_id and cs.period=p_period
      and cs.absent_teacher_id=v_rule.teacher_id
      and cs.deleted_at is null and cs.status not in ('CANCELLED','EXPIRED')
    order by cs.updated_at desc limit 1 for update;
  if v_slot_id is not null then
    if not exists(select 1 from public.coverage_slots cs where cs.id=v_slot_id
      and cs.official_duty_constraint_id=p_constraint_id and cs.source='OFFICIAL_DUTY') then
      raise exception 'OFFICIAL_DUTY_COVERAGE_ALREADY_EXISTS';
    end if;
    select to_jsonb(cs) into v_before from public.coverage_slots cs where cs.id=v_slot_id;
    update public.coverage_slots set
      substitute_teacher_id=p_substitute_teacher_id,
      substitute_teacher_name_snapshot=v_substitute_name,
      assigned_by=auth.uid(),assigned_at=now(),updated_at=now(),
      reason_snapshot=v_rule.reason,status='ASSIGNED',
      subject_snapshot=coalesce(nullif(trim(v_subject),''),subject_snapshot)
      where id=v_slot_id;
  else
    insert into public.coverage_slots (
      schedule_date,class_id,class_name_snapshot,period,subject_snapshot,
      absent_teacher_id,absent_teacher_name_snapshot,
      substitute_teacher_id,substitute_teacher_name_snapshot,reason_snapshot,
      source,status,official_duty_constraint_id,schedule_master_id,schedule_incidental_id,
      assigned_by,assigned_at
    ) values (
      p_date,p_class_id,v_class_name,p_period,coalesce(v_subject,''),
      v_rule.teacher_id,v_absent_name,p_substitute_teacher_id,v_substitute_name,v_rule.reason,
      'OFFICIAL_DUTY','ASSIGNED',p_constraint_id,v_master_id,v_incidental_id,
      auth.uid(),now()
    ) returning id into v_slot_id;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'ASSIGN_OFFICIAL_DUTY_BADAL','coverage_slot',v_slot_id::text,v_before,
      jsonb_build_object('constraint_id',p_constraint_id,'schedule_date',p_date,'period',p_period,
         'class_id',p_class_id,'substitute_teacher_id',p_substitute_teacher_id,
         'reason',v_rule.reason,'leave_request_created',false));
  return jsonb_build_object('coverage_slot_id',v_slot_id,'source','OFFICIAL_DUTY');
end;
$$;

create or replace function public.ejadwal_acknowledge_official_duty_team_teaching_v319(
  p_constraint_id uuid,
  p_date date,
  p_period smallint,
  p_class_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.substitute_constraints%rowtype;
  v_absent_name text;
  v_class_name text;
  v_master_id uuid;
  v_incidental_id uuid;
  v_subject text;
  v_incidental_subject text;
  v_has_team_override boolean := false;
  v_teacher_assigned boolean := false;
  v_available_colleague boolean := false;
  v_weekday int;
  v_slot_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null or not public.current_user_is_staff()
     or not exists(select 1 from public.user_roles
       where user_id=auth.uid() and role in ('ADMIN','WAKASEK')) then
    raise exception 'ADMIN_OR_WAKASEK_REQUIRED';
  end if;
  if p_constraint_id is null or p_date is null or p_period is null
     or p_period not between 1 and 6 or p_class_id is null then
    raise exception 'OFFICIAL_DUTY_TEAM_TEACHING_REQUIRED_FIELDS';
  end if;
  select * into v_rule from public.substitute_constraints where id=p_constraint_id for update;
  if not found or not v_rule.is_active or v_rule.deleted_at is not null
    or not v_rule.blocks_normal_teaching or not v_rule.requires_badal then
    raise exception 'OFFICIAL_DUTY_RULE_NOT_ENABLED';
  end if;
  v_weekday := extract(isodow from p_date)::int;
  if p_period < v_rule.period_start or p_period > v_rule.period_end
    or (v_rule.constraint_type='DATE' and v_rule.specific_date is distinct from p_date)
    or (v_rule.constraint_type='WEEKLY' and
      ((v_rule.day_of_week is not null and v_rule.day_of_week <> v_weekday)
       or (v_rule.valid_from is not null and p_date < v_rule.valid_from)
       or (v_rule.valid_until is not null and p_date > v_rule.valid_until))) then
    raise exception 'OUTSIDE_OFFICIAL_DUTY_RESTRICTION';
  end if;
  select full_name into v_absent_name from public.teachers where id=v_rule.teacher_id and is_active;
  select display_name into v_class_name from public.classes where id=p_class_id and is_active;
  if v_absent_name is null or v_class_name is null then
    raise exception 'OFFICIAL_DUTY_TEACHER_OR_CLASS_NOT_FOUND';
  end if;
  select id,subject into v_master_id,v_subject from public.schedule_master
    where class_id=p_class_id and day_of_week=v_weekday and period=p_period
      and is_active and deleted_at is null order by id limit 1;
  -- RC4.2: preserve master mapel when dated incidental is absent.
  select id,override_subject into v_incidental_id,v_incidental_subject
    from public.schedule_incidentals
    where schedule_date=p_date and class_id=p_class_id and period=p_period
      and deleted_at is null order by updated_at desc,id limit 1;
  if nullif(trim(coalesce(v_incidental_subject,'')),'') is not null then
    v_subject := trim(v_incidental_subject);
  end if;
  select exists(select 1 from public.schedule_incidental_teacher_overrides ito
    where ito.incidental_id=v_incidental_id) into v_has_team_override;

  if v_has_team_override then
    select exists(select 1 from public.schedule_incidental_teacher_overrides ito
      where ito.incidental_id=v_incidental_id and ito.action='SET'
        and ito.teacher_id=v_rule.teacher_id) into v_teacher_assigned;
  else
    select exists(select 1 from public.schedule_master_teachers smt
      where smt.schedule_id=v_master_id and smt.teacher_id=v_rule.teacher_id) into v_teacher_assigned;
  end if;
  if not v_teacher_assigned then raise exception 'OFFICIAL_DUTY_NO_ACTIVE_TEACHING'; end if;

  -- Match the existing official-duty RPC's KBM calendar gate.
  if exists(select 1 from public.academic_events ae
    where ae.status='ACTIVE' and ae.date_start<=p_date and ae.date_end>=p_date
      and (ae.period_start is null or p_period between ae.period_start and ae.period_end)
      and (ae.scope='ALL' or ae.class_id=p_class_id)
      and (v_incidental_id is null or not v_has_team_override
        or concat_ws(' ',ae.event_name,ae.event_type) ~* 'libur|holiday|cuti bersama')) then
    raise exception 'OFFICIAL_DUTY_KBM_CANCELLED_BY_CALENDAR';
  end if;

  -- Existence of another *available* assigned team member is mandatory.
  -- Re-evaluate on server: a user-controlled dropdown option is not evidence.
  with colleague as (
    select smt.teacher_id from public.schedule_master_teachers smt
      where not v_has_team_override and smt.schedule_id=v_master_id
    union
    select ito.teacher_id from public.schedule_incidental_teacher_overrides ito
      where v_has_team_override and ito.incidental_id=v_incidental_id and ito.action='SET'
  )
  select exists (
    select 1 from colleague c join public.teachers t on t.id=c.teacher_id and t.is_active
    where c.teacher_id is not null and c.teacher_id<>v_rule.teacher_id
      and not exists (
        select 1 from public.leave_request_periods lrp
        join public.leave_requests lr on lr.id=lrp.leave_request_id
        where lr.teacher_id=c.teacher_id and lr.status='APPROVED' and lr.deleted_at is null
          and lrp.schedule_date=p_date and lrp.period=p_period
      )
      and not exists (
        select 1 from public.ejadwal_teacher_duty_assignments_v319 a
        join public.ejadwal_teacher_duty_events_v319 e on e.id=a.event_id
        where a.teacher_id=c.teacher_id and e.status='ACTIVE'
          and a.duty_role in ('PARTICIPANT','STAFF')
          and (p_date between e.date_start and e.date_end or a.compensation_date=p_date)
      )
      and not exists (
        select 1 from public.substitute_constraints sc
        where sc.teacher_id=c.teacher_id and sc.is_active and sc.deleted_at is null
          and sc.blocks_normal_teaching and p_period between sc.period_start and sc.period_end
          and ((sc.constraint_type='DATE' and sc.specific_date=p_date)
            or (sc.constraint_type='WEEKLY'
              and (sc.day_of_week is null or sc.day_of_week=v_weekday)
              and (sc.valid_from is null or sc.valid_from<=p_date)
              and (sc.valid_until is null or sc.valid_until>=p_date)))
      )
      and not exists (
        select 1 from public.coverage_slots cs
        where cs.schedule_date=p_date and cs.class_id=p_class_id and cs.period=p_period
          and cs.absent_teacher_id=c.teacher_id and cs.deleted_at is null
          and cs.status not in ('CANCELLED','EXPIRED')
      )
  ) into v_available_colleague;
  if not v_available_colleague then
    raise exception 'TEAM_TEACHING_NOT_AVAILABLE: no available co-teacher on this class/JP';
  end if;

  select cs.id into v_slot_id from public.coverage_slots cs
    where cs.schedule_date=p_date and cs.class_id=p_class_id and cs.period=p_period
      and cs.absent_teacher_id=v_rule.teacher_id and cs.deleted_at is null
      and cs.status not in ('CANCELLED','EXPIRED')
    order by cs.updated_at desc limit 1 for update;
  if v_slot_id is not null then
    if not exists(select 1 from public.coverage_slots cs where cs.id=v_slot_id
      and cs.official_duty_constraint_id=p_constraint_id and cs.source='OFFICIAL_DUTY'
      and cs.status='NO_SUBSTITUTE' and cs.substitute_teacher_id is null) then
      raise exception 'OFFICIAL_DUTY_COVERAGE_ALREADY_EXISTS';
    end if;
    select to_jsonb(cs) into v_before from public.coverage_slots cs where cs.id=v_slot_id;
    update public.coverage_slots set updated_at=now(),assigned_by=auth.uid(),assigned_at=now(),
      reason_snapshot=v_rule.reason,substitute_teacher_id=null,substitute_teacher_name_snapshot=null,
      status='NO_SUBSTITUTE',subject_snapshot=coalesce(nullif(trim(v_subject),''),subject_snapshot)
      where id=v_slot_id;
  else
    insert into public.coverage_slots (
      schedule_date,class_id,class_name_snapshot,period,subject_snapshot,
      absent_teacher_id,absent_teacher_name_snapshot,
      substitute_teacher_id,substitute_teacher_name_snapshot,reason_snapshot,
      source,status,official_duty_constraint_id,schedule_master_id,schedule_incidental_id,
      assigned_by,assigned_at
    ) values (
      p_date,p_class_id,v_class_name,p_period,coalesce(v_subject,''),
      v_rule.teacher_id,v_absent_name,
      null,null,v_rule.reason,
      'OFFICIAL_DUTY','NO_SUBSTITUTE',p_constraint_id,v_master_id,v_incidental_id,
      auth.uid(),now()
    ) returning id into v_slot_id;
  end if;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'ACK_OFFICIAL_DUTY_TEAM_TEACHING','coverage_slot',v_slot_id::text,v_before,
      jsonb_build_object('constraint_id',p_constraint_id,'schedule_date',p_date,
        'period',p_period,'class_id',p_class_id,'status','NO_SUBSTITUTE',
        'handled_by','EXISTING_TEAM_TEACHING','leave_request_created',false));
  return jsonb_build_object('coverage_slot_id',v_slot_id,'status','NO_SUBSTITUTE',
    'handled_by','EXISTING_TEAM_TEACHING');
end;
$$;

commit;
