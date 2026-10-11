begin;

-- V3.13.5 — Mass Import Jadwal Syaikh
-- Publishes a preview-resolved Native/Normal rotation as date-specific OVERRIDE
-- incidentals. The batch reuses the V3.13.4 mutation RPC so all existing
-- validation/audit rules stay in one canonical path.

create or replace function public.ejadwal_publish_syaikh_rotation_v1(
  p_rows jsonb,
  p_source_file text default null,
  p_source_sheet text default null,
  p_allow_teacher_conflict boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_row record;
  v_existing_id uuid;
  v_existing_type text;
  v_result_id uuid;
  v_teacher_ids uuid[];
  v_teacher_names text[];
  v_ids uuid[] := '{}'::uuid[];
  v_published integer := 0;
  v_native integer := 0;
  v_normal integer := 0;
begin
  if v_actor is null or not public.current_user_has_role('ADMIN') then
    raise exception 'ADMIN_REQUIRED';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'SYAIKH_IMPORT_ROWS_REQUIRED';
  end if;
  if jsonb_array_length(p_rows) > 1500 then
    raise exception 'SYAIKH_IMPORT_TOO_LARGE';
  end if;

  for v_row in
    select *
    from jsonb_to_recordset(p_rows) as x(
      schedule_date date,
      class_id uuid,
      period smallint,
      subject text,
      is_combined boolean,
      teacher_ids jsonb,
      teacher_names jsonb,
      special_note text,
      reason text,
      rotation_status text,
      source_cell text,
      group_key text
    )
  loop
    if upper(trim(coalesce(v_row.rotation_status, ''))) not in ('NATIVE', 'NORMAL') then
      raise exception 'INVALID_ROTATION_STATUS:%', coalesce(v_row.rotation_status, '');
    end if;

    select si.id, si.incidental_type
      into v_existing_id, v_existing_type
    from public.schedule_incidentals si
    where si.schedule_date = v_row.schedule_date
      and si.class_id = v_row.class_id
      and si.period = v_row.period
      and si.deleted_at is null
    order by si.created_at desc
    limit 1;

    if v_existing_id is not null
       and upper(trim(coalesce(v_existing_type, ''))) <> 'SYAIKH_ROTATION' then
      raise exception 'INCIDENTAL_SLOT_OWNED_BY_OTHER_CHANGE:%:%:%', v_row.schedule_date, v_row.class_id, v_row.period;
    end if;

    select coalesce(array_agg(value::uuid), '{}'::uuid[])
      into v_teacher_ids
    from jsonb_array_elements_text(coalesce(v_row.teacher_ids, '[]'::jsonb));

    select coalesce(array_agg(value), '{}'::text[])
      into v_teacher_names
    from jsonb_array_elements_text(coalesce(v_row.teacher_names, '[]'::jsonb));

    v_result_id := public.ejadwal_upsert_schedule_incidental_v1(
      v_existing_id,
      v_row.schedule_date,
      v_row.class_id,
      v_row.period,
      'OVERRIDE',
      v_row.subject,
      null, -- inherit room from master; do not create synthetic room conflicts
      coalesce(v_row.is_combined, false),
      v_teacher_ids,
      v_teacher_names,
      v_row.special_note,
      v_row.reason,
      'SYAIKH_ROTATION',
      coalesce(p_allow_teacher_conflict, false)
    );

    v_ids := array_append(v_ids, v_result_id);
    v_published := v_published + 1;
    if upper(trim(v_row.rotation_status)) = 'NATIVE' then
      v_native := v_native + 1;
    else
      v_normal := v_normal + 1;
    end if;
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_actor,
    'SYAIKH_ROTATION_IMPORT_PUBLISH',
    'SCHEDULE_INCIDENTAL_BATCH',
    v_batch_id::text,
    null,
    jsonb_build_object(
      'source_file', nullif(trim(coalesce(p_source_file, '')), ''),
      'source_sheet', nullif(trim(coalesce(p_source_sheet, '')), ''),
      'published', v_published,
      'native_rows', v_native,
      'normal_rows', v_normal,
      'teacher_conflict_override', coalesce(p_allow_teacher_conflict, false),
      'incidental_ids', to_jsonb(v_ids)
    )
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'published', v_published,
    'native_rows', v_native,
    'normal_rows', v_normal,
    'incidental_ids', to_jsonb(v_ids)
  );
end;
$$;

revoke all on function public.ejadwal_publish_syaikh_rotation_v1(jsonb,text,text,boolean) from public;
grant execute on function public.ejadwal_publish_syaikh_rotation_v1(jsonb,text,text,boolean) to authenticated;

commit;
