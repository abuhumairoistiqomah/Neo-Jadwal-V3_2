-- E-JADWAL V3.15: an official-duty restriction is NOT a personal leave request.
-- Apply AFTER 202610120008. Test on staging and backup before production.
-- Only an authenticated ADMIN/WAKASEK can create official-duty coverage.
begin;

alter table public.substitute_constraints
  add column if not exists requires_badal boolean not null default false;

alter table public.coverage_slots
  add column if not exists official_duty_constraint_id uuid
  references public.substitute_constraints(id) on delete restrict;

alter table public.coverage_slots drop constraint if exists coverage_slots_source_check;
alter table public.coverage_slots add constraint coverage_slots_source_check
  check (source in ('LEAVE_WORKFLOW','LEGACY_IMPORT','ADMIN_MANUAL','OFFICIAL_DUTY'));

create unique index if not exists coverage_slots_official_duty_identity_uidx
  on public.coverage_slots (official_duty_constraint_id, schedule_date, class_id, period)
  where official_duty_constraint_id is not null and deleted_at is null and status <> 'CANCELLED';

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
  select id, coalesce(nullif(override_subject,''),v_subject) into v_incidental_id,v_subject
    from public.schedule_incidentals where schedule_date=p_date and class_id=p_class_id
    and period=p_period and deleted_at is null order by updated_at desc,id limit 1;
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
      reason_snapshot=v_rule.reason,status='ASSIGNED'
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
revoke all on function public.ejadwal_assign_official_duty_badal_v1(uuid,date,smallint,uuid,uuid) from public,anon;
grant execute on function public.ejadwal_assign_official_duty_badal_v1(uuid,date,smallint,uuid,uuid) to authenticated;
comment on function public.ejadwal_assign_official_duty_badal_v1(uuid,date,smallint,uuid,uuid) is
  'Official school duty: assigns dated coverage and copies constraint reason; no leave_request is created.';
commit;
