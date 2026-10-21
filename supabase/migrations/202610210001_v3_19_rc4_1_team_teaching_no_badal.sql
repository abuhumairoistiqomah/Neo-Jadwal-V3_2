-- V3.19 RC4.1 hotfix — acknowledge official-duty JP handled by an existing teaching team.
-- This is NOT a substitute assignment and NOT attendance. Staging first.
-- Preconditions: V3.15 official-duty coverage; V3.19 RC2 + RC3 applied.
begin;

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
  select id,coalesce(nullif(override_subject,''),v_subject)
    into v_incidental_id,v_subject from public.schedule_incidentals
    where schedule_date=p_date and class_id=p_class_id and period=p_period
      and deleted_at is null order by updated_at desc,id limit 1;
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
      status='NO_SUBSTITUTE' where id=v_slot_id;
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

revoke all on function public.ejadwal_acknowledge_official_duty_team_teaching_v319(uuid,date,smallint,uuid) from public,anon;
grant execute on function public.ejadwal_acknowledge_official_duty_team_teaching_v319(uuid,date,smallint,uuid) to authenticated;
comment on function public.ejadwal_acknowledge_official_duty_team_teaching_v319(uuid,date,smallint,uuid) is
  'Acknowledges official-duty JP handled by available existing co-teacher; NO_SUBSTITUTE, not a substitute teacher or presence record.';
-- Explicit correction: reopen only a team-teaching acknowledgement, never remove an assigned substitute.
create or replace function public.ejadwal_reopen_official_duty_team_teaching_v319(p_coverage_id uuid)
returns jsonb language plpgsql security definer set search_path=public, pg_temp as $$
declare
  v_before jsonb;
  v_slot public.coverage_slots%rowtype;
begin
  if auth.uid() is null or not public.current_user_is_staff()
     or not exists(select 1 from public.user_roles
       where user_id=auth.uid() and role in ('ADMIN','WAKASEK')) then
    raise exception 'ADMIN_OR_WAKASEK_REQUIRED';
  end if;
  select * into v_slot from public.coverage_slots where id=p_coverage_id for update;
  if not found or v_slot.source<>'OFFICIAL_DUTY' or v_slot.official_duty_constraint_id is null
     or v_slot.status<>'NO_SUBSTITUTE' or v_slot.substitute_teacher_id is not null
     or v_slot.deleted_at is not null then
    raise exception 'ONLY_ACTIVE_TEAM_TEACHING_CAN_BE_REOPENED';
  end if;
  v_before:=to_jsonb(v_slot);
  update public.coverage_slots set status='CANCELLED',updated_at=now() where id=p_coverage_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'REOPEN_OFFICIAL_DUTY_TEAM_TEACHING','coverage_slot',p_coverage_id::text,
      v_before,jsonb_build_object('status','CANCELLED','needs_review',true));
  return jsonb_build_object('coverage_slot_id',p_coverage_id,'status','CANCELLED');
end;
$$;
revoke all on function public.ejadwal_reopen_official_duty_team_teaching_v319(uuid) from public,anon;
grant execute on function public.ejadwal_reopen_official_duty_team_teaching_v319(uuid) to authenticated;

commit;
