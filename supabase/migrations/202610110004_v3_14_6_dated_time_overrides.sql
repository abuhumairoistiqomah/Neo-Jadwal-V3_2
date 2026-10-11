-- V3.14.6 RC3.4: One-date time adjustments for dated incidentals / Quick Edit.
-- Apply AFTER 202610110003_v3_14_6_incidental_conflicts_nonblocking.sql.
-- Never changes schedule_master.start_time/end_time.
-- Existing rows stay NULL (inherit master time or the default JP time).
begin;

alter table public.schedule_incidentals
  add column if not exists override_start_time time without time zone,
  add column if not exists override_end_time time without time zone;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.schedule_incidentals'::regclass
      and conname = 'schedule_incidentals_dated_time_pair_ck'
  ) then
    alter table public.schedule_incidentals
      add constraint schedule_incidentals_dated_time_pair_ck
      check (
        (override_start_time is null and override_end_time is null)
        or (override_start_time is not null and override_end_time is not null
            and override_start_time < override_end_time)
      );
  end if;
end $$;

-- A wrapper instead of changing the v2 signature protects the existing rotation
-- importer, room editor, and earlier versions' RPC calls.
create or replace function public.ejadwal_upsert_schedule_incidental_v3(
  p_incidental_id uuid,
  p_schedule_date date,
  p_class_id uuid,
  p_period smallint,
  p_kind text,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_class_mode text,
  p_teacher_ids uuid[],
  p_teacher_names text[],
  p_special_note text,
  p_reason text,
  p_incidental_type text,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_allow_teacher_conflict boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if (p_start_time is null) <> (p_end_time is null) then
    raise exception 'DATED_TIME_PAIR_REQUIRED';
  end if;
  if p_start_time is not null and p_start_time >= p_end_time then
    raise exception 'DATED_TIME_RANGE_INVALID';
  end if;

  -- Existing RPC performs staff authorization, teacher/room warnings, slot
  -- ownership checks and audit. Errors roll back this entire statement.
  v_id := public.ejadwal_upsert_schedule_incidental_v2(
    p_incidental_id, p_schedule_date, p_class_id, p_period,
    p_kind, p_subject, p_room_id, p_is_combined, p_class_mode,
    p_teacher_ids, p_teacher_names, p_special_note, p_reason,
    p_incidental_type, p_allow_teacher_conflict
  );

  update public.schedule_incidentals
    set override_start_time = p_start_time,
        override_end_time = p_end_time,
        updated_at = now()
  where id = v_id and deleted_at is null;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
    values (auth.uid(), 'SCHEDULE_INCIDENTAL_DATED_TIME',
      'SCHEDULE_INCIDENTAL', v_id::text,
      jsonb_build_object('schedule_date', p_schedule_date,
        'period', p_period, 'start_time', p_start_time,
        'end_time', p_end_time, 'inherit_time', p_start_time is null));
  return v_id;
end;
$$;
revoke all on function public.ejadwal_upsert_schedule_incidental_v3(uuid,date,uuid,smallint,text,text,text,boolean,text,uuid[],text[],text,text,text,time without time zone,time without time zone,boolean) from public;
grant execute on function public.ejadwal_upsert_schedule_incidental_v3(uuid,date,uuid,smallint,text,text,text,boolean,text,uuid[],text[],text,text,text,time without time zone,time without time zone,boolean) to authenticated;

create or replace function public.ejadwal_upsert_schedule_incidental_session_v3(
  p_rows jsonb,
  p_schedule_date date,
  p_kind text,
  p_subject text,
  p_room_id text,
  p_is_combined boolean,
  p_class_mode text,
  p_teacher_ids uuid[],
  p_teacher_names text[],
  p_special_note text,
  p_reason text,
  p_incidental_type text,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_allow_teacher_conflict boolean
)
returns uuid[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_result uuid[] := '{}'::uuid[];
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INCIDENTAL_SESSION_ROWS_REQUIRED';
  end if;
  for v_row in
    select * from jsonb_to_recordset(p_rows) as x(incidental_id uuid, class_id uuid, period smallint)
  loop
    v_result := array_append(v_result, public.ejadwal_upsert_schedule_incidental_v3(
      v_row.incidental_id, p_schedule_date, v_row.class_id, v_row.period,
      p_kind, p_subject, p_room_id, p_is_combined, p_class_mode,
      p_teacher_ids, p_teacher_names, p_special_note, p_reason,
      p_incidental_type, p_start_time, p_end_time, p_allow_teacher_conflict
    ));
  end loop;
  return v_result;
end;
$$;
revoke all on function public.ejadwal_upsert_schedule_incidental_session_v3(jsonb,date,text,text,text,boolean,text,uuid[],text[],text,text,text,time without time zone,time without time zone,boolean) from public;
grant execute on function public.ejadwal_upsert_schedule_incidental_session_v3(jsonb,date,text,text,text,boolean,text,uuid[],text[],text,text,text,time without time zone,time without time zone,boolean) to authenticated;

commit;
