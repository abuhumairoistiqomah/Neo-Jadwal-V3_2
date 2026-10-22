-- E-JADWAL V3.20 RC1.3: atomic subject override at the time of an admin badal assignment.
-- Depends on ejadwal_save_inval_bundle_v319_rc42(jsonb,jsonb,text).
-- No schema columns or master rows are changed.
-- The original_subject marker is supplied ONLY when the operator deliberately
-- changes the lesson subject. Existing dated incidental fields are inherited.

create or replace function public.ejadwal_save_inval_bundle_v320_rc13(
  p_rows jsonb,
  p_room_incidental jsonb default null,
  p_override_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_result jsonb;
  v_date date;
  v_period smallint;
  v_class_code text;
  v_class_id uuid;
  v_absent_id uuid;
  v_original text;
  v_desired text;
  v_current text;
  v_master_subject text;
  v_inc_id uuid;
  v_inc_subject text;
  v_inc_before jsonb;
  v_inc_after jsonb;
  v_coverage_id uuid;
  v_cover_before jsonb;
  v_cover_after jsonb;
  v_request_id uuid;
begin
  if v_actor is null or not public.current_user_is_staff()
     or not exists (select 1 from public.user_roles
                    where user_id = v_actor and role in ('ADMIN','WAKASEK')) then
    raise exception 'ADMIN_OR_WAKASEK_REQUIRED';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'INVAL_ROWS_REQUIRED';
  end if;

  -- Validate before writing any coverage. Errors in this function roll back
  -- BOTH the delegated badal save and the dated incidental mutation.
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if v_row ? 'original_subject' then
      v_original := btrim(coalesce(v_row->>'original_subject',''));
      v_desired := btrim(coalesce(v_row->>'subject',''));
      v_period := nullif(btrim(coalesce(v_row->>'period','')), '')::smallint;
      if v_original = '' or v_desired = '' or length(v_desired) > 120 or length(v_original) > 120 then
        raise exception 'BADAL_SUBJECT_INVALID';
      end if;
      if v_period is null or v_period < 1 or v_period > 6 then
        raise exception 'BADAL_SUBJECT_ONLY_JP1_TO_JP6';
      end if;
    end if;
  end loop;

  -- Reuse all existing constraints, teacher auth, tasks and NO_SUBSTITUTE
  -- behavior. We do not fork the existing badal write implementation.
  v_result := public.ejadwal_save_inval_bundle_v319_rc42(
    p_rows, p_room_incidental, p_override_note
  );
  v_request_id := nullif(v_result->>'request_id','')::uuid;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if not (v_row ? 'original_subject') then continue; end if;
    v_original := btrim(v_row->>'original_subject');
    v_desired := btrim(v_row->>'subject');
    if v_original = v_desired then continue; end if;

    v_date := (v_row->>'schedule_date')::date;
    v_period := (v_row->>'period')::smallint;
    v_class_code := btrim(v_row->>'class_code');
    v_absent_id := (v_row->>'absent_teacher_id')::uuid;

    v_class_id := null;
    select c.id into v_class_id from public.classes c
      where c.is_active = true and
        (lower(c.code) = lower(v_class_code) or lower(c.display_name) = lower(v_class_code))
      order by case when lower(c.code) = lower(v_class_code) then 0 else 1 end, c.id
      limit 1;
    if v_class_id is null then raise exception 'BADAL_SUBJECT_CLASS_NOT_FOUND'; end if;

    -- Coordinate concurrent calls to this version of the subject writer.
    perform pg_advisory_xact_lock(hashtextextended(
      v_date::text || '|' || v_class_id::text || '|' || v_period::text, 32013));

    v_master_subject := null;
    select sm.subject into v_master_subject from public.schedule_master sm
      where sm.class_id = v_class_id
        and sm.day_of_week = extract(isodow from v_date)::smallint
        and sm.period = v_period and sm.is_active = true and sm.deleted_at is null
      order by sm.id limit 1;

    v_inc_id := null; v_inc_subject := null;
    select si.id, si.override_subject into v_inc_id, v_inc_subject
      from public.schedule_incidentals si
      where si.schedule_date = v_date and si.class_id = v_class_id
        and si.period = v_period and si.deleted_at is null
      order by si.updated_at desc, si.id desc limit 1 for update;

    v_current := coalesce(nullif(btrim(v_inc_subject),''), nullif(btrim(v_master_subject),''));
    if v_current is null then
      raise exception 'BADAL_SUBJECT_NO_EFFECTIVE_SCHEDULE for %, JP%, %', v_date, v_period, v_class_code;
    end if;
    if lower(v_current) <> lower(v_original) then
      raise exception 'BADAL_SUBJECT_STALE_REFRESH_REQUIRED for %, JP%, % (expected %, found %)',
        v_date, v_period, v_class_code, v_original, v_current;
    end if;

    v_inc_before := null;
    if v_inc_id is not null then
      select to_jsonb(si) into v_inc_before from public.schedule_incidentals si where si.id = v_inc_id;
      update public.schedule_incidentals
        set override_subject = v_desired, updated_at = now()
        where id = v_inc_id returning to_jsonb(schedule_incidentals) into v_inc_after;
    else
      insert into public.schedule_incidentals (
        schedule_date,class_id,period,kind,override_subject,reason,incidental_type
      ) values (
        v_date,v_class_id,v_period,'OVERRIDE',v_desired,
        'Perubahan mata pelajaran saat penempatan badal','BADAL_SUBJECT_OVERRIDE'
      ) returning id, to_jsonb(schedule_incidentals) into v_inc_id, v_inc_after;
    end if;

    insert into public.audit_logs (
      actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id
    ) values (
      v_actor,'BADAL_SUBJECT_OVERRIDE', 'schedule_incidental',v_inc_id::text,
      v_inc_before,v_inc_after,v_request_id
    );

    -- For NO_SUBSTITUTE as well as ASSIGNED, keep the coverage log's subject
    -- in sync. Do not touch historical LEGACY_IMPORT or unrelated absences.
    v_coverage_id := null;
    select cs.id into v_coverage_id from public.coverage_slots cs
      where cs.schedule_date = v_date and cs.class_id = v_class_id
        and cs.period = v_period and cs.absent_teacher_id = v_absent_id
        and cs.deleted_at is null and cs.status in ('ASSIGNED','NO_SUBSTITUTE')
        and cs.source <> 'LEGACY_IMPORT'
      order by cs.updated_at desc, cs.id desc limit 1 for update;
    if v_coverage_id is null then raise exception 'BADAL_SUBJECT_COVERAGE_NOT_FOUND'; end if;
    select to_jsonb(cs) into v_cover_before from public.coverage_slots cs where id = v_coverage_id;
    update public.coverage_slots
      set subject_snapshot = v_desired, schedule_incidental_id = v_inc_id
      where id = v_coverage_id
      returning to_jsonb(coverage_slots) into v_cover_after;
    insert into public.audit_logs (
      actor_user_id,action,entity_type,entity_id,before_data,after_data,request_id
    ) values (
      v_actor,'BADAL_COVERAGE_SUBJECT_SYNC','coverage_slot',v_coverage_id::text,
      v_cover_before,v_cover_after,v_request_id
    );
  end loop;
  return v_result;
end;
$$;

revoke all on function public.ejadwal_save_inval_bundle_v320_rc13(jsonb,jsonb,text) from public,anon;
grant execute on function public.ejadwal_save_inval_bundle_v320_rc13(jsonb,jsonb,text) to authenticated;
comment on function public.ejadwal_save_inval_bundle_v320_rc13(jsonb,jsonb,text) is
  'V3.20 RC1.3 atomic badal save with optional dated subject override; preserves master and existing incidental fields.';
