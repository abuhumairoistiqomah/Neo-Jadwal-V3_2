-- E-Jadwal V3.14.6 RC3.4.7 — Change only the substitute teacher on an existing coverage slot.
-- Keep leave identity, JP, class, task text/resources and prior audit immutable.
-- Legacy imported rows may be corrected by ADMIN with an audited manual override.
-- Requires 202610120001_v3_14_6_legacy_cancel_leave_free_amendment.sql.
begin;

alter table public.coverage_slots
  add column if not exists legacy_substitute_manual_override boolean not null default false;

-- Reimport of old Google Sheets data must never overwrite an intentional
-- post-import correction. Explicit reassignments preserve the flag as TRUE.
create or replace function public.ejadwal_preserve_legacy_reassigned_substitute_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.source = 'LEGACY_IMPORT'
     and old.legacy_substitute_manual_override = true
     and new.source = 'LEGACY_IMPORT'
     and coalesce(new.legacy_substitute_manual_override, false) = false then
    new.substitute_teacher_id := old.substitute_teacher_id;
    new.substitute_teacher_name_snapshot := old.substitute_teacher_name_snapshot;
    new.assigned_by := old.assigned_by;
    new.assigned_at := old.assigned_at;
    new.status := old.status;
    new.legacy_substitute_manual_override := true;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_legacy_reassigned_substitute on public.coverage_slots;
create trigger preserve_legacy_reassigned_substitute
before update on public.coverage_slots
for each row execute function public.ejadwal_preserve_legacy_reassigned_substitute_v1();

create or replace function public.ejadwal_replace_inval_substitute_v1(
  p_coverage_slot_id uuid,
  p_substitute_teacher_id uuid,
  p_constraint_ids uuid[] default '{}'::uuid[],
  p_override_note text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_request_id uuid := gen_random_uuid();
  v_before public.coverage_slots%rowtype;
  v_after public.coverage_slots%rowtype;
  v_substitute_name text;
  v_soft_ids uuid[];
  v_constraint_id uuid;
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_coverage_slot_id is null or p_substitute_teacher_id is null then
    raise exception 'COVERAGE_AND_SUBSTITUTE_REQUIRED';
  end if;

  select * into v_before from public.coverage_slots
  where id = p_coverage_slot_id and deleted_at is null
    and status not in ('CANCELLED', 'COMPLETED')
  for update;
  if v_before.id is null then raise exception 'COVERAGE_SLOT_NOT_ACTIVE'; end if;
  if v_before.source = 'LEGACY_IMPORT'
     and not public.current_user_has_role('ADMIN') then
    raise exception 'ADMIN_REQUIRED_TO_EDIT_IMPORTED_HISTORY';
  end if;
  if v_before.substitute_teacher_id = p_substitute_teacher_id then
    raise exception 'SAME_SUBSTITUTE_TEACHER';
  end if;
  if v_before.absent_teacher_id = p_substitute_teacher_id then
    raise exception 'SUBSTITUTE_CANNOT_BE_ABSENT_TEACHER';
  end if;

  select full_name into v_substitute_name
  from public.teachers where id = p_substitute_teacher_id and is_active = true;
  if v_substitute_name is null then raise exception 'SUBSTITUTE_TEACHER_NOT_FOUND_OR_INACTIVE'; end if;

  -- Server-enforced hard constraints and explicit acknowledgements for soft rules.
  v_soft_ids := public.ejadwal_validate_substitute_constraints(
    p_substitute_teacher_id, v_before.schedule_date, v_before.period,
    coalesce(p_constraint_ids, '{}'::uuid[])
  );
  if cardinality(v_soft_ids) > 0 and nullif(trim(coalesce(p_override_note, '')), '') is null then
    raise exception 'SUBSTITUTE_OVERRIDE_REASON_REQUIRED';
  end if;

  update public.coverage_slots
  set substitute_teacher_id = p_substitute_teacher_id,
      substitute_teacher_name_snapshot = v_substitute_name,
      status = 'ASSIGNED',
      assigned_by = v_actor,
      assigned_at = now(),
      legacy_substitute_manual_override = case when v_before.source = 'LEGACY_IMPORT' then true
                                               else legacy_substitute_manual_override end
  where id = v_before.id returning * into v_after;

  for v_constraint_id in select unnest(v_soft_ids) loop
    insert into public.coverage_constraint_overrides
      (coverage_slot_id, constraint_id, overridden_by, override_note)
    values (v_before.id, v_constraint_id, v_actor, trim(p_override_note))
    on conflict (coverage_slot_id, constraint_id) do update set
      overridden_by = excluded.overridden_by,
      override_note = excluded.override_note,
      created_at = now();

    insert into public.audit_logs
      (actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
    values (v_actor, 'CONSTRAINT_OVERRIDE_ACK', 'coverage_constraint_override',
      v_before.id::text || ':' || v_constraint_id::text,
      null, jsonb_build_object('constraint_id', v_constraint_id, 'override_note', p_override_note), v_request_id);
  end loop;

  insert into public.audit_logs
    (actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values (v_actor,
    case when v_before.source = 'LEGACY_IMPORT' then 'LEGACY_INVAL_SUBSTITUTE_CHANGED'
         else 'INVAL_SUBSTITUTE_CHANGED' end,
    'coverage_slot', v_before.id::text,
    jsonb_build_object('coverage_slot', to_jsonb(v_before), 'previous_teacher', v_before.substitute_teacher_name_snapshot),
    jsonb_build_object('coverage_slot', to_jsonb(v_after), 'new_teacher', v_substitute_name),
    v_request_id);

  return jsonb_build_object('coverage_slot_id', v_before.id, 'request_id', v_request_id,
    'previous_teacher', v_before.substitute_teacher_name_snapshot, 'new_teacher', v_substitute_name);
end;
$$;

revoke all on function public.ejadwal_replace_inval_substitute_v1(uuid,uuid,uuid[],text) from public;
revoke all on function public.ejadwal_replace_inval_substitute_v1(uuid,uuid,uuid[],text) from anon;
grant execute on function public.ejadwal_replace_inval_substitute_v1(uuid,uuid,uuid[],text) to authenticated;
comment on function public.ejadwal_replace_inval_substitute_v1(uuid,uuid,uuid[],text) is
  'Audited per-slot change of substitute only. Preserve task and leave, protect legacy corrections from reimport.';
commit;
