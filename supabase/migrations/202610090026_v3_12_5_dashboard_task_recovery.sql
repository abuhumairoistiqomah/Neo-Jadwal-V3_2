-- E-Jadwal V3.12.5 — Dashboard Session Merge + Late Task Recovery
-- Database scope:
-- 1) Keep teacher task upload capability alive after APPROVE until shortly after the leave date.
-- 2) Allow secure-ish recovery from another device using request code + last 4 WhatsApp digits.
-- 3) Allow late text/link completion and propagate teacher-owned task data into existing coverage rows.
-- 4) Existing GAS Drive upload endpoint stays unchanged; validation now accepts APPROVED requests.

begin;

-- ---------------------------------------------------------------------------
-- Preserve public task upload token when an approval RPC intentionally nulls it.
-- DECLINED/CANCELLED still lose public upload capability.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_preserve_task_upload_after_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'SUBMITTED' and new.status = 'APPROVED' and old.task_upload_token is not null then
    new.task_upload_token := coalesce(new.task_upload_token, old.task_upload_token);
    new.task_upload_expires_at := greatest(
      coalesce(new.task_upload_expires_at, '-infinity'::timestamptz),
      coalesce(old.task_upload_expires_at, '-infinity'::timestamptz),
      now() + interval '4 hours',
      (new.date_start::timestamp at time zone 'Asia/Jakarta') + interval '2 days'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_preserve_task_upload on public.leave_requests;
create trigger trg_leave_requests_preserve_task_upload
before update on public.leave_requests
for each row execute function public.ejadwal_preserve_task_upload_after_approval();

-- Existing GAS validation now permits task files both before and after approval.
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
      and lr.status in ('SUBMITTED', 'APPROVED')
      and lr.task_upload_token = trim(coalesce(p_upload_token, ''))
      and lr.task_upload_expires_at > now()
      and lrp.period = p_period
      and lrp.period_type = 'TEACHING'
  );
$$;

revoke all on function public.ejadwal_validate_public_task_upload(text,text,smallint) from public;
grant execute on function public.ejadwal_validate_public_task_upload(text,text,smallint) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Canonical propagation: teacher-owned leave task -> every LEAVE_WORKFLOW
-- coverage row for that request + period. This makes late task upload visible
-- to the already-assigned substitute without re-running Inval.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_sync_leave_task_to_coverage(
  p_leave_request_id uuid,
  p_period smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leave_task public.leave_request_tasks%rowtype;
  v_coverage record;
  v_learning_task_id uuid;
  v_resource record;
begin
  select * into v_leave_task
  from public.leave_request_tasks
  where leave_request_id = p_leave_request_id
    and period = p_period
  limit 1;

  if v_leave_task.id is null then return; end if;

  for v_coverage in
    select cs.id
    from public.coverage_slots cs
    where cs.leave_request_id = p_leave_request_id
      and cs.period = p_period
      and cs.source = 'LEAVE_WORKFLOW'
      and cs.deleted_at is null
      and cs.status <> 'CANCELLED'
  loop
    select lt.id into v_learning_task_id
    from public.learning_tasks lt
    where lt.coverage_slot_id = v_coverage.id
      and lt.deleted_at is null
    order by lt.created_at asc
    limit 1;

    if v_learning_task_id is null then
      insert into public.learning_tasks(coverage_slot_id, description)
      values (v_coverage.id, v_leave_task.description)
      returning id into v_learning_task_id;
    else
      update public.learning_tasks
      set description = v_leave_task.description,
          updated_at = now()
      where id = v_learning_task_id;
    end if;

    for v_resource in
      select *
      from public.leave_request_task_resources lrtr
      where lrtr.leave_request_task_id = v_leave_task.id
      order by lrtr.created_at asc
    loop
      if not exists (
        select 1 from public.task_resources tr
        where tr.task_id = v_learning_task_id
          and tr.url = v_resource.url
      ) then
        insert into public.task_resources(
          task_id, resource_type, label, url, drive_file_id, file_name, mime_type
        ) values (
          v_learning_task_id,
          v_resource.resource_type,
          v_resource.label,
          v_resource.url,
          v_resource.drive_file_id,
          v_resource.file_name,
          v_resource.mime_type
        );
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.ejadwal_sync_leave_task_to_coverage(uuid,smallint) from public;

create or replace function public.ejadwal_sync_leave_task_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_period smallint;
  v_task_id uuid;
begin
  if tg_table_name = 'leave_request_tasks' then
    v_request_id := new.leave_request_id;
    v_period := new.period;
  else
    v_task_id := new.leave_request_task_id;
    select leave_request_id, period into v_request_id, v_period
    from public.leave_request_tasks
    where id = v_task_id;
  end if;

  if v_request_id is not null and v_period is not null then
    perform public.ejadwal_sync_leave_task_to_coverage(v_request_id, v_period);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leave_request_tasks_sync_coverage on public.leave_request_tasks;
create trigger trg_leave_request_tasks_sync_coverage
after insert or update on public.leave_request_tasks
for each row execute function public.ejadwal_sync_leave_task_trigger();

drop trigger if exists trg_leave_request_task_resources_sync_coverage on public.leave_request_task_resources;
create trigger trg_leave_request_task_resources_sync_coverage
after insert or update on public.leave_request_task_resources
for each row execute function public.ejadwal_sync_leave_task_trigger();

-- ---------------------------------------------------------------------------
-- Cross-device recovery. Request code is combined with the last four digits of
-- the teacher's registered WhatsApp number before a fresh high-entropy token is
-- issued. Same-device users normally never need this because the frontend keeps
-- the original token locally.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_recover_public_task_upload(
  p_teacher_name text,
  p_request_code text,
  p_whatsapp_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.leave_requests%rowtype;
  v_teacher public.teachers%rowtype;
  v_phone_digits text;
  v_last4 text := regexp_replace(trim(coalesce(p_whatsapp_last4,'')), '[^0-9]', '', 'g');
  v_token text;
  v_expiry timestamptz;
begin
  if length(v_last4) <> 4 then raise exception 'WHATSAPP_LAST4_REQUIRED'; end if;

  select lr.*
  into v_request
  from public.leave_requests lr
  join public.teachers t on t.id = lr.teacher_id
  where lr.request_code = trim(coalesce(p_request_code,''))
    and lower(trim(t.full_name)) = lower(trim(coalesce(p_teacher_name,'')))
    and lr.source = 'PUBLIC_FORM'
    and lr.status in ('SUBMITTED','APPROVED')
  limit 1;

  if v_request.id is null then raise exception 'LEAVE_REQUEST_NOT_FOUND'; end if;

  select * into v_teacher from public.teachers where id = v_request.teacher_id;
  v_phone_digits := regexp_replace(coalesce(v_teacher.whatsapp_e164,''), '[^0-9]', '', 'g');
  if length(v_phone_digits) < 4 then raise exception 'TEACHER_WHATSAPP_NOT_REGISTERED'; end if;
  if right(v_phone_digits, 4) <> v_last4 then raise exception 'WHATSAPP_LAST4_MISMATCH'; end if;

  if now() > ((v_request.date_start::timestamp at time zone 'Asia/Jakarta') + interval '2 days') then
    raise exception 'TASK_RECOVERY_WINDOW_CLOSED';
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expiry := greatest(now() + interval '4 hours', (v_request.date_start::timestamp at time zone 'Asia/Jakarta') + interval '2 days');

  update public.leave_requests
  set task_upload_token = v_token,
      task_upload_expires_at = v_expiry,
      updated_at = now()
  where id = v_request.id;

  return jsonb_build_object(
    'request_code', v_request.request_code,
    'teacher_name', v_teacher.full_name,
    'schedule_date', v_request.date_start,
    'upload_token', v_token,
    'expires_at', v_expiry
  );
end;
$$;

revoke all on function public.ejadwal_recover_public_task_upload(text,text,text) from public;
grant execute on function public.ejadwal_recover_public_task_upload(text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Late text/link completion. Drive files still travel through GAS, which calls
-- ejadwal_attach_public_leave_task_file after upload. The sync triggers above
-- propagate both paths into already-existing coverage rows.
-- ---------------------------------------------------------------------------
create or replace function public.ejadwal_complete_public_leave_task(
  p_request_code text,
  p_upload_token text,
  p_period smallint,
  p_description text,
  p_resources jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_task_id uuid;
  v_resource jsonb;
  v_url text;
  v_label text;
begin
  if not public.ejadwal_validate_public_task_upload(p_request_code, p_upload_token, p_period) then
    raise exception 'PUBLIC_TASK_UPLOAD_NOT_AUTHORIZED';
  end if;
  if p_resources is null or jsonb_typeof(p_resources) <> 'array' then
    raise exception 'TASK_RESOURCES_MUST_BE_JSON_ARRAY';
  end if;

  select id into v_request_id
  from public.leave_requests
  where request_code = trim(p_request_code)
  limit 1;

  insert into public.leave_request_tasks(leave_request_id, period, description)
  values (v_request_id, p_period, nullif(trim(coalesce(p_description,'')),''))
  on conflict (leave_request_id, period)
  do update set description = excluded.description, updated_at = now()
  returning id into v_task_id;

  -- Teacher-supplied LINK resources are replaceable; Drive files are preserved.
  delete from public.leave_request_task_resources
  where leave_request_task_id = v_task_id
    and resource_type = 'LINK';

  for v_resource in select value from jsonb_array_elements(p_resources)
  loop
    v_url := trim(coalesce(v_resource->>'url',''));
    v_label := nullif(trim(coalesce(v_resource->>'label','')), '');
    if v_url !~* '^https?://' then raise exception 'INVALID_TASK_LINK'; end if;

    insert into public.leave_request_task_resources(
      leave_request_task_id, resource_type, label, url
    ) values (
      v_task_id, 'LINK', v_label, v_url
    )
    on conflict (leave_request_task_id, url)
    do update set label = excluded.label;
  end loop;

  perform public.ejadwal_sync_leave_task_to_coverage(v_request_id, p_period);

  return jsonb_build_object('status','UPDATED','request_id',v_request_id,'period',p_period,'task_id',v_task_id);
end;
$$;

revoke all on function public.ejadwal_complete_public_leave_task(text,text,smallint,text,jsonb) from public;
grant execute on function public.ejadwal_complete_public_leave_task(text,text,smallint,text,jsonb) to anon, authenticated;

commit;
