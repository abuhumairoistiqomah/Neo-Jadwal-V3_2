-- E-JADWAL V3.20 RC1.7.1 HF7 | Per-request task passwords and authenticated staff bypass
-- Apply AFTER 202611110001_v3_20_rc1_7_1_hf6_2_public_team_tasks.sql.
-- The password table must NEVER be exposed in the anonymous public snapshot.
begin;

create table if not exists public.leave_task_passwords (
  leave_request_id uuid primary key references public.leave_requests(id) on delete cascade,
  password_text text not null check (password_text ~ '^[A-Z]{8,24}$'),
  failed_attempts integer not null default 0,
  locked_until timestamptz null,
  changed_at timestamptz not null default now(),
  changed_by uuid null
);
alter table public.leave_task_passwords enable row level security;
revoke all on table public.leave_task_passwords from public, anon, authenticated;
-- No public SELECT/UPDATE/INSERT policies: access is only through role-checked RPCs.

create or replace function public.ejadwal_generate_task_password_hf7()
returns text language sql volatile set search_path=public as $$
  -- 12 uniformly sampled hexadecimal nibbles remapped into 12 letters, ~48 bits.
  select translate(substr(replace(gen_random_uuid()::text, '-', ''),1,12),
                   '0123456789abcdef', 'ABCDEFGHJKLMNPQR');
$$;
revoke all on function public.ejadwal_generate_task_password_hf7() from public, anon, authenticated;

create or replace function public.ejadwal_seed_task_password_hf7()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Authenticated/staff legacy submissions may not carry a request_code.
  -- Give them a stable, unique internal code so the existing upload pipeline works.
  if new.request_code is null then
    update public.leave_requests set request_code='TSK-'||replace(new.id::text,'-','')
    where id=new.id and request_code is null;
  end if;
  insert into public.leave_task_passwords(leave_request_id,password_text)
  values(new.id,public.ejadwal_generate_task_password_hf7())
  on conflict (leave_request_id) do nothing;
  return new;
end; $$;
revoke all on function public.ejadwal_seed_task_password_hf7() from public, anon, authenticated;
drop trigger if exists trg_ejadwal_seed_task_password_hf7 on public.leave_requests;
create trigger trg_ejadwal_seed_task_password_hf7
  after insert on public.leave_requests for each row
  execute function public.ejadwal_seed_task_password_hf7();

-- Backfill internal codes for older approved/staff submissions before enabling task upload.
update public.leave_requests
set request_code='TSK-'||replace(id::text,'-','')
where request_code is null;

insert into public.leave_task_passwords(leave_request_id,password_text)
select lr.id, public.ejadwal_generate_task_password_hf7()
from public.leave_requests lr
on conflict(leave_request_id) do nothing;

create or replace function public.ejadwal_list_leave_task_passwords_hf7(p_request_ids uuid[])
returns table(leave_request_id uuid, password_text text)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not exists(
    select 1 from public.user_roles where user_id=auth.uid() and role in ('ADMIN','WAKASEK')
  ) then raise exception 'ADMIN_OR_WAKASEK_REQUIRED'; end if;
  return query
  select p.leave_request_id,p.password_text from public.leave_task_passwords p
  where p.leave_request_id=any(p_request_ids);
end; $$;
revoke all on function public.ejadwal_list_leave_task_passwords_hf7(uuid[]) from public, anon;
grant execute on function public.ejadwal_list_leave_task_passwords_hf7(uuid[]) to authenticated;

create or replace function public.ejadwal_set_leave_task_password_hf7(
 p_leave_request_id uuid, p_new_password text default null
) returns text language plpgsql security definer set search_path=public as $$
declare v_old text; v_new text;
begin
  if auth.uid() is null or not exists(
    select 1 from public.user_roles where user_id=auth.uid() and role in ('ADMIN','WAKASEK')
  ) then raise exception 'ADMIN_OR_WAKASEK_REQUIRED'; end if;
  if not exists(select 1 from public.leave_requests where id=p_leave_request_id and deleted_at is null)
  then raise exception 'REQUEST_NOT_ACTIVE'; end if;
  v_new := coalesce(nullif(upper(trim(coalesce(p_new_password,''))),''), public.ejadwal_generate_task_password_hf7());
  if v_new !~ '^[A-Z]{8,24}$' then raise exception 'PASSWORD_MUST_BE_8_TO_24_LETTERS'; end if;
  select password_text into v_old from public.leave_task_passwords where leave_request_id=p_leave_request_id for update;
  insert into public.leave_task_passwords(leave_request_id,password_text,failed_attempts,locked_until,changed_at,changed_by)
  values(p_leave_request_id,v_new,0,null,now(),auth.uid())
  on conflict(leave_request_id) do update
  set password_text=excluded.password_text,failed_attempts=0,locked_until=null,
      changed_at=now(),changed_by=auth.uid();
  -- Revoke previously issued upload tokens when the password changes.
  update public.leave_requests set task_upload_token=null,task_upload_expires_at=null,updated_at=now()
  where id=p_leave_request_id;
  -- Never put the secret itself in the audit log.
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id)
  values(auth.uid(),'LEAVE_TASK_PASSWORD_CHANGED','leave_request',p_leave_request_id::text,
         jsonb_build_object('had_password',v_old is not null),
         jsonb_build_object('rotated',true,'changed_at',now()),p_leave_request_id);
  return v_new;
end; $$;
revoke all on function public.ejadwal_set_leave_task_password_hf7(uuid,text) from public, anon;
grant execute on function public.ejadwal_set_leave_task_password_hf7(uuid,text) to authenticated;

-- Issue a short-lived token compatible with existing text/link + Drive upload RPCs.
-- Role checks MUST be performed inside PostgreSQL, not via the Admin Mode UI flag.
create or replace function public.ejadwal_unlock_leave_task_hf7(
 p_teacher_name text, p_schedule_date date, p_period smallint,
 p_password text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_request public.leave_requests%rowtype;
  v_password public.leave_task_passwords%rowtype;
  v_matches int;
  v_staff boolean;
  v_token text;
  v_expiry timestamptz;
begin
  if p_schedule_date is null or p_period not between 1 and 6
  then raise exception 'VALID_DATE_AND_PERIOD_REQUIRED'; end if;
  v_staff := auth.uid() is not null and exists(
    select 1 from public.user_roles where user_id=auth.uid() and role in ('ADMIN','WAKASEK')
  );
  select count(*) into v_matches
  from public.leave_requests lr join public.teachers t on t.id=lr.teacher_id
  where lower(trim(t.full_name))=lower(trim(coalesce(p_teacher_name,'')))
    and lr.status='APPROVED' and lr.deleted_at is null
    and exists (select 1 from public.leave_request_periods lp
      where lp.leave_request_id=lr.id and lp.schedule_date=p_schedule_date
      and lp.period=p_period and lp.period_type='TEACHING');
  if v_matches=0 then raise exception 'TASK_LEAVE_REQUEST_NOT_FOUND'; end if;
  if v_matches<>1 then raise exception 'AMBIGUOUS_TASK_LEAVE_REQUEST'; end if;
  select lr.* into v_request
  from public.leave_requests lr join public.teachers t on t.id=lr.teacher_id
  where lower(trim(t.full_name))=lower(trim(coalesce(p_teacher_name,'')))
    and lr.status='APPROVED' and lr.deleted_at is null
    and exists (select 1 from public.leave_request_periods lp
      where lp.leave_request_id=lr.id and lp.schedule_date=p_schedule_date
      and lp.period=p_period and lp.period_type='TEACHING')
  limit 1 for update of lr;
  if not v_staff then
    select * into v_password from public.leave_task_passwords
    where leave_request_id=v_request.id for update;
    if not found then raise exception 'TASK_PASSWORD_NOT_INITIALIZED'; end if;
    if v_password.locked_until is not null and v_password.locked_until>now()
    then return jsonb_build_object('error','TASK_PASSWORD_TEMPORARILY_LOCKED'); end if;
    if upper(trim(coalesce(p_password,''))) is distinct from v_password.password_text then
      update public.leave_task_passwords
        set failed_attempts=failed_attempts+1,
            locked_until=case when failed_attempts>=9 then now()+interval '10 minutes' else null end
      where leave_request_id=v_request.id;
      return jsonb_build_object('error','INVALID_TASK_PASSWORD');
    end if;
    update public.leave_task_passwords set failed_attempts=0,locked_until=null
    where leave_request_id=v_request.id;
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  v_expiry := now()+ interval '4 hours';
  update public.leave_requests set task_upload_token=v_token,
    task_upload_expires_at=v_expiry,updated_at=now() where id=v_request.id;
  return jsonb_build_object('request_code',v_request.request_code,
    'teacher_name',p_teacher_name,'schedule_date',p_schedule_date,
    'upload_token',v_token,'expires_at',v_expiry);
end; $$;
revoke all on function public.ejadwal_unlock_leave_task_hf7(text,date,smallint,text) from public;
grant execute on function public.ejadwal_unlock_leave_task_hf7(text,date,smallint,text) to anon, authenticated;

-- Existing task/file writing validation must accept staff-created leave requests
-- when a valid scoped token has been issued by the new role-checked/password RPC.
create or replace function public.ejadwal_validate_public_task_upload(
  p_request_code text, p_upload_token text, p_period smallint
) returns boolean language sql security definer set search_path=public as $$
 select exists (
  select 1 from public.leave_requests lr
  join public.leave_request_periods lp on lp.leave_request_id=lr.id
  where lr.request_code=trim(coalesce(p_request_code,''))
    and lr.status in ('SUBMITTED','APPROVED') and lr.deleted_at is null
    and lr.task_upload_token=trim(coalesce(p_upload_token,''))
    and lr.task_upload_expires_at>now()
    and lp.period=p_period and lp.period_type='TEACHING'
 );
$$;
revoke all on function public.ejadwal_validate_public_task_upload(text,text,smallint) from public;
grant execute on function public.ejadwal_validate_public_task_upload(text,text,smallint) to anon, authenticated;
commit;
