-- V3.14.6 RC3.4.5 — multi-class virtual homeroom leave validation.
-- Frontend submits one JP0 attendance period and a separate coverage class
-- for each homeroom assignment. Preserve all JP1-6 validation as-is.
-- Use after 202610110052. Test on staging before production.
begin;

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
        exists (
          select 1
          from regexp_split_to_table(
            coalesce(t.notes, ''),
            '(?i)([+,;&|/\n]+|[[:space:]]+dan[[:space:]]+)'
          ) as assigned(class_label)
          where public.ejadwal_normalize_class_label(
            regexp_replace(trim(assigned.class_label), '^(wali[[:space:]]+kelas|pendamping[[:space:]]+kelas|kelas)[[:space:]]*[:=-]?[[:space:]]*', '', 'i')
          ) in (
            public.ejadwal_normalize_class_label(c.display_name),
            public.ejadwal_normalize_class_label(c.code)
          )
        )
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


-- Security grants unchanged: validation is callable only through guarded RPCs.
revoke all on function public.ejadwal_teacher_scheduled_for_leave_slot(uuid,date,uuid,smallint) from public;
revoke all on function public.ejadwal_teacher_scheduled_for_leave_slot(uuid,date,uuid,smallint) from anon;

commit;
