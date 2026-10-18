-- V3.17.2 RC1: audited approved-leave maintenance and authenticated staff shortcut.
-- Apply after V3.17.1 migrations. Test in staging first.
-- Staff = Supabase authenticated ADMIN/WAKASEK role; Admin Mode UI is not authorization.
begin;

alter table public.coverage_slots
  add column if not exists deleted_previous_status text;

alter table public.leave_requests
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists deleted_previous_status text;
create index if not exists leave_requests_approved_active_idx
  on public.leave_requests (date_end desc, decided_at desc)
  where status='APPROVED' and deleted_at is null;

-- Staff can submit without evidence, optionally approving atomically when an oral
-- authorization has already been received. All existing v3 validators still run.
create or replace function public.ejadwal_submit_staff_leave_v1(
  p_teacher_name text, p_schedule_date date, p_request_type text, p_reason text,
  p_detail text default null, p_slots jsonb default '[]'::jsonb,
  p_periods jsonb default '[]'::jsonb, p_tasks jsonb default '[]'::jsonb,
  p_approve_now boolean default false, p_authorization_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_request_id uuid;
  v_decision jsonb;
  v_note text := nullif(trim(coalesce(p_authorization_note,'')), '');
begin
  if v_actor is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
  if p_approve_now and v_note is null then raise exception 'ORAL_AUTHORIZATION_NOTE_REQUIRED'; end if;
  -- v3 is never directly executable by anon/authenticated users; this is the only
  -- new entrypoint with staff-only credentials enforced inside Postgres.
  v_result := public.ejadwal_submit_public_leave_request_v3(
    p_teacher_name, p_schedule_date, p_request_type, p_reason, p_detail,
    p_slots, p_periods, p_tasks
  );
  v_request_id := nullif(v_result->>'request_id','')::uuid;
  if v_request_id is null then raise exception 'STAFF_LEAVE_INSERT_FAILED'; end if;
  update public.leave_requests
  set submitted_by=v_actor, evidence_required=false, evidence_path=null,
      evidence_upload_token=null, evidence_upload_expires_at=null,
      evidence_uploaded_at=null, updated_at=now()
  where id=v_request_id and status='SUBMITTED';
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
  values(v_actor,'STAFF_LEAVE_EVIDENCE_EXCEPTION','leave_request',v_request_id::text,
    null,jsonb_build_object('reason','Authenticated staff direct submission',
      'approve_now',p_approve_now,'authorization_note',v_note),gen_random_uuid());
  if p_approve_now then
    -- Same database transaction. Failed validation/coverage rolls back creation.
    v_decision := public.ejadwal_decide_leave_request(v_request_id,'APPROVE',v_note);
    v_result := v_result || jsonb_build_object('status','APPROVED',
      'coverage_slot_ids',v_decision->'coverage_slot_ids');
  else
    v_result := v_result || jsonb_build_object('status','SUBMITTED');
  end if;
  return v_result;
end;
$$;
revoke all on function public.ejadwal_submit_staff_leave_v1(text,date,text,text,text,jsonb,jsonb,jsonb,boolean,text) from public, anon;
grant execute on function public.ejadwal_submit_staff_leave_v1(text,date,text,text,text,jsonb,jsonb,jsonb,boolean,text) to authenticated;

-- Correct a teaching JP (including its combined-class rows) in a single
-- transaction, rejecting a target that does not belong to the absent teacher.
-- The assignment is changed as one unit, not one coverage row at a time.
create or replace function public.ejadwal_move_approved_leave_period_v1(
  p_leave_request_id uuid, p_schedule_date date,
  p_old_period smallint, p_new_period smallint, p_note text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.leave_requests%rowtype;
  v_item public.coverage_slots%rowtype;
  v_sm uuid;
  v_si uuid;
  v_subject text;
  v_soft uuid[];
  v_incidental_subject text;
  v_count int := 0;
  v_before jsonb;
  v_note text := nullif(trim(coalesce(p_note,'')), '');
begin
  if v_actor is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
  if v_note is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  if p_schedule_date is null or p_old_period not between 1 and 6
    or p_new_period not between 1 and 6 or p_old_period=p_new_period then
    raise exception 'INVALID_OLD_OR_NEW_JP';
  end if;
  select * into v_request from public.leave_requests
  where id=p_leave_request_id for update;
  if v_request.id is null or v_request.status<>'APPROVED' or v_request.deleted_at is not null then
    raise exception 'APPROVED_LEAVE_REQUIRED';
  end if;
  if p_schedule_date < v_request.date_start or p_schedule_date > v_request.date_end then
    raise exception 'DATE_OUTSIDE_LEAVE';
  end if;
  if not exists(select 1 from public.leave_request_periods where leave_request_id=v_request.id
    and schedule_date=p_schedule_date and period=p_old_period and period_type='TEACHING') then
    raise exception 'OLD_TEACHING_PERIOD_NOT_FOUND';
  end if;
  if exists(select 1 from public.leave_request_periods where leave_request_id=v_request.id
    and schedule_date=p_schedule_date and period=p_new_period) then
    raise exception 'TARGET_JP_ALREADY_IN_LEAVE_REQUEST';
  end if;
  if not public.ejadwal_school_period_active(p_schedule_date,p_new_period) then
    raise exception 'TARGET_JP_NOT_ACTIVE';
  end if;
  if not exists(select 1 from public.coverage_slots where leave_request_id=v_request.id
      and schedule_date=p_schedule_date and period=p_old_period and source='LEAVE_WORKFLOW'
      and deleted_at is null and status not in ('CANCELLED','COMPLETED')) then
    raise exception 'ACTIVE_COVERAGE_NOT_FOUND';
  end if;
  -- Reject inconsistent historical coverage; no silent partial move.
  if exists(select 1 from public.coverage_slots where leave_request_id=v_request.id
    and schedule_date=p_schedule_date and period=p_old_period
    and (deleted_at is not null or status in ('CANCELLED','COMPLETED') or source<>'LEAVE_WORKFLOW')) then
    raise exception 'MIXED_COVERAGE_STATUSES_NOT_EDITABLE';
  end if;
  if not exists(select 1 from public.leave_request_slots where leave_request_id=v_request.id
    and schedule_date=p_schedule_date and period=p_old_period) then
    raise exception 'LEAVE_SLOT_MISSING';
  end if;
  if exists(select 1 from public.leave_request_slots lrs
    where lrs.leave_request_id=v_request.id and lrs.schedule_date=p_schedule_date
      and lrs.period=p_old_period and not exists(
        select 1 from public.coverage_slots cs
        where cs.leave_request_id=v_request.id and cs.schedule_date=p_schedule_date
          and cs.period=p_old_period and cs.class_id=lrs.class_id
          and cs.deleted_at is null and cs.source='LEAVE_WORKFLOW')) then
    raise exception 'LEAVE_SLOT_WITHOUT_COVERAGE_CANNOT_MOVE';
  end if;
  v_before := jsonb_build_object('old_jp',p_old_period,'new_jp',p_new_period,
    'coverage',(select jsonb_agg(to_jsonb(cs)) from public.coverage_slots cs
       where cs.leave_request_id=v_request.id and cs.schedule_date=p_schedule_date
         and cs.period=p_old_period and cs.deleted_at is null));
  -- Lock and verify every canonical class (combined sessions move together).
  for v_item in select * from public.coverage_slots
    where leave_request_id=v_request.id and schedule_date=p_schedule_date
      and period=p_old_period and deleted_at is null for update
  loop
    if not public.ejadwal_teacher_scheduled_for_leave_slot(
      v_request.teacher_id,p_schedule_date,v_item.class_id,p_new_period) then
      raise exception 'GURU_TIDAK_MENGAJAR_DI_JP_TUJUAN: %',v_item.class_name_snapshot;
    end if;
    if exists(select 1 from public.coverage_slots cs
      where cs.id<>v_item.id and cs.schedule_date=p_schedule_date
        and cs.class_id=v_item.class_id and cs.period=p_new_period
        and cs.absent_teacher_id=v_request.teacher_id
        and cs.deleted_at is null and cs.status<>'CANCELLED') then
      raise exception 'BENTROK_COVERAGE_DI_JP_TUJUAN: %',v_item.class_name_snapshot;
    end if;
    if v_item.substitute_teacher_id is not null then
      -- No new unacknowledged constraint may be inherited by moving assigned badal.
      v_soft := public.ejadwal_validate_substitute_constraints(
        v_item.substitute_teacher_id,p_schedule_date,p_new_period,
        coalesce((select array_agg(constraint_id) from public.coverage_constraint_overrides
          where coverage_slot_id=v_item.id),'{}'::uuid[]));
      if coalesce(cardinality(v_soft),0)>0 then
        raise exception 'JP_TUJUAN_MEMERLUKAN_OVERRIDE_BARU: Edit badal dahulu';
      end if;
      if exists (select 1 from public.coverage_slots cs where cs.id<>v_item.id
          and cs.schedule_date=p_schedule_date and cs.period=p_new_period
          and cs.substitute_teacher_id=v_item.substitute_teacher_id
          and cs.deleted_at is null and cs.status='ASSIGNED') then
        raise exception 'GURU_BADAL_SUDAH_DITUGASKAN_DI_JP_TUJUAN';
      end if;
    end if;
    select sm.id,sm.subject into v_sm,v_subject
      from public.schedule_master sm where sm.class_id=v_item.class_id
      and sm.day_of_week=extract(isodow from p_schedule_date)::smallint
      and sm.period=p_new_period and sm.deleted_at is null and sm.is_active
      order by sm.id limit 1;
    select si.id,si.override_subject into v_si,v_incidental_subject
      from public.schedule_incidentals si
      where si.class_id=v_item.class_id and si.schedule_date=p_schedule_date
        and si.period=p_new_period and si.deleted_at is null
      order by si.updated_at desc,si.id limit 1;
    v_subject:=coalesce(nullif(v_incidental_subject,''),v_subject);
    -- For ADDITIONAL / override with no subject, preserve existing snapshot.
    update public.coverage_slots set period=p_new_period,
      subject_snapshot=coalesce(nullif(v_subject,''),subject_snapshot),
      schedule_master_id=v_sm,schedule_incidental_id=v_si,updated_at=now()
      where id=v_item.id;
    update public.leave_request_slots
      set period=p_new_period,subject_snapshot=coalesce(nullif(v_subject,''),subject_snapshot),
        schedule_master_id=v_sm,schedule_incidental_id=v_si
      where leave_request_id=v_request.id and schedule_date=p_schedule_date
        and class_id=v_item.class_id and period=p_old_period;
    if not found then raise exception 'MISSING_LEAVE_REQUEST_SLOT_FOR_CLASS';end if;
    v_count:=v_count+1;
    v_sm:=null;v_si:=null;v_subject:=null;v_incidental_subject:=null;
  end loop;
  update public.leave_request_periods set period=p_new_period
    where leave_request_id=v_request.id and schedule_date=p_schedule_date
      and period=p_old_period and period_type='TEACHING';
  -- JP tasks are per request; avoid reassigning a task shared across dates.
  if (select count(distinct schedule_date) from public.leave_request_periods
        where leave_request_id=v_request.id)>1 then
    if exists(select 1 from public.leave_request_tasks where leave_request_id=v_request.id
       and period=p_old_period) then
      raise exception 'MULTI_DAY_TASK_CORRECTION_UNSUPPORTED';
    end if;
  end if;
  update public.leave_request_tasks set period=p_new_period,updated_at=now()
    where leave_request_id=v_request.id and period=p_old_period;
  update public.leave_requests set updated_at=now() where id=v_request.id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
  values(v_actor,'APPROVED_LEAVE_PERIOD_MOVED','leave_request',v_request.id::text,
    v_before,jsonb_build_object('date',p_schedule_date,'old_jp',p_old_period,
      'new_jp',p_new_period,'classes_moved',v_count,'note',v_note),gen_random_uuid());
  return jsonb_build_object('request_id',v_request.id,'old_period',p_old_period,
    'new_period',p_new_period,'moved_coverage_rows',v_count);
end;
$$;
revoke all on function public.ejadwal_move_approved_leave_period_v1(uuid,date,smallint,smallint,text) from public, anon;
grant execute on function public.ejadwal_move_approved_leave_period_v1(uuid,date,smallint,smallint,text) to authenticated;

-- Soft-delete an entire approved leave atomically. Never delete physical rows.
create or replace function public.ejadwal_soft_delete_approved_leave_v1(
  p_leave_request_id uuid,p_note text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
 v_actor uuid:=auth.uid();v_request public.leave_requests%rowtype;
 v_note text:=nullif(trim(coalesce(p_note,'')),'');v_count int;
begin
 if v_actor is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
 if v_note is null then raise exception 'DELETE_REASON_REQUIRED'; end if;
 select * into v_request from public.leave_requests where id=p_leave_request_id for update;
 if v_request.id is null or v_request.status<>'APPROVED' or v_request.deleted_at is not null then
   raise exception 'ONLY_ACTIVE_APPROVED_LEAVE_CAN_BE_DELETED';end if;
 update public.leave_requests set deleted_at=now(),deleted_by=v_actor,
   deleted_previous_status=status,status='CANCELLED',cancelled_by=v_actor,cancelled_at=now(),updated_at=now()
   where id=v_request.id;
 update public.coverage_slots set deleted_at=now(),deleted_by=v_actor,
   deleted_previous_status=status,status='CANCELLED',updated_at=now()
   where leave_request_id=v_request.id and deleted_at is null and source='LEAVE_WORKFLOW';
 get diagnostics v_count=row_count;
 update public.learning_tasks set deleted_at=now(),deleted_by=v_actor,updated_at=now()
 where coverage_slot_id in (select id from public.coverage_slots where leave_request_id=v_request.id)
   and deleted_at is null;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
 values(v_actor,'APPROVED_LEAVE_SOFT_DELETED','leave_request',v_request.id::text,
   to_jsonb(v_request),jsonb_build_object('note',v_note,'coverage_hidden',v_count),gen_random_uuid());
 return jsonb_build_object('request_id',v_request.id,'hidden_coverage',v_count);
end;
$$;
revoke all on function public.ejadwal_soft_delete_approved_leave_v1(uuid,text) from public, anon;
grant execute on function public.ejadwal_soft_delete_approved_leave_v1(uuid,text) to authenticated;

-- Restore only if the original schedule, assignments and coverage remain valid.
-- All checks and writes are atomic; no partial restoration of combined classes.
create or replace function public.ejadwal_restore_approved_leave_v1(
  p_leave_request_id uuid,p_note text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
 v_actor uuid:=auth.uid();v_request public.leave_requests%rowtype;
 v_item public.coverage_slots%rowtype;
 v_note text:=nullif(trim(coalesce(p_note,'')),'');v_count int:=0;
 v_soft uuid[];
begin
 if v_actor is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
 if v_note is null then raise exception 'RESTORE_REASON_REQUIRED'; end if;
 select * into v_request from public.leave_requests where id=p_leave_request_id for update;
 if v_request.id is null or v_request.status<>'CANCELLED'
    or v_request.deleted_at is null or v_request.deleted_previous_status<>'APPROVED' then
   raise exception 'ONLY_SOFT_DELETED_APPROVED_LEAVE_CAN_BE_RESTORED';end if;
 if exists(select 1 from public.leave_requests lr
    where lr.teacher_id=v_request.teacher_id and lr.id<>v_request.id
    and lr.deleted_at is null and lr.status in ('SUBMITTED','APPROVED','PENDING_EVIDENCE')
    and lr.date_start<=v_request.date_end and lr.date_end>=v_request.date_start) then
   raise exception 'ANOTHER_ACTIVE_LEAVE_EXISTS_FOR_TEACHER';
 end if;
 for v_item in select * from public.coverage_slots
   where leave_request_id=v_request.id and source='LEAVE_WORKFLOW'
   and deleted_at=v_request.deleted_at for update
 loop
   if not public.ejadwal_school_period_active(v_item.schedule_date,v_item.period) or
     not public.ejadwal_teacher_scheduled_for_leave_slot(v_request.teacher_id,
       v_item.schedule_date,v_item.class_id,v_item.period) then
       raise exception 'SCHEDULE_CHANGED_CANNOT_RESTORE: % JP %',v_item.class_name_snapshot,v_item.period;
   end if;
   if exists(select 1 from public.coverage_slots cs
      where cs.id<>v_item.id and cs.schedule_date=v_item.schedule_date
      and cs.class_id=v_item.class_id and cs.period=v_item.period
      and cs.absent_teacher_id=v_request.teacher_id and cs.deleted_at is null
      and cs.status<>'CANCELLED') then
      raise exception 'ACTIVE_COVERAGE_CONFLICT_ON_RESTORE';
   end if;
   if v_item.substitute_teacher_id is not null then
      v_soft := public.ejadwal_validate_substitute_constraints(
        v_item.substitute_teacher_id,v_item.schedule_date,v_item.period,
        coalesce((select array_agg(constraint_id) from public.coverage_constraint_overrides
          where coverage_slot_id=v_item.id),'{}'::uuid[]));
      if coalesce(cardinality(v_soft),0)>0 then raise exception 'SUBSTITUTE_OVERRIDE_REQUIRES_REVIEW';end if;
      if exists(select 1 from public.coverage_slots cs
         where cs.id<>v_item.id and cs.schedule_date=v_item.schedule_date
           and cs.period=v_item.period and cs.deleted_at is null
           and cs.status='ASSIGNED' and cs.substitute_teacher_id=v_item.substitute_teacher_id) then
         raise exception 'SUBSTITUTE_ASSIGNED_ELSEWHERE';end if;
   end if;
   if v_item.deleted_previous_status is null then raise exception 'MISSING_PREVIOUS_COVERAGE_STATUS';end if;
   v_count:=v_count+1;
 end loop;
 update public.leave_requests set status='APPROVED',deleted_at=null,deleted_by=null,
   deleted_previous_status=null,cancelled_at=null,cancelled_by=null,updated_at=now()
 where id=v_request.id;
 update public.coverage_slots set deleted_at=null,deleted_by=null,
   status=deleted_previous_status,deleted_previous_status=null,updated_at=now()
 where leave_request_id=v_request.id and deleted_at=v_request.deleted_at
   and source='LEAVE_WORKFLOW';
 update public.learning_tasks set deleted_at=null,deleted_by=null,updated_at=now()
 where coverage_slot_id in (select id from public.coverage_slots
   where leave_request_id=v_request.id and source='LEAVE_WORKFLOW')
   and deleted_at=v_request.deleted_at;
 insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
 values(v_actor,'APPROVED_LEAVE_RESTORED','leave_request',v_request.id::text,
   jsonb_build_object('deleted_at',v_request.deleted_at,'status',v_request.status),
   jsonb_build_object('note',v_note,'coverage_restored',v_count),gen_random_uuid());
 return jsonb_build_object('request_id',v_request.id,'restored_coverage',v_count);
end;
$$;
revoke all on function public.ejadwal_restore_approved_leave_v1(uuid,text) from public, anon;
grant execute on function public.ejadwal_restore_approved_leave_v1(uuid,text) to authenticated;

commit;
