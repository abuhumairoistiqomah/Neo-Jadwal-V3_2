-- E-JADWAL V3.20 RC1.5
-- Copy *dated incidental lesson content* from one class to several classes,
-- with all targets committed or rolled back together. The weekly master is
-- never mutated; an existing target's teachers and room are never replaced.
-- JP without a target master must explicitly opt in to copy source teachers.
-- Run after RC1.4 migration, in staging first.

create or replace function public.ejadwal_copy_incidental_lessons_v320_rc15(
  p_schedule_date date,
  p_source_class_id uuid,
  p_periods integer[],
  p_target_class_ids uuid[],
  p_overwrite_existing boolean default false,
  p_copy_team_to_empty boolean default false,
  p_copy_times boolean default true
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := gen_random_uuid();
  v_day smallint;
  v_period integer;
  v_target_id uuid;
  v_source public.schedule_incidentals%rowtype;
  v_dest public.schedule_incidentals%rowtype;
  v_dest_id uuid;
  v_source_name text;
  v_target_name text;
  v_has_master boolean;
  v_before jsonb;
  v_after jsonb;
  v_count integer := 0;
  v_team_count integer;
  v_source_master_id uuid;
begin
  if v_actor is null or not public.current_user_is_staff() or not exists (
    select 1 from public.user_roles where user_id = v_actor and role in ('ADMIN', 'WAKASEK')
  ) then raise exception 'ADMIN_OR_WAKASEK_REQUIRED'; end if;
  if p_schedule_date is null or p_source_class_id is null then
    raise exception 'COPY_SOURCE_REQUIRED';
  end if;
  if coalesce(cardinality(p_periods), 0) = 0 or coalesce(cardinality(p_periods), 0) > 6
    or coalesce(cardinality(p_target_class_ids), 0) = 0
    or coalesce(cardinality(p_target_class_ids), 0) > 30 then
    raise exception 'COPY_PERIODS_AND_TARGETS_REQUIRED';
  end if;
  if coalesce(cardinality(p_periods),0) <> (select count(distinct x) from unnest(p_periods) x)
    or coalesce(cardinality(p_target_class_ids),0) <> (select count(distinct x) from unnest(p_target_class_ids) x) then
    raise exception 'COPY_DUPLICATE_JP_OR_CLASS';
  end if;
  if exists(select 1 from unnest(p_periods) x where x is null or x < 1 or x > 6) then
    raise exception 'COPY_JP_1_TO_6_ONLY';
  end if;
  if p_source_class_id = any(p_target_class_ids) then raise exception 'COPY_SOURCE_IS_TARGET'; end if;
  select display_name into v_source_name from public.classes
   where id = p_source_class_id and is_active = true;
  if v_source_name is null then raise exception 'COPY_SOURCE_CLASS_INACTIVE_OR_MISSING'; end if;
  if exists (
    select 1 from unnest(p_target_class_ids) target_id
    left join public.classes c on c.id = target_id and c.is_active = true
    where c.id is null
  ) then raise exception 'COPY_TARGET_CLASS_INACTIVE_OR_MISSING'; end if;

  v_day := extract(isodow from p_schedule_date)::smallint;
  -- One common lock key with the dated incidental editor and room mutators.
  -- Lock sorted JP numbers so parallel copy requests cannot deadlock each other.
  for v_period in select distinct x from unnest(p_periods) x order by x loop
    perform pg_advisory_xact_lock(hashtext(p_schedule_date::text || ':' || v_period::text));
  end loop;

  -- Each input is validated inside the same transaction before and during writes.
  for v_period in select distinct x from unnest(p_periods) x order by x loop
    select * into v_source from public.schedule_incidentals si
     where si.schedule_date = p_schedule_date and si.class_id = p_source_class_id
       and si.period = v_period and si.deleted_at is null
     for update;
    if v_source.id is null or btrim(coalesce(v_source.override_subject, '')) = '' then
      raise exception 'COPY_SOURCE_INCIDENTAL_REQUIRED: % JP%', v_source_name, v_period;
    end if;

    for v_target_id in select distinct x from unnest(p_target_class_ids) x order by x loop
      select display_name into v_target_name from public.classes where id = v_target_id;
      -- Copying a lesson on top of an active substitution would make the
      -- coverage snapshot disagree with the effective class timetable.
      if exists (
        select 1 from public.coverage_slots cs
         where cs.schedule_date = p_schedule_date and cs.class_id = v_target_id
           and cs.period = v_period and cs.deleted_at is null
           and cs.status not in ('CANCELLED')
      ) then
        raise exception 'COPY_TARGET_HAS_ACTIVE_BADAL: % JP%', v_target_name, v_period;
      end if;
      select * into v_dest from public.schedule_incidentals si
       where si.schedule_date = p_schedule_date and si.class_id = v_target_id
         and si.period = v_period and si.deleted_at is null
       for update;

      if v_dest.id is not null and not coalesce(p_overwrite_existing, false) then
        raise exception 'COPY_TARGET_ALREADY_HAS_INCIDENTAL: % JP%', v_target_name, v_period;
      end if;
      select exists (
        select 1 from public.schedule_master sm where sm.class_id = v_target_id
          and sm.day_of_week = v_day and sm.period = v_period
          and sm.is_active = true and sm.deleted_at is null
      ) into v_has_master;

      v_dest_id := null;
      if v_dest.id is not null then
        v_dest_id := v_dest.id;
        v_before := to_jsonb(v_dest);
        update public.schedule_incidentals
           set override_subject = v_source.override_subject,
               -- Keep existing time unless source explicitly has a pair.
               override_start_time = case when p_copy_times and v_source.override_start_time is not null
                    then v_source.override_start_time else override_start_time end,
               override_end_time = case when p_copy_times and v_source.override_end_time is not null
                    then v_source.override_end_time else override_end_time end,
               override_special_note = coalesce(nullif(btrim(override_special_note), ''),
                    v_source.override_special_note),
               updated_at = now()
         where id = v_dest_id returning to_jsonb(schedule_incidentals) into v_after;
        -- NO replacement of incidental teacher overrides, room, type, or reason.
      else
        if not v_has_master and not coalesce(p_copy_team_to_empty, false) then
          raise exception 'COPY_EMPTY_SLOT_REQUIRES_EXPLICIT_TEACHER_COPY: % JP%', v_target_name, v_period;
        end if;
        v_before := null;
        insert into public.schedule_incidentals (
          schedule_date, class_id, period, kind, override_subject,
          override_special_note, override_start_time, override_end_time,
          reason, incidental_type
        ) values (
          p_schedule_date, v_target_id, v_period,
          case when v_has_master then 'OVERRIDE' else 'ADDITIONAL' end,
          v_source.override_subject, v_source.override_special_note,
          case when p_copy_times then v_source.override_start_time else null end,
          case when p_copy_times then v_source.override_end_time else null end,
          'Salin jadwal insidental dari ' || v_source_name,
          'COPY_INCIDENTAL_RC15'
        ) returning id, to_jsonb(schedule_incidentals) into v_dest_id, v_after;

        -- For a target master, absence of teacher overrides means INHERIT
        -- target teachers. For an empty target, explicitly duplicate source
        -- team (if operator checked the box) but NEVER source room.
        if not v_has_master then
          if exists (
            select 1 from public.schedule_incidental_teacher_overrides ito
            where ito.incidental_id = v_source.id and ito.action = 'CLEAR'
          ) then raise exception 'COPY_SOURCE_TEAM_CLEAR_NOT_SUPPORTED'; end if;
          insert into public.schedule_incidental_teacher_overrides (
            incidental_id, position, action, teacher_id, teacher_name_snapshot
          )
          select v_dest_id, ito.position, 'SET', ito.teacher_id,
                 coalesce(ito.teacher_name_snapshot, '')
            from public.schedule_incidental_teacher_overrides ito
           where ito.incidental_id = v_source.id and ito.action = 'SET'
           order by ito.position;
          get diagnostics v_team_count = row_count;
          if v_team_count = 0 then
            select sm.id into v_source_master_id from public.schedule_master sm
             where sm.class_id = p_source_class_id and sm.day_of_week = v_day
               and sm.period = v_period and sm.is_active = true and sm.deleted_at is null
             order by sm.updated_at desc limit 1;
            if v_source_master_id is not null then
              insert into public.schedule_incidental_teacher_overrides (
                incidental_id, position, action, teacher_id, teacher_name_snapshot
              )
              select v_dest_id, smt.position, 'SET', smt.teacher_id,
                     smt.teacher_name_snapshot
                from public.schedule_master_teachers smt
               where smt.schedule_id = v_source_master_id
                 and (smt.teacher_id is not null or btrim(smt.teacher_name_snapshot) <> '')
               order by smt.position;
              get diagnostics v_team_count = row_count;
            end if;
          end if;
          if v_team_count = 0 then raise exception 'COPY_SOURCE_TEACHER_TEAM_MISSING: % JP%', v_source_name, v_period; end if;
        end if;
      end if;

      insert into public.audit_logs (
        actor_user_id, action, entity_type, entity_id,
        before_data, after_data, request_id
      ) values (
        v_actor, 'COPY_INCIDENTAL_LESSON_RC15', 'schedule_incidental', v_dest_id::text,
        v_before,
        v_after || jsonb_build_object('copy_from_class_id', p_source_class_id,
          'copy_from_incidental_id', v_source.id, 'copied_period', v_period,
          'copied_team_into_empty_slot', not v_has_master and v_before is null,
          'source_room_not_copied', true),
        v_request_id
      );
      v_count := v_count + 1;
    end loop;
  end loop;
  return jsonb_build_object('copied', v_count, 'request_id', v_request_id);
end;
$$;

revoke all on function public.ejadwal_copy_incidental_lessons_v320_rc15(date,uuid,integer[],uuid[],boolean,boolean,boolean) from public;
grant execute on function public.ejadwal_copy_incidental_lessons_v320_rc15(date,uuid,integer[],uuid[],boolean,boolean,boolean) to authenticated;
