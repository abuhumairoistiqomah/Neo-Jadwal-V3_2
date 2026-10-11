-- E-Jadwal V3.12.4 — Teacher-Owned Tasks + Supabase Admin Runtime
--
-- 1) Public leave request owns the learning task before approval.
-- 2) Text + LINK resources are submitted atomically with the leave request.
-- 3) A short-lived request token authorizes Drive uploads through GAS without
--    granting anonymous table access or requiring a staff session.
-- 4) APPROVE copies the teacher task to every canonical coverage row for the JP.

begin;

alter table public.leave_requests
  add column if not exists task_upload_token text null,
  add column if not exists task_upload_expires_at timestamptz null;

create table if not exists public.leave_request_tasks (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  period smallint not null check (period between 1 and 6),
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_request_tasks_identity_uidx unique (leave_request_id, period)
);

create table if not exists public.leave_request_task_resources (
  id uuid primary key default gen_random_uuid(),
  leave_request_task_id uuid not null references public.leave_request_tasks(id) on delete cascade,
  resource_type text not null check (resource_type in ('LINK', 'DRIVE_FILE')),
  label text null,
  url text not null,
  drive_file_id text null,
  file_name text null,
  mime_type text null,
  created_at timestamptz not null default now(),
  constraint leave_request_task_resource_drive_ck check (
    resource_type <> 'DRIVE_FILE' or drive_file_id is not null
  )
);

create unique index if not exists leave_request_task_resources_url_uidx
  on public.leave_request_task_resources(leave_request_task_id, url);
create index if not exists leave_request_tasks_request_idx
  on public.leave_request_tasks(leave_request_id, period);

alter table public.leave_request_tasks enable row level security;
alter table public.leave_request_task_resources enable row level security;

revoke all privileges on table public.leave_request_tasks from anon;
revoke all privileges on table public.leave_request_task_resources from anon;
grant select, insert, update, delete on table public.leave_request_tasks to authenticated;
grant select, insert, update, delete on table public.leave_request_task_resources to authenticated;

drop policy if exists leave_request_tasks_staff_select on public.leave_request_tasks;
drop policy if exists leave_request_tasks_staff_write on public.leave_request_tasks;
drop policy if exists leave_request_task_resources_staff_select on public.leave_request_task_resources;
drop policy if exists leave_request_task_resources_staff_write on public.leave_request_task_resources;

create policy leave_request_tasks_staff_select
on public.leave_request_tasks for select to authenticated
using (
  public.current_user_is_staff()
  or exists (
    select 1 from public.leave_requests lr
    where lr.id = leave_request_tasks.leave_request_id
      and lr.teacher_id = public.current_user_teacher_id()
  )
);

create policy leave_request_tasks_staff_write
on public.leave_request_tasks for all to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

create policy leave_request_task_resources_staff_select
on public.leave_request_task_resources for select to authenticated
using (
  exists (
    select 1
    from public.leave_request_tasks lrt
    join public.leave_requests lr on lr.id = lrt.leave_request_id
    where lrt.id = leave_request_task_resources.leave_request_task_id
      and (
        public.current_user_is_staff()
        or lr.teacher_id = public.current_user_teacher_id()
      )
  )
);

create policy leave_request_task_resources_staff_write
on public.leave_request_task_resources for all to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

-- Submit V3 wraps V2 so all V3.12.1 period/class validation remains canonical.
create or replace function public.ejadwal_submit_public_leave_request_v3(
  p_teacher_name text,
  p_schedule_date date,
  p_request_type text,
  p_reason text,
  p_detail text default null,
  p_slots jsonb default '[]'::jsonb,
  p_periods jsonb default '[]'::jsonb,
  p_tasks jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_request_id uuid;
  v_upload_token text;
  v_task jsonb;
  v_resource jsonb;
  v_period smallint;
  v_description text;
  v_task_id uuid;
  v_url text;
  v_label text;
  v_resource_type text;
begin
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    raise exception 'TASKS_MUST_BE_JSON_ARRAY';
  end if;

  v_base := public.ejadwal_submit_public_leave_request_v2(
    p_teacher_name,
    p_schedule_date,
    p_request_type,
    p_reason,
    p_detail,
    p_slots,
    p_periods
  );

  v_request_id := nullif(v_base->>'request_id', '')::uuid;
  if v_request_id is null then raise exception 'PUBLIC_LEAVE_V2_DID_NOT_RETURN_REQUEST'; end if;

  -- UUID pair = 64 hex-ish characters; valid only while the request remains SUBMITTED.
  v_upload_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.leave_requests
  set task_upload_token = v_upload_token,
      task_upload_expires_at = now() + interval '24 hours',
      updated_at = now()
  where id = v_request_id;

  for v_task in select value from jsonb_array_elements(p_tasks)
  loop
    v_period := nullif(v_task->>'period', '')::smallint;
    if v_period is null or v_period < 1 or v_period > 6 then raise exception 'INVALID_TASK_PERIOD'; end if;

    if not exists (
      select 1 from public.leave_request_periods lrp
      where lrp.leave_request_id = v_request_id
        and lrp.period = v_period
        and lrp.period_type = 'TEACHING'
    ) then
      raise exception 'TASK_PERIOD_MUST_BE_SELECTED_TEACHING_PERIOD: JP %', v_period;
    end if;

    v_description := nullif(trim(coalesce(v_task->>'description', '')), '');
    insert into public.leave_request_tasks(leave_request_id, period, description)
    values (v_request_id, v_period, v_description)
    on conflict (leave_request_id, period)
    do update set description = excluded.description, updated_at = now()
    returning id into v_task_id;

    if v_task ? 'resources' then
      if jsonb_typeof(coalesce(v_task->'resources', '[]'::jsonb)) <> 'array' then
        raise exception 'TASK_RESOURCES_MUST_BE_JSON_ARRAY';
      end if;
      for v_resource in select value from jsonb_array_elements(coalesce(v_task->'resources', '[]'::jsonb))
      loop
        v_resource_type := upper(trim(coalesce(v_resource->>'resource_type', 'LINK')));
        v_url := trim(coalesce(v_resource->>'url', ''));
        v_label := nullif(trim(coalesce(v_resource->>'label', '')), '');
        if v_resource_type <> 'LINK' then raise exception 'PUBLIC_SUBMIT_ONLY_ACCEPTS_LINK_RESOURCE'; end if;
        if v_url = '' or v_url !~* '^https?://' then raise exception 'INVALID_TASK_LINK'; end if;

        insert into public.leave_request_task_resources(
          leave_request_task_id, resource_type, label, url,
          drive_file_id, file_name, mime_type
        ) values (
          v_task_id, 'LINK', v_label, v_url,
          null, null, null
        ) on conflict (leave_request_task_id, url) do nothing;
      end loop;
    end if;
  end loop;

  return v_base || jsonb_build_object(
    'task_upload_token', v_upload_token,
    'task_upload_expires_at', now() + interval '24 hours',
    'task_count', jsonb_array_length(p_tasks)
  );
end;
$$;

revoke all on function public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb) to anon, authenticated;

-- GAS calls this BEFORE creating a Drive file.
create or replace function public.ejadwal_validate_public_task_upload(
  p_request_code text,
  p_upload_token text,
  p_period smallint
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.leave_requests lr
    join public.leave_request_periods lrp on lrp.leave_request_id = lr.id
    where lr.request_code = trim(coalesce(p_request_code, ''))
      and lr.source = 'PUBLIC_FORM'
      and lr.status = 'SUBMITTED'
      and lr.task_upload_token = trim(coalesce(p_upload_token, ''))
      and lr.task_upload_expires_at > now()
      and lrp.period = p_period
      and lrp.period_type = 'TEACHING'
  );
$$;

revoke all on function public.ejadwal_validate_public_task_upload(text,text,smallint) from public;
grant execute on function public.ejadwal_validate_public_task_upload(text,text,smallint) to anon, authenticated;

-- GAS calls this AFTER Drive returns file metadata.
create or replace function public.ejadwal_attach_public_leave_task_file(
  p_request_code text,
  p_upload_token text,
  p_period smallint,
  p_url text,
  p_drive_file_id text,
  p_file_name text default null,
  p_mime_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_task_id uuid;
  v_resource_id uuid;
begin
  if not public.ejadwal_validate_public_task_upload(p_request_code, p_upload_token, p_period) then
    raise exception 'PUBLIC_TASK_UPLOAD_NOT_AUTHORIZED';
  end if;
  if trim(coalesce(p_url, '')) = '' or trim(coalesce(p_drive_file_id, '')) = '' then
    raise exception 'DRIVE_METADATA_REQUIRED';
  end if;

  select id into v_request_id
  from public.leave_requests
  where request_code = trim(p_request_code)
  limit 1;

  insert into public.leave_request_tasks(leave_request_id, period, description)
  values (v_request_id, p_period, null)
  on conflict (leave_request_id, period)
  do update set updated_at = now()
  returning id into v_task_id;

  insert into public.leave_request_task_resources(
    leave_request_task_id, resource_type, label, url,
    drive_file_id, file_name, mime_type
  ) values (
    v_task_id, 'DRIVE_FILE', nullif(trim(coalesce(p_file_name,'')), ''), trim(p_url),
    trim(p_drive_file_id), nullif(trim(coalesce(p_file_name,'')), ''),
    nullif(trim(coalesce(p_mime_type,'')), '')
  )
  on conflict (leave_request_task_id, url)
  do update set
    drive_file_id = excluded.drive_file_id,
    file_name = excluded.file_name,
    mime_type = excluded.mime_type
  returning id into v_resource_id;

  return jsonb_build_object('resource_id', v_resource_id, 'task_id', v_task_id, 'status', 'ATTACHED');
end;
$$;

revoke all on function public.ejadwal_attach_public_leave_task_file(text,text,smallint,text,text,text,text) from public;
grant execute on function public.ejadwal_attach_public_leave_task_file(text,text,smallint,text,text,text,text) to anon, authenticated;

-- Replace V3.12.2 decision RPC so APPROVE carries teacher-owned tasks forward.
create or replace function public.ejadwal_decide_leave_request(
  p_leave_request_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_request public.leave_requests%rowtype;
  v_teacher_name text;
  v_slot public.leave_request_slots%rowtype;
  v_existing public.coverage_slots%rowtype;
  v_coverage_id uuid;
  v_coverage_ids jsonb := '[]'::jsonb;
  v_waiting_count integer := 0;
  v_free_count integer := 0;
  v_teaching_period_count integer := 0;
  v_audit_request_id uuid := gen_random_uuid();
  v_leave_task public.leave_request_tasks%rowtype;
  v_learning_task_id uuid;
begin
  if v_actor is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
  if p_leave_request_id is null then raise exception 'LEAVE_REQUEST_ID_REQUIRED'; end if;
  if v_decision not in ('APPROVE', 'DECLINE') then raise exception 'INVALID_LEAVE_DECISION'; end if;

  select * into v_request from public.leave_requests where id = p_leave_request_id for update;
  if v_request.id is null then raise exception 'LEAVE_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'SUBMITTED' then raise exception 'LEAVE_REQUEST_ALREADY_DECIDED: %', v_request.status; end if;

  select t.full_name into v_teacher_name from public.teachers t where t.id = v_request.teacher_id;
  if v_teacher_name is null then raise exception 'LEAVE_TEACHER_NOT_FOUND'; end if;

  select count(*)::integer into v_free_count from public.leave_request_periods
    where leave_request_id = v_request.id and period_type = 'FREE';
  select count(*)::integer into v_teaching_period_count from public.leave_request_periods
    where leave_request_id = v_request.id and period_type = 'TEACHING';

  if v_decision = 'DECLINE' then
    update public.leave_requests
    set status='DECLINED', decided_by=v_actor, decided_at=now(), decision_note=v_note,
        task_upload_token=null, task_upload_expires_at=null, updated_at=now()
    where id=v_request.id;
    insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
    values(v_actor,'LEAVE_DECLINED','leave_request',v_request.id::text,
      jsonb_build_object('status','SUBMITTED'),
      jsonb_build_object('status','DECLINED','request_code',v_request.request_code,'teacher_name',v_teacher_name,'decision_note',v_note),
      v_audit_request_id);
    return jsonb_build_object('request_id',v_request.id,'request_code',v_request.request_code,'status','DECLINED',
      'coverage_slot_ids',v_coverage_ids,'waiting_count',0,'free_period_count',v_free_count,'teaching_period_count',v_teaching_period_count);
  end if;

  for v_slot in
    select * from public.leave_request_slots
    where leave_request_id=v_request.id
    order by schedule_date,period,class_name_snapshot,id
  loop
    if not exists (
      select 1 from public.leave_request_periods
      where leave_request_id=v_request.id and schedule_date=v_slot.schedule_date
        and period=v_slot.period and period_type='TEACHING'
    ) then raise exception 'LEAVE_SLOT_WITHOUT_TEACHING_PERIOD: JP %',v_slot.period; end if;

    if not public.ejadwal_school_period_active(v_slot.schedule_date,v_slot.period) then
      raise exception 'LEAVE_SLOT_NO_LONGER_ACTIVE: % JP %',v_slot.schedule_date,v_slot.period;
    end if;
    if not public.ejadwal_teacher_scheduled_for_leave_slot(v_request.teacher_id,v_slot.schedule_date,v_slot.class_id,v_slot.period) then
      raise exception 'LEAVE_SLOT_ASSIGNMENT_CHANGED: % JP %',v_slot.class_name_snapshot,v_slot.period;
    end if;

    select cs.* into v_existing from public.coverage_slots cs
    where cs.schedule_date=v_slot.schedule_date and cs.class_id=v_slot.class_id and cs.period=v_slot.period
      and cs.absent_teacher_id=v_request.teacher_id and cs.deleted_at is null and cs.status<>'CANCELLED'
    order by cs.updated_at desc,cs.id limit 1 for update;
    if v_existing.id is not null then raise exception 'ACTIVE_COVERAGE_ALREADY_EXISTS: % JP %',v_slot.class_name_snapshot,v_slot.period; end if;

    insert into public.coverage_slots(
      leave_request_id,schedule_date,class_id,class_name_snapshot,period,subject_snapshot,
      absent_teacher_id,absent_teacher_name_snapshot,substitute_teacher_id,substitute_teacher_name_snapshot,
      reason_snapshot,status,source,schedule_master_id,schedule_incidental_id,assigned_by,assigned_at
    ) values (
      v_request.id,v_slot.schedule_date,v_slot.class_id,v_slot.class_name_snapshot,v_slot.period,v_slot.subject_snapshot,
      v_request.teacher_id,v_teacher_name,null,null,v_request.reason,'WAITING','LEAVE_WORKFLOW',
      v_slot.schedule_master_id,v_slot.schedule_incidental_id,null,null
    ) returning id into v_coverage_id;

    -- Copy the teacher-owned JP task to every concrete class coverage row.
    v_leave_task.id := null;
    select * into v_leave_task from public.leave_request_tasks
    where leave_request_id=v_request.id and period=v_slot.period limit 1;
    if v_leave_task.id is not null then
      insert into public.learning_tasks(coverage_slot_id,description,created_by)
      values(v_coverage_id,v_leave_task.description,null)
      returning id into v_learning_task_id;

      insert into public.task_resources(task_id,resource_type,label,url,drive_file_id,file_name,mime_type)
      select v_learning_task_id,resource_type,label,url,drive_file_id,file_name,mime_type
      from public.leave_request_task_resources
      where leave_request_task_id=v_leave_task.id;
    end if;

    v_coverage_ids := v_coverage_ids || jsonb_build_array(v_coverage_id);
    v_waiting_count := v_waiting_count + 1;
  end loop;

  if v_teaching_period_count > 0 and v_waiting_count = 0 then
    raise exception 'APPROVAL_HAS_TEACHING_PERIOD_BUT_NO_COVERAGE';
  end if;

  update public.leave_requests
  set status='APPROVED', decided_by=v_actor, decided_at=now(), decision_note=v_note,
      task_upload_token=null, task_upload_expires_at=null, updated_at=now()
  where id=v_request.id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
  values(v_actor,'LEAVE_APPROVED','leave_request',v_request.id::text,
    jsonb_build_object('status','SUBMITTED'),
    jsonb_build_object('status','APPROVED','request_code',v_request.request_code,'teacher_name',v_teacher_name,
      'decision_note',v_note,'waiting_count',v_waiting_count,'free_period_count',v_free_count,
      'teaching_period_count',v_teaching_period_count,'coverage_slot_ids',v_coverage_ids),v_audit_request_id);

  return jsonb_build_object('request_id',v_request.id,'request_code',v_request.request_code,'status','APPROVED',
    'coverage_slot_ids',v_coverage_ids,'waiting_count',v_waiting_count,'free_period_count',v_free_count,'teaching_period_count',v_teaching_period_count);
end;
$$;

revoke all on function public.ejadwal_decide_leave_request(uuid,text,text) from public;
revoke all on function public.ejadwal_decide_leave_request(uuid,text,text) from anon;
grant execute on function public.ejadwal_decide_leave_request(uuid,text,text) to authenticated;


-- Assignment wrapper V3.12.4: teacher-owned tasks are immutable-by-default during
-- badal assignment. If Wakasek only chooses a substitute and leaves task fields
-- empty, carry the task + structured resources created from the approved leave
-- request forward instead of letting the legacy writer soft-delete them.
create or replace function public.ejadwal_save_inval_bundle_v3(
  p_rows jsonb,
  p_room_incidental jsonb default null,
  p_override_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_effective_rows jsonb := '[]'::jsonb;
  v_date date;
  v_class_code text;
  v_class_id uuid;
  v_period smallint;
  v_absent_teacher_id uuid;
  v_coverage_id uuid;
  v_task_id uuid;
  v_task_text text;
  v_resources jsonb;
  v_incoming_text text;
  v_incoming_resources jsonb;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVAL_ROWS_REQUIRED';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_incoming_text := trim(coalesce(v_row->>'task_text', ''));
    v_incoming_resources := coalesce(v_row->'task_resources', '[]'::jsonb);

    -- Preserve only canonical teacher-owned LEAVE_WORKFLOW task data. Manual
    -- Inval rows keep the existing editable behavior.
    v_date := nullif(trim(v_row->>'schedule_date'), '')::date;
    v_class_code := trim(coalesce(v_row->>'class_code', ''));
    v_period := nullif(trim(v_row->>'period'), '')::smallint;
    v_absent_teacher_id := nullif(trim(v_row->>'absent_teacher_id'), '')::uuid;
    v_class_id := null;
    v_coverage_id := null;
    v_task_id := null;
    v_task_text := null;
    v_resources := '[]'::jsonb;

    if v_date is not null and v_class_code <> '' and v_period is not null and v_absent_teacher_id is not null then
      select c.id into v_class_id
      from public.classes c
      where c.is_active = true
        and (lower(c.code) = lower(v_class_code) or lower(c.display_name) = lower(v_class_code))
      order by case when lower(c.code) = lower(v_class_code) then 0 else 1 end, c.id
      limit 1;

      if v_class_id is not null then
        select cs.id into v_coverage_id
        from public.coverage_slots cs
        where cs.schedule_date = v_date
          and cs.class_id = v_class_id
          and cs.period = v_period
          and cs.absent_teacher_id = v_absent_teacher_id
          and cs.source = 'LEAVE_WORKFLOW'
          and cs.status = 'WAITING'
          and cs.deleted_at is null
        order by cs.updated_at desc, cs.id
        limit 1;
      end if;
    end if;

    if v_coverage_id is not null then
      select lt.id, lt.description
        into v_task_id, v_task_text
      from public.learning_tasks lt
      where lt.coverage_slot_id = v_coverage_id and lt.deleted_at is null
      order by lt.created_at
      limit 1;

      if v_task_id is not null then
        select coalesce(jsonb_agg(jsonb_build_object(
          'resource_type', tr.resource_type,
          'label', tr.label,
          'url', tr.url,
          'drive_file_id', tr.drive_file_id,
          'file_name', tr.file_name,
          'mime_type', tr.mime_type
        ) order by tr.created_at, tr.id), '[]'::jsonb)
        into v_resources
        from public.task_resources tr
        where tr.task_id = v_task_id;

        if v_incoming_text = '' then
          v_row := jsonb_set(v_row, '{task_text}', to_jsonb(coalesce(v_task_text, '')), true);
        end if;
        if jsonb_typeof(v_incoming_resources) <> 'array' or jsonb_array_length(v_incoming_resources) = 0 then
          v_row := jsonb_set(v_row, '{task_resources}', coalesce(v_resources, '[]'::jsonb), true);
        end if;
      end if;
    end if;

    v_effective_rows := v_effective_rows || jsonb_build_array(v_row);
  end loop;

  return public.ejadwal_save_inval_bundle_v2(v_effective_rows, p_room_incidental, p_override_note);
end;
$$;

revoke all on function public.ejadwal_save_inval_bundle_v3(jsonb,jsonb,text) from public;
revoke all on function public.ejadwal_save_inval_bundle_v3(jsonb,jsonb,text) from anon;
grant execute on function public.ejadwal_save_inval_bundle_v3(jsonb,jsonb,text) to authenticated;

comment on function public.ejadwal_save_inval_bundle_v3(jsonb,jsonb,text) is
  'V3.12.4 assignment writer: preserves teacher-owned leave tasks/resources when staff only assigns the badal.';

comment on function public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb) is
  'V3.12.4 public leave submission with teacher-owned tasks and short-lived Drive upload capability.';

commit;
