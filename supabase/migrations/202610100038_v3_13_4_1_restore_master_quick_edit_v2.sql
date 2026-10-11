begin;

-- V3.13.4.1 repair
-- Restores the V3.13.2 permanent Quick Edit RPC if an earlier database
-- migration set never created it. This is schema-only: it does not modify
-- schedule_master rows or any operational data.

create or replace function public.ejadwal_update_schedule_master_v2(
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
  p_special_note text default null,
  p_allow_teacher_conflict boolean default false
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
  v_teacher_conflicts jsonb := '[]'::jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'teacher_id', smt.teacher_id,
    'schedule_id', sm.id,
    'class_id', sm.class_id,
    'class_name', c.display_name,
    'subject', sm.subject,
    'period', sm.period,
    'day_of_week', sm.day_of_week
  )), '[]'::jsonb)
  into v_teacher_conflicts
  from unnest(coalesce(p_teacher_ids, '{}'::uuid[])) as input_teacher(teacher_id)
  join public.schedule_master_teachers smt on smt.teacher_id = input_teacher.teacher_id
  join public.schedule_master sm on sm.id = smt.schedule_id
  join public.classes c on c.id = sm.class_id
  where sm.day_of_week = p_day_of_week
    and sm.period = p_period
    and sm.is_active = true
    and sm.deleted_at is null
    and not (sm.id = any(p_schedule_ids));

  if jsonb_array_length(v_teacher_conflicts) > 0 and not coalesce(p_allow_teacher_conflict, false) then
    raise exception 'TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED';
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
      'teacher_names', p_teacher_names,
      'teacher_conflict_override', jsonb_array_length(v_teacher_conflicts) > 0,
      'teacher_conflicts', v_teacher_conflicts
    )
  );
end;
$$;

revoke all on function public.ejadwal_update_schedule_master_v2(uuid[], uuid, smallint, smallint, time without time zone, time without time zone, text, text, boolean, uuid[], text[], text, boolean) from public;
grant execute on function public.ejadwal_update_schedule_master_v2(uuid[], uuid, smallint, smallint, time without time zone, time without time zone, text, text, boolean, uuid[], text[], text, boolean) to authenticated;

commit;
