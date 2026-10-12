-- E-Jadwal V3.14.6 RC3.4.9.2 — private management permission evidence.
-- Existing (legacy) SUBMITTED requests stay reviewable. New public requests
-- are stored as PENDING_EVIDENCE until a private screenshot is uploaded.
-- This migration requires storage schema (Supabase Storage) and migrations <= 005.

alter table public.leave_requests drop constraint if exists leave_requests_status_check;
alter table public.leave_requests add constraint leave_requests_status_check
  check (status in ('PENDING_EVIDENCE','SUBMITTED','APPROVED','DECLINED','CANCELLED'));

alter table public.leave_requests
  add column if not exists evidence_required boolean not null default false,
  add column if not exists evidence_path text,
  add column if not exists evidence_upload_token text,
  add column if not exists evidence_upload_expires_at timestamptz,
  add column if not exists evidence_uploaded_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ejadwal-leave-evidence', 'ejadwal-leave-evidence', false, 5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[];

-- A single, non-guessable object path is minted by the server per request.
-- Anonymous clients may INSERT only that object's exact path, while pending
-- and only during its short-lived upload window. No public SELECT policy.
create or replace function public.ejadwal_can_upload_leave_evidence(p_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.leave_requests r
    where r.evidence_required
      and r.status = 'PENDING_EVIDENCE'
      and r.evidence_uploaded_at is null
      and r.evidence_upload_expires_at > now()
      and r.evidence_path = p_path
  );
$$;
revoke all on function public.ejadwal_can_upload_leave_evidence(text) from public;
grant execute on function public.ejadwal_can_upload_leave_evidence(text) to anon, authenticated;

drop policy if exists ejadwal_leave_evidence_insert on storage.objects;
create policy ejadwal_leave_evidence_insert
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'ejadwal-leave-evidence'
  and public.ejadwal_can_upload_leave_evidence(name)
);

drop policy if exists ejadwal_leave_evidence_staff_select on storage.objects;
create policy ejadwal_leave_evidence_staff_select
on storage.objects for select to authenticated
using (
  bucket_id = 'ejadwal-leave-evidence'
  and public.current_user_is_staff()
);

create or replace function public.ejadwal_submit_public_leave_request_v4(
  p_teacher_name text,
  p_schedule_date date,
  p_request_type text,
  p_reason text,
  p_detail text default null,
  p_slots jsonb default '[]'::jsonb,
  p_periods jsonb default '[]'::jsonb,
  p_tasks jsonb default '[]'::jsonb,
  p_evidence_extension text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_base jsonb;
  v_id uuid;
  v_token text;
  v_ext text := lower(trim(coalesce(p_evidence_extension, '')));
  v_path text;
begin
  if v_ext not in ('jpg','jpeg','png','webp') then
    raise exception 'EVIDENCE_IMAGE_REQUIRED';
  end if;
  -- Called atomically; SUBMITTED is never visible before the status is held.
  v_base := public.ejadwal_submit_public_leave_request_v3(
    p_teacher_name, p_schedule_date, p_request_type, p_reason, p_detail,
    p_slots, p_periods, p_tasks
  );
  v_id := nullif(v_base->>'request_id','')::uuid;
  if v_id is null then raise exception 'LEAVE_DRAFT_CREATION_FAILED'; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  v_path := v_id::text || '/' || v_token || '/proof.' || v_ext;
  update public.leave_requests
     set status = 'PENDING_EVIDENCE', evidence_required = true,
         evidence_path = v_path, evidence_upload_token = v_token,
         evidence_upload_expires_at = now() + interval '24 hours',
         evidence_uploaded_at = null, updated_at = now()
   where id = v_id;
  return v_base || jsonb_build_object(
    'status','PENDING_EVIDENCE',
    'evidence_path',v_path,
    'evidence_upload_token',v_token
  );
end;
$$;
revoke all on function public.ejadwal_submit_public_leave_request_v4(text,date,text,text,text,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.ejadwal_submit_public_leave_request_v4(text,date,text,text,text,jsonb,jsonb,jsonb,text) to anon, authenticated;

create or replace function public.ejadwal_finalize_leave_evidence_v1(
  p_leave_request_id uuid, p_evidence_upload_token text
)
returns jsonb language plpgsql security definer set search_path = public, storage, pg_temp
as $$
declare
  v_request public.leave_requests%rowtype;
  v_object storage.objects%rowtype;
  v_mime text;
  v_size bigint;
begin
  select * into v_request from public.leave_requests
    where id = p_leave_request_id for update;
  if v_request.id is null then raise exception 'LEAVE_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'PENDING_EVIDENCE' or not v_request.evidence_required
     or v_request.evidence_uploaded_at is not null then
    raise exception 'EVIDENCE_REQUEST_NOT_PENDING';
  end if;
  if v_request.evidence_upload_token is distinct from trim(coalesce(p_evidence_upload_token,''))
     or v_request.evidence_upload_expires_at <= now() then
    raise exception 'EVIDENCE_UPLOAD_TOKEN_INVALID_OR_EXPIRED';
  end if;
  select * into v_object from storage.objects
    where bucket_id='ejadwal-leave-evidence' and name=v_request.evidence_path limit 1;
  if v_object.id is null then raise exception 'EVIDENCE_FILE_NOT_UPLOADED'; end if;
  v_mime := lower(coalesce(v_object.metadata->>'mimetype', ''));
  v_size := nullif(v_object.metadata->>'size','')::bigint;
  if v_mime not in ('image/jpeg','image/png','image/webp')
     or v_size is null or v_size <= 0 or v_size > 5242880 then
    raise exception 'EVIDENCE_FILE_INVALID';
  end if;
  update public.leave_requests
    set status='SUBMITTED', submitted_at=now(), evidence_uploaded_at=now(),
        evidence_upload_token=null, evidence_upload_expires_at=null, updated_at=now()
    where id=v_request.id;
  return jsonb_build_object('request_id',v_request.id,
    'request_code',v_request.request_code,'status','SUBMITTED');
end;
$$;
revoke all on function public.ejadwal_finalize_leave_evidence_v1(uuid,text) from public;
grant execute on function public.ejadwal_finalize_leave_evidence_v1(uuid,text) to anon, authenticated;

-- Back-end safeguard: even another staff RPC cannot approve a new request
-- unless the private evidence actually completed the verification process.
create or replace function public.ejadwal_guard_leave_evidence_approval()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.status='APPROVED' and old.status is distinct from 'APPROVED'
     and new.evidence_required and (
       new.evidence_uploaded_at is null or nullif(new.evidence_path,'') is null
     ) then
    raise exception 'MANAGEMENT_PERMISSION_EVIDENCE_REQUIRED';
  end if;
  return new;
end;
$$;
drop trigger if exists ejadwal_leave_evidence_approval_guard on public.leave_requests;
create trigger ejadwal_leave_evidence_approval_guard
before update of status on public.leave_requests
for each row execute function public.ejadwal_guard_leave_evidence_approval();

-- Do not leave an anonymous bypass open through the older public submit RPCs.
-- v4 is SECURITY DEFINER and still invokes v3 internally as its owner.
revoke execute on function public.ejadwal_submit_public_leave_request_v3(text,date,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke execute on function public.ejadwal_submit_public_leave_request_v2(text,date,text,text,text,jsonb,jsonb) from public, anon, authenticated;
-- Some older staging schemas expose the original v1; conditionally revoke.
do $$
begin
  if to_regprocedure('public.ejadwal_submit_public_leave_request(text,date,text,text,text,jsonb)') is not null then
    execute 'revoke execute on function public.ejadwal_submit_public_leave_request(text,date,text,text,text,jsonb) from public, anon, authenticated';
  end if;
end;
$$;

-- Never allow an authenticated teacher to bypass proof by directly INSERTing
-- status=SUBMITTED through PostgREST. Staff policy remains in effect.
drop policy if exists leave_requests_teacher_insert on public.leave_requests;
