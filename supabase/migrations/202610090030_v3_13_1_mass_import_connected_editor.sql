-- E-Jadwal V3.13.1 — Mass Schedule Importer + Connected Quick Editor
-- Adds reusable teacher aliases, import batch audit, atomic mass publishing,
-- and atomic master-schedule quick editing. ADMIN only for mutations.

begin;


-- ---------------------------------------------------------------------------
-- V3.13.1 JP-0 Homeroom foundation
--
-- JP-0 is a real attendance/coverage period. It is virtual when the legacy
-- homeroom duty is stored on teachers.additional_task + teachers.notes, so it
-- does not need to be duplicated into the spreadsheet `ori` schedule.
-- ---------------------------------------------------------------------------

alter table public.leave_request_periods
  drop constraint if exists leave_request_periods_period_check;
alter table public.leave_request_periods
  add constraint leave_request_periods_period_check check (period between 0 and 6);

create or replace function public.ejadwal_normalize_class_label(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(lower(trim(coalesce(p_value, ''))), '[[:space:]]+', ' ', 'g'),
    '^0+([0-9]+)',
    '\1'
  );
$$;

revoke all on function public.ejadwal_normalize_class_label(text) from public;
grant execute on function public.ejadwal_normalize_class_label(text) to authenticated;

create or replace function public.ejadwal_teacher_scheduled_for_leave_slot(
  p_teacher_id uuid,
  p_schedule_date date,
  p_class_id uuid,
  p_period smallint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_name text;
  v_master_id uuid;
  v_incidental_id uuid;
  v_incidental_kind text;
  v_found boolean := false;
begin
  select t.full_name into v_teacher_name
  from public.teachers t
  where t.id = p_teacher_id and t.is_active = true;

  if v_teacher_name is null then
    return false;
  end if;

  -- Homeroom JP-0 may be virtual: the canonical legacy-compatible teacher
  -- snapshot derives wali/pendamping class from additional_task + notes.
  if p_period = 0 and exists (
    select 1
    from public.teachers t
    join public.classes c on c.id = p_class_id and c.is_active = true
    where t.id = p_teacher_id
      and t.is_active = true
      and (
        lower(coalesce(t.additional_task, '')) like '%wali%'
        or lower(coalesce(t.additional_task, '')) like '%pendamping%'
      )
      and (
        public.ejadwal_normalize_class_label(t.notes) = public.ejadwal_normalize_class_label(c.display_name)
        or public.ejadwal_normalize_class_label(t.notes) = public.ejadwal_normalize_class_label(c.code)
      )
  ) then
    return true;
  end if;

  -- Explicit JP-0 schedule rows (if the school adds them later) and all JP1-6
  -- continue to use the canonical schedule/incidentals validator.
  select sm.id into v_master_id
  from public.schedule_master sm
  where sm.class_id = p_class_id
    and sm.day_of_week = extract(isodow from p_schedule_date)::smallint
    and sm.period = p_period
    and sm.is_active = true
    and sm.deleted_at is null
  order by sm.id
  limit 1;

  select si.id, si.kind into v_incidental_id, v_incidental_kind
  from public.schedule_incidentals si
  where si.schedule_date = p_schedule_date
    and si.class_id = p_class_id
    and si.period = p_period
    and si.deleted_at is null
  order by si.updated_at desc, si.id
  limit 1;

  if v_master_id is null and v_incidental_id is null then
    return false;
  end if;

  select exists (
    select 1
    from generate_series(1, 6) as p(position)
    left join public.schedule_master_teachers smt
      on smt.schedule_id = v_master_id
     and smt.position = p.position
    left join public.schedule_incidental_teacher_overrides ito
      on ito.incidental_id = v_incidental_id
     and ito.position = p.position
    where
      case
        when ito.position is not null then
          ito.action = 'SET'
          and (
            ito.teacher_id = p_teacher_id
            or (
              ito.teacher_id is null
              and lower(trim(coalesce(ito.teacher_name_snapshot, ''))) = lower(trim(v_teacher_name))
            )
          )
        when v_incidental_kind = 'ADDITIONAL' then false
        else
          smt.teacher_id = p_teacher_id
          or (
            smt.teacher_id is null
            and lower(trim(coalesce(smt.teacher_name_snapshot, ''))) = lower(trim(v_teacher_name))
          )
      end
  ) into v_found;

  return coalesce(v_found, false);
end;
$$;

revoke all on function public.ejadwal_teacher_scheduled_for_leave_slot(uuid,date,uuid,smallint) from public;
revoke all on function public.ejadwal_teacher_scheduled_for_leave_slot(uuid,date,uuid,smallint) from anon;

create or replace function public.ejadwal_school_period_active(
  p_schedule_date date,
  p_period smallint
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when p_period = 0 then exists (
      select 1
      from public.classes c
      where c.is_active = true
        and (
          exists (
            select 1
            from public.schedule_master sm
            where sm.class_id = c.id
              and sm.day_of_week = extract(isodow from p_schedule_date)::smallint
              and sm.period between 0 and 6
              and sm.is_active = true
              and sm.deleted_at is null
          )
          or exists (
            select 1
            from public.schedule_incidentals si
            where si.class_id = c.id
              and si.schedule_date = p_schedule_date
              and si.period between 0 and 6
              and si.deleted_at is null
          )
        )
        and not exists (
          select 1
          from public.academic_events ae
          where ae.status = 'ACTIVE'
            and p_schedule_date between ae.date_start and ae.date_end
            and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = c.id))
            and (
              (ae.period_start is null and ae.period_end is null)
              or 0 between ae.period_start and ae.period_end
            )
        )
    )
    else exists (
      select 1
      from public.classes c
      where c.is_active = true
        and (
          exists (
            select 1 from public.schedule_master sm
            where sm.class_id = c.id
              and sm.day_of_week = extract(isodow from p_schedule_date)::smallint
              and sm.period = p_period
              and sm.is_active = true
              and sm.deleted_at is null
          )
          or exists (
            select 1 from public.schedule_incidentals si
            where si.class_id = c.id
              and si.schedule_date = p_schedule_date
              and si.period = p_period
              and si.deleted_at is null
          )
        )
        and not exists (
          select 1 from public.academic_events ae
          where ae.status = 'ACTIVE'
            and p_schedule_date between ae.date_start and ae.date_end
            and (ae.scope = 'ALL' or (ae.scope = 'CLASS' and ae.class_id = c.id))
            and (
              (ae.period_start is null and ae.period_end is null)
              or p_period between ae.period_start and ae.period_end
            )
        )
    )
  end;
$$;

revoke all on function public.ejadwal_school_period_active(date,smallint) from public;
revoke all on function public.ejadwal_school_period_active(date,smallint) from anon;

create or replace function public.ejadwal_submit_public_leave_request_v2(
  p_teacher_name text,
  p_schedule_date date,
  p_request_type text,
  p_reason text,
  p_detail text default null,
  p_slots jsonb default '[]'::jsonb,
  p_periods jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher_id uuid;
  v_teacher_name text;
  v_period_row jsonb;
  v_period smallint;
  v_period_type text;
  v_seen_periods smallint[] := '{}'::smallint[];
  v_period_count integer := 0;
  v_free_count integer := 0;
  v_teaching_period_count integer := 0;
  v_teaching_slot_count integer := 0;
  v_base_result jsonb;
  v_request_id uuid;
  v_request_code text;
  v_audit_request_id uuid := gen_random_uuid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_detail text := nullif(trim(coalesce(p_detail, '')), '');
  v_request_type text := upper(trim(coalesce(p_request_type, '')));
begin
  if p_schedule_date is null then raise exception 'SCHEDULE_DATE_REQUIRED'; end if;
  if trim(coalesce(p_teacher_name, '')) = '' then raise exception 'TEACHER_NAME_REQUIRED'; end if;
  if v_request_type not in ('FULL_DAY', 'PARTIAL') then raise exception 'INVALID_REQUEST_TYPE'; end if;
  if v_reason = '' then raise exception 'LEAVE_REASON_REQUIRED'; end if;
  if p_periods is null or jsonb_typeof(p_periods) <> 'array' or jsonb_array_length(p_periods) = 0 then
    raise exception 'LEAVE_PERIODS_REQUIRED';
  end if;
  if jsonb_array_length(p_periods) > 7 then raise exception 'TOO_MANY_LEAVE_PERIODS'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'INVALID_LEAVE_SLOTS'; end if;

  select t.id, t.full_name into v_teacher_id, v_teacher_name
  from public.teachers t
  where t.is_active = true
    and (
      lower(trim(t.full_name)) = lower(trim(p_teacher_name))
      or lower(trim(coalesce(t.legacy_name, ''))) = lower(trim(p_teacher_name))
    )
  order by case when lower(trim(t.full_name)) = lower(trim(p_teacher_name)) then 0 else 1 end, t.id
  limit 1;

  if v_teacher_id is null then raise exception 'TEACHER_NOT_FOUND'; end if;

  -- Validate the period layer before writing anything.
  for v_period_row in select value from jsonb_array_elements(p_periods)
  loop
    v_period := nullif(trim(coalesce(v_period_row->>'period', '')), '')::smallint;
    v_period_type := upper(trim(coalesce(v_period_row->>'period_type', '')));

    if v_period is null or v_period < 0 or v_period > 6 then raise exception 'INVALID_LEAVE_PERIOD'; end if;
    if v_period = any(v_seen_periods) then raise exception 'DUPLICATE_LEAVE_PERIOD'; end if;
    v_seen_periods := array_append(v_seen_periods, v_period);

    if v_period_type not in ('TEACHING', 'FREE') then raise exception 'INVALID_LEAVE_PERIOD_TYPE'; end if;
    if not public.ejadwal_school_period_active(p_schedule_date, v_period) then
      raise exception 'SCHOOL_PERIOD_NOT_ACTIVE: JP %', v_period;
    end if;

    if v_period_type = 'FREE' then
      if public.ejadwal_teacher_has_active_teaching_at_period(v_teacher_id, p_schedule_date, v_period) then
        raise exception 'FREE_PERIOD_HAS_TEACHING: JP %', v_period;
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_slots) s
        where nullif(trim(coalesce(s->>'period', '')), '')::smallint = v_period
      ) then
        raise exception 'FREE_PERIOD_HAS_COVERAGE_SLOT: JP %', v_period;
      end if;
      v_free_count := v_free_count + 1;
    else
      if not public.ejadwal_teacher_has_active_teaching_at_period(v_teacher_id, p_schedule_date, v_period) then
        raise exception 'TEACHING_PERIOD_HAS_NO_ACTIVE_TEACHING: JP %', v_period;
      end if;
      if not exists (
        select 1 from jsonb_array_elements(p_slots) s
        where nullif(trim(coalesce(s->>'period', '')), '')::smallint = v_period
      ) then
        raise exception 'TEACHING_PERIOD_HAS_NO_SLOT: JP %', v_period;
      end if;
      v_teaching_period_count := v_teaching_period_count + 1;
    end if;

    v_period_count := v_period_count + 1;
  end loop;

  -- Every teaching slot must belong to a selected TEACHING period.
  if exists (
    select 1
    from jsonb_array_elements(p_slots) s
    where not exists (
      select 1 from jsonb_array_elements(p_periods) p
      where nullif(trim(coalesce(p->>'period', '')), '')::smallint = nullif(trim(coalesce(s->>'period', '')), '')::smallint
        and upper(trim(coalesce(p->>'period_type', ''))) = 'TEACHING'
    )
  ) then
    raise exception 'COVERAGE_SLOT_WITHOUT_TEACHING_PERIOD';
  end if;

  v_teaching_slot_count := jsonb_array_length(p_slots);

  if v_teaching_slot_count > 0 then
    -- V3.12 RPC remains the single source of truth for class/schedule/calendar
    -- validation and creation of leave_request_slots.
    v_base_result := public.ejadwal_submit_public_leave_request(
      p_teacher_name,
      p_schedule_date,
      p_request_type,
      p_reason,
      p_detail,
      p_slots
    );
    v_request_id := (v_base_result->>'request_id')::uuid;
    v_request_code := v_base_result->>'request_code';
  else
    -- A valid absence may consist exclusively of FREE periods, so no coverage
    -- class exists. Create the request directly after the period validation.
    if exists (
      select 1 from public.leave_requests lr
      where lr.teacher_id = v_teacher_id
        and p_schedule_date between lr.date_start and lr.date_end
        and lr.status in ('SUBMITTED', 'APPROVED')
    ) then
      raise exception 'DUPLICATE_ACTIVE_LEAVE_REQUEST';
    end if;

    loop
      v_request_code := 'IZN-' || to_char(p_schedule_date, 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      exit when not exists (select 1 from public.leave_requests lr where lr.request_code = v_request_code);
    end loop;

    insert into public.leave_requests (
      teacher_id, date_start, date_end, reason, detail, status, submitted_by,
      request_code, request_type, source
    ) values (
      v_teacher_id, p_schedule_date, p_schedule_date, v_reason, v_detail,
      'SUBMITTED', null, v_request_code, v_request_type, 'PUBLIC_FORM'
    ) returning id into v_request_id;
  end if;

  for v_period_row in select value from jsonb_array_elements(p_periods)
  loop
    insert into public.leave_request_periods (
      leave_request_id,
      schedule_date,
      period,
      period_type
    ) values (
      v_request_id,
      p_schedule_date,
      (v_period_row->>'period')::smallint,
      upper(trim(v_period_row->>'period_type'))
    );
  end loop;

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id
  ) values (
    null,
    'LEAVE_PERIODS_RECORDED',
    'leave_request',
    v_request_id::text,
    null,
    jsonb_build_object(
      'request_code', v_request_code,
      'teacher_id', v_teacher_id,
      'teacher_name', v_teacher_name,
      'schedule_date', p_schedule_date,
      'period_count', v_period_count,
      'teaching_period_count', v_teaching_period_count,
      'teaching_slot_count', v_teaching_slot_count,
      'free_period_count', v_free_count
    ),
    v_audit_request_id
  );

  return jsonb_build_object(
    'request_id', v_request_id,
    'request_code', v_request_code,
    'status', 'SUBMITTED',
    'slot_count', v_period_count,
    'period_count', v_period_count,
    'teaching_slot_count', v_teaching_slot_count,
    'free_period_count', v_free_count
  );
end;
$$;

revoke all on function public.ejadwal_submit_public_leave_request_v2(text,date,text,text,text,jsonb,jsonb) from public;
grant execute on function public.ejadwal_submit_public_leave_request_v2(text,date,text,text,text,jsonb,jsonb) to anon, authenticated;

create table if not exists public.schedule_teacher_aliases (
  id bigint generated by default as identity primary key,
  alias text not null,
  alias_key text not null unique,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_file text not null,
  source_sheet text not null default 'ori',
  import_mode text not null check (import_mode in ('REPLACE_ACTIVE', 'MERGE')),
  row_count integer not null default 0,
  deactivated_count integer not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.schedule_teacher_aliases enable row level security;
alter table public.schedule_import_batches enable row level security;

grant select on public.schedule_teacher_aliases to authenticated;
grant select on public.schedule_import_batches to authenticated;
grant usage, select on sequence public.schedule_teacher_aliases_id_seq to authenticated;

-- Read aliases for importer preview. Only ADMIN can mutate aliases/import batches.
drop policy if exists schedule_teacher_aliases_authenticated_select on public.schedule_teacher_aliases;
create policy schedule_teacher_aliases_authenticated_select
on public.schedule_teacher_aliases for select to authenticated
using (true);

drop policy if exists schedule_teacher_aliases_admin_write on public.schedule_teacher_aliases;
create policy schedule_teacher_aliases_admin_write
on public.schedule_teacher_aliases for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

drop policy if exists schedule_import_batches_staff_select on public.schedule_import_batches;
create policy schedule_import_batches_staff_select
on public.schedule_import_batches for select to authenticated
using (public.current_user_is_staff());

drop policy if exists schedule_import_batches_admin_write on public.schedule_import_batches;
create policy schedule_import_batches_admin_write
on public.schedule_import_batches for all to authenticated
using (public.current_user_has_role('ADMIN'))
with check (public.current_user_has_role('ADMIN'));

create or replace function public.ejadwal_schedule_alias_key(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$$;

revoke all on function public.ejadwal_schedule_alias_key(text) from public;
grant execute on function public.ejadwal_schedule_alias_key(text) to authenticated;

create or replace function public.ejadwal_upsert_schedule_teacher_alias(
  p_alias text,
  p_teacher_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_alias text := trim(coalesce(p_alias, ''));
  v_key text;
begin
  if auth.uid() is null or not public.current_user_has_role('ADMIN') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_alias = '' then raise exception 'ALIAS_REQUIRED'; end if;
  if not exists(select 1 from public.teachers where id = p_teacher_id) then
    raise exception 'TEACHER_NOT_FOUND';
  end if;
  v_key := public.ejadwal_schedule_alias_key(v_alias);

  insert into public.schedule_teacher_aliases(alias, alias_key, teacher_id, created_by)
  values (v_alias, v_key, p_teacher_id, auth.uid())
  on conflict (alias_key) do update
    set alias = excluded.alias,
        teacher_id = excluded.teacher_id,
        updated_at = now();
end;
$$;

revoke all on function public.ejadwal_upsert_schedule_teacher_alias(text, uuid) from public;
grant execute on function public.ejadwal_upsert_schedule_teacher_alias(text, uuid) to authenticated;

create or replace function public.ejadwal_publish_schedule_import_v1(
  p_rows jsonb,
  p_source_file text,
  p_source_sheet text default 'ori',
  p_mode text default 'REPLACE_ACTIVE'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_mode text := upper(trim(coalesce(p_mode, 'REPLACE_ACTIVE')));
  v_batch_id uuid;
  v_row jsonb;
  v_schedule_id uuid;
  v_class_id uuid;
  v_day smallint;
  v_period smallint;
  v_start time;
  v_end time;
  v_subject text;
  v_room_id text;
  v_old_subject text;
  v_old_special_note text;
  v_old_other_supervise boolean := false;
  v_old_class_mode text;
  v_special_note text;
  v_other_supervise boolean := false;
  v_class_mode text;
  v_combined boolean;
  v_teacher_ids jsonb;
  v_teacher_names jsonb;
  v_teacher_id uuid;
  v_teacher_name text;
  v_position integer;
  v_inserted integer := 0;
  v_deactivated integer := 0;
  v_affected integer := 0;
begin
  if v_actor is null or not public.current_user_has_role('ADMIN') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if v_mode not in ('REPLACE_ACTIVE', 'MERGE') then
    raise exception 'INVALID_IMPORT_MODE';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'IMPORT_ROWS_REQUIRED';
  end if;

  insert into public.schedule_import_batches(source_file, source_sheet, import_mode, row_count, created_by)
  values (
    coalesce(nullif(trim(p_source_file), ''), 'unnamed.xlsx'),
    coalesce(nullif(trim(p_source_sheet), ''), 'ori'),
    v_mode,
    jsonb_array_length(p_rows),
    v_actor
  ) returning id into v_batch_id;

  if v_mode = 'REPLACE_ACTIVE' then
    update public.schedule_master
    set is_active = false,
        deleted_at = now(),
        deleted_by = v_actor,
        updated_at = now()
    where is_active = true and deleted_at is null and period between 1 and 6;
    get diagnostics v_deactivated = row_count;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_class_id := nullif(v_row->>'class_id', '')::uuid;
    v_day := (v_row->>'day_of_week')::smallint;
    v_period := (v_row->>'period')::smallint;
    v_start := nullif(v_row->>'start_time', '')::time;
    v_end := nullif(v_row->>'end_time', '')::time;
    v_subject := trim(coalesce(v_row->>'subject', ''));
    v_room_id := nullif(trim(coalesce(v_row->>'room_id', '')), '');
    v_combined := coalesce((v_row->>'is_combined')::boolean, false);
    v_teacher_ids := coalesce(v_row->'teacher_ids', '[]'::jsonb);
    v_teacher_names := coalesce(v_row->'teacher_names', '[]'::jsonb);

    if v_class_id is null or not exists(select 1 from public.classes where id = v_class_id and is_active = true) then
      raise exception 'IMPORT_CLASS_NOT_FOUND:%', coalesce(v_row->>'source_cell', '?');
    end if;
    if v_day < 1 or v_day > 7 or v_period < 0 or v_period > 6 then
      raise exception 'IMPORT_INVALID_SLOT:%', coalesce(v_row->>'source_cell', '?');
    end if;
    if v_subject = '' then raise exception 'IMPORT_SUBJECT_REQUIRED:%', coalesce(v_row->>'source_cell', '?'); end if;
    if jsonb_array_length(v_teacher_ids) <> jsonb_array_length(v_teacher_names) then
      raise exception 'IMPORT_TEACHER_PAYLOAD_MISMATCH:%', coalesce(v_row->>'source_cell', '?');
    end if;
    if jsonb_array_length(v_teacher_ids) > 6 then
      raise exception 'IMPORT_TOO_MANY_TEACHERS:%', coalesce(v_row->>'source_cell', '?');
    end if;

    -- `ori` carries academic assignments but not every operational metadata
    -- field. Carry forward the most recent matching slot where safe. Room is
    -- independent from subject, while special semantics are preserved only
    -- when the subject itself is unchanged.
    v_old_subject := null;
    v_old_special_note := null;
    v_old_other_supervise := false;
    v_old_class_mode := null;
    select sm.subject, sm.special_note, sm.other_teachers_supervise, sm.class_mode
      into v_old_subject, v_old_special_note, v_old_other_supervise, v_old_class_mode
    from public.schedule_master sm
    where sm.class_id = v_class_id
      and sm.day_of_week = v_day
      and sm.period = v_period
    order by sm.is_active desc, sm.updated_at desc, sm.created_at desc
    limit 1;

    if v_room_id is null then
      select sm.room_id into v_room_id
      from public.schedule_master sm
      where sm.class_id = v_class_id
        and sm.day_of_week = v_day
        and sm.period = v_period
        and sm.room_id is not null
      order by sm.is_active desc, sm.updated_at desc, sm.created_at desc
      limit 1;
    end if;

    v_special_note := null;
    v_other_supervise := false;
    v_class_mode := case when v_combined then 'COMBINED' else 'NORMAL' end;
    if lower(trim(coalesce(v_old_subject, ''))) = lower(trim(v_subject)) then
      v_special_note := v_old_special_note;
      v_other_supervise := coalesce(v_old_other_supervise, false);
      if not v_combined and v_old_class_mode = 'ALTERNATING' then
        v_class_mode := 'ALTERNATING';
      end if;
    end if;
    if v_special_note is null and (upper(v_subject) like '%NATIVE%' or upper(v_subject) like '%TAHSIN SYAIKH%') then
      v_special_note := 'Native';
    end if;

    if v_mode = 'MERGE' then
      update public.schedule_master
      set is_active = false,
          deleted_at = now(),
          deleted_by = v_actor,
          updated_at = now()
      where class_id = v_class_id
        and day_of_week = v_day
        and period = v_period
        and is_active = true
        and deleted_at is null;
      get diagnostics v_affected = row_count;
      v_deactivated := v_deactivated + v_affected;
    end if;

    insert into public.schedule_master(
      class_id, day_of_week, period, start_time, end_time, subject, room_id,
      is_combined, class_mode, other_teachers_supervise, is_active, legacy_row_id, special_note
    ) values (
      v_class_id, v_day, v_period, v_start, v_end, v_subject, v_room_id,
      v_combined, v_class_mode, v_other_supervise,
      true,
      'IMPORT:' || v_batch_id::text || ':' || coalesce(v_row->>'source_cell', v_inserted::text),
      v_special_note
    ) returning id into v_schedule_id;

    v_position := 0;
    for v_teacher_id, v_teacher_name in
      select
        nullif(ids.value, '')::uuid,
        coalesce(names.value, '')
      from jsonb_array_elements_text(v_teacher_ids) with ordinality ids(value, ord)
      join jsonb_array_elements_text(v_teacher_names) with ordinality names(value, ord)
        using (ord)
    loop
      v_position := v_position + 1;
      if v_teacher_id is null or not exists(select 1 from public.teachers where id = v_teacher_id and is_active = true) then
        raise exception 'IMPORT_TEACHER_NOT_FOUND:%:%', coalesce(v_row->>'source_cell', '?'), v_teacher_name;
      end if;
      insert into public.schedule_master_teachers(schedule_id, position, teacher_id, teacher_name_snapshot)
      values (v_schedule_id, v_position, v_teacher_id, v_teacher_name);
    end loop;

    v_inserted := v_inserted + 1;
  end loop;

  update public.schedule_import_batches
  set deactivated_count = v_deactivated
  where id = v_batch_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor,
    'SCHEDULE_IMPORT_PUBLISH',
    'SCHEDULE_IMPORT_BATCH',
    v_batch_id::text,
    null,
    jsonb_build_object(
      'source_file', p_source_file,
      'source_sheet', p_source_sheet,
      'mode', v_mode,
      'inserted', v_inserted,
      'deactivated', v_deactivated
    )
  );

  return jsonb_build_object('batch_id', v_batch_id, 'inserted', v_inserted, 'deactivated', v_deactivated);
end;
$$;

revoke all on function public.ejadwal_publish_schedule_import_v1(jsonb, text, text, text) from public;
grant execute on function public.ejadwal_publish_schedule_import_v1(jsonb, text, text, text) to authenticated;

create or replace function public.ejadwal_update_schedule_master_v1(
  p_schedule_ids uuid[],
  p_class_id uuid,
  p_day_of_week smallint,
  p_period smallint,
  p_start_time time,
  p_end_time time,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_teacher_ids uuid[],
  p_teacher_names text[],
  p_special_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_class_id uuid;
  v_teacher_id uuid;
  v_position integer;
  v_before jsonb;
  v_subject text := trim(coalesce(p_subject, ''));
begin
  if v_actor is null or not public.current_user_has_role('ADMIN') then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_schedule_ids is null or array_length(p_schedule_ids, 1) is null then raise exception 'SCHEDULE_IDS_REQUIRED'; end if;
  if p_class_id is not null and array_length(p_schedule_ids, 1) <> 1 then raise exception 'CLASS_CHANGE_REQUIRES_SINGLE_SCHEDULE'; end if;
  if p_class_id is not null and not exists(select 1 from public.classes where id = p_class_id and is_active = true) then raise exception 'CLASS_NOT_FOUND'; end if;
  if p_day_of_week < 1 or p_day_of_week > 7 or p_period < 0 or p_period > 6 then raise exception 'INVALID_SLOT'; end if;
  if v_subject = '' then raise exception 'SUBJECT_REQUIRED'; end if;
  if coalesce(array_length(p_teacher_ids, 1), 0) <> coalesce(array_length(p_teacher_names, 1), 0) then raise exception 'TEACHER_PAYLOAD_MISMATCH'; end if;
  if coalesce(array_length(p_teacher_ids, 1), 0) > 6 then raise exception 'TOO_MANY_TEACHERS'; end if;

  select jsonb_agg(to_jsonb(sm)) into v_before
  from public.schedule_master sm
  where sm.id = any(p_schedule_ids);

  foreach v_id in array p_schedule_ids
  loop
    select coalesce(p_class_id, class_id) into v_class_id
    from public.schedule_master
    where id = v_id and is_active = true and deleted_at is null;
    if v_class_id is null then raise exception 'SCHEDULE_NOT_FOUND:%', v_id; end if;

    if exists (
      select 1 from public.schedule_master other
      where other.class_id = v_class_id
        and other.day_of_week = p_day_of_week
        and other.period = p_period
        and other.is_active = true
        and other.deleted_at is null
        and not (other.id = any(p_schedule_ids))
    ) then
      raise exception 'CLASS_SLOT_CONFLICT:%', v_id;
    end if;
  end loop;

  -- A teacher cannot be moved into an occupied slot unless every existing
  -- assignment causing that occupancy is part of this same edited session.
  if exists (
    select 1
    from unnest(coalesce(p_teacher_ids, '{}'::uuid[])) teacher_id
    join public.schedule_master_teachers smt on smt.teacher_id = teacher_id
    join public.schedule_master sm on sm.id = smt.schedule_id
    where sm.day_of_week = p_day_of_week
      and sm.period = p_period
      and sm.is_active = true
      and sm.deleted_at is null
      and not (sm.id = any(p_schedule_ids))
  ) then
    raise exception 'TEACHER_SLOT_CONFLICT';
  end if;

  if p_room_id is not null and exists (
    select 1 from public.schedule_master sm
    where sm.room_id = p_room_id
      and sm.day_of_week = p_day_of_week
      and sm.period = p_period
      and sm.is_active = true
      and sm.deleted_at is null
      and not (sm.id = any(p_schedule_ids))
  ) then
    raise exception 'ROOM_SLOT_CONFLICT';
  end if;

  update public.schedule_master
  set class_id = case when p_class_id is not null and array_length(p_schedule_ids, 1) = 1 then p_class_id else class_id end,
      day_of_week = p_day_of_week,
      period = p_period,
      start_time = p_start_time,
      end_time = p_end_time,
      subject = v_subject,
      room_id = nullif(trim(coalesce(p_room_id, '')), ''),
      is_combined = coalesce(p_is_combined, false),
      class_mode = case when coalesce(p_is_combined, false) then 'COMBINED' else 'NORMAL' end,
      special_note = nullif(trim(coalesce(p_special_note, '')), ''),
      updated_at = now()
  where id = any(p_schedule_ids)
    and is_active = true
    and deleted_at is null;

  foreach v_id in array p_schedule_ids
  loop
    delete from public.schedule_master_teachers where schedule_id = v_id;
    if coalesce(array_length(p_teacher_ids, 1), 0) > 0 then
      for v_position in 1..array_length(p_teacher_ids, 1)
      loop
        v_teacher_id := p_teacher_ids[v_position];
        if v_teacher_id is null or not exists(select 1 from public.teachers where id = v_teacher_id and is_active = true) then
          raise exception 'TEACHER_NOT_FOUND:%', v_position;
        end if;
        insert into public.schedule_master_teachers(schedule_id, position, teacher_id, teacher_name_snapshot)
        values (v_id, v_position, v_teacher_id, coalesce(p_teacher_names[v_position], ''));
      end loop;
    end if;
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor,
    'SCHEDULE_MASTER_QUICK_EDIT',
    'SCHEDULE_MASTER_SESSION',
    array_to_string(p_schedule_ids, ','),
    v_before,
    jsonb_build_object(
      'schedule_ids', p_schedule_ids,
      'class_id', p_class_id,
      'day_of_week', p_day_of_week,
      'period', p_period,
      'start_time', p_start_time,
      'end_time', p_end_time,
      'subject', v_subject,
      'room_id', p_room_id,
      'is_combined', p_is_combined,
      'teacher_ids', p_teacher_ids,
      'teacher_names', p_teacher_names
    )
  );
end;
$$;

revoke all on function public.ejadwal_update_schedule_master_v1(uuid[], uuid, smallint, smallint, time, time, text, text, boolean, uuid[], text[], text) from public;
grant execute on function public.ejadwal_update_schedule_master_v1(uuid[], uuid, smallint, smallint, time, time, text, text, boolean, uuid[], text[], text) to authenticated;

commit;
