-- E-JADWAL V3.19 RC4.3
-- Revoking a substitute restriction must also revoke ONLY coverage created BY that
-- restriction. Physical history is retained; independent leave/badal remains untouched.
-- Apply AFTER V3.19 RC4.2, staging first. No DROP TABLE/DELETE FROM statements.
begin;

create index if not exists coverage_slots_official_duty_rule_active_lookup_v319
  on public.coverage_slots (official_duty_constraint_id, schedule_date)
  where source = 'OFFICIAL_DUTY' and deleted_at is null;

-- Defense in depth: even an older admin client directly flipping is_active
-- will no longer leave stale OFFICIAL_DUTY coverage visible in Log Badal.
create or replace function public.ejadwal_clear_disabled_constraint_coverage_v319()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_slots integer := 0;
  v_tasks integer := 0;
begin
  if new.is_active and new.deleted_at is null then return new; end if;

  update public.coverage_slots cs
  set deleted_previous_status = cs.status,
      status = 'CANCELLED',
      deleted_at = now(),
      deleted_by = auth.uid(),
      updated_at = now()
  where cs.official_duty_constraint_id = new.id
    and cs.source = 'OFFICIAL_DUTY'
    and cs.deleted_at is null;
  get diagnostics v_slots = row_count;

  -- Tasks attached to disabled official-duty coverage must not remain public.
  -- Even a coverage row soft-deleted by an older version is included.
  update public.learning_tasks lt
  set deleted_at = now(), deleted_by = auth.uid(), updated_at = now()
  where lt.deleted_at is null
    and exists (
      select 1 from public.coverage_slots cs
      where cs.id = lt.coverage_slot_id
        and cs.official_duty_constraint_id = new.id
        and cs.source = 'OFFICIAL_DUTY'
        and cs.deleted_at is not null
    );
  get diagnostics v_tasks = row_count;

  if v_slots > 0 or v_tasks > 0 then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data)
    values (auth.uid(), 'RESTRICTION_COVERAGE_AUTO_SOFT_DELETE', 'substitute_constraint', new.id::text,
      jsonb_build_object('is_active', old.is_active, 'deleted_at', old.deleted_at),
      jsonb_build_object('coverage_hidden', v_slots, 'tasks_hidden', v_tasks,
                         'new_is_active', new.is_active, 'new_deleted_at', new.deleted_at));
  end if;
  return new;
end;
$$;
revoke all on function public.ejadwal_clear_disabled_constraint_coverage_v319() from public, anon, authenticated;
drop trigger if exists ejadwal_clear_disabled_constraint_coverage_v319 on public.substitute_constraints;
create trigger ejadwal_clear_disabled_constraint_coverage_v319
  after update on public.substitute_constraints
  for each row when (new.is_active = false or new.deleted_at is not null)
  execute function public.ejadwal_clear_disabled_constraint_coverage_v319();

-- Atomic, audited, staff-only UI action. RESTORE only restores the *rule*,
-- INACTIVE, never resurrects cancelled coverage from historical decisions.
create or replace function public.ejadwal_change_substitute_constraint_v319(
  p_constraint_id uuid,
  p_action text,
  p_note text default ''
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_rule public.substitute_constraints%rowtype;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_slots integer := 0;
  v_tasks integer := 0;
begin
  if v_actor is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_constraint_id is null or v_action not in ('SOFT_DELETE', 'DEACTIVATE', 'ACTIVATE', 'RESTORE') then
    raise exception 'INVALID_RESTRICTION_ACTION';
  end if;
  if v_action in ('SOFT_DELETE', 'DEACTIVATE') and v_note is null then
    raise exception 'RESTRICTION_CHANGE_REASON_REQUIRED';
  end if;

  select * into v_rule from public.substitute_constraints
  where id = p_constraint_id for update;
  if not found then raise exception 'RESTRICTION_NOT_FOUND'; end if;

  if v_action = 'SOFT_DELETE' then
    if v_rule.deleted_at is not null then raise exception 'RESTRICTION_ALREADY_DELETED'; end if;
  elsif v_action = 'DEACTIVATE' or v_action = 'ACTIVATE' then
    if v_rule.deleted_at is not null then raise exception 'RESTORE_RESTRICTION_FIRST'; end if;
  elsif v_action = 'RESTORE' and v_rule.deleted_at is null then
    raise exception 'RESTRICTION_NOT_DELETED';
  end if;

  -- Pre-count, trigger performs all soft deletions in this same transaction.
  if v_action in ('SOFT_DELETE', 'DEACTIVATE') then
    select count(*) into v_slots from public.coverage_slots
    where official_duty_constraint_id = p_constraint_id and source = 'OFFICIAL_DUTY'
      and deleted_at is null;
    select count(*) into v_tasks from public.learning_tasks lt
    join public.coverage_slots cs on cs.id = lt.coverage_slot_id
    where cs.official_duty_constraint_id = p_constraint_id
      and cs.source = 'OFFICIAL_DUTY' and lt.deleted_at is null;
  end if;

  if v_action = 'SOFT_DELETE' then
    update public.substitute_constraints
    set deleted_at = now(), deleted_by = v_actor, is_active = false, updated_at = now()
    where id = p_constraint_id;
  elsif v_action = 'DEACTIVATE' then
    update public.substitute_constraints
    set is_active = false, updated_at = now() where id = p_constraint_id;
  elsif v_action = 'ACTIVATE' then
    update public.substitute_constraints
    set is_active = true, updated_at = now() where id = p_constraint_id;
  else
    update public.substitute_constraints
    set deleted_at = null, deleted_by = null, is_active = false, updated_at = now()
    where id = p_constraint_id;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, before_data, after_data, request_id)
  values(v_actor, 'SUBSTITUTE_CONSTRAINT_' || v_action, 'substitute_constraint', p_constraint_id::text,
    to_jsonb(v_rule), jsonb_build_object('note', v_note, 'coverage_hidden', v_slots,
       'tasks_hidden', v_tasks, 'rule_restored_without_coverage', v_action = 'RESTORE'), gen_random_uuid());

  return jsonb_build_object('constraint_id', p_constraint_id, 'action', v_action,
    'coverage_hidden', v_slots, 'tasks_hidden', v_tasks);
end;
$$;
revoke all on function public.ejadwal_change_substitute_constraint_v319(uuid,text,text) from public, anon;
grant execute on function public.ejadwal_change_substitute_constraint_v319(uuid,text,text) to authenticated;

-- One-time repair: old NONAKTIF / deleted restrictions may already have active
-- OFFICIAL_DUTY coverage; repair exactly those foreign-key-linked rows.
-- The audit record makes this migration's effect inspectable in Supabase.
do $$
declare
  v_repaired integer := 0;
  v_tasks integer := 0;
begin
  create temp table rc43_orphaned_slots on commit drop as
    select cs.id from public.coverage_slots cs
    join public.substitute_constraints sc on sc.id = cs.official_duty_constraint_id
    where cs.source = 'OFFICIAL_DUTY' and cs.deleted_at is null
      and (sc.is_active = false or sc.deleted_at is not null);

  update public.coverage_slots cs
  set deleted_previous_status = cs.status, status = 'CANCELLED',
      deleted_at = now(), updated_at = now()
  where cs.id in (select id from rc43_orphaned_slots);
  get diagnostics v_repaired = row_count;

  update public.learning_tasks lt
  set deleted_at = now(), updated_at = now()
  where lt.deleted_at is null
    and exists (
      select 1 from public.coverage_slots cs
      join public.substitute_constraints sc on sc.id = cs.official_duty_constraint_id
      where cs.id = lt.coverage_slot_id and cs.source = 'OFFICIAL_DUTY'
        and cs.deleted_at is not null and (sc.is_active = false or sc.deleted_at is not null)
    );
  get diagnostics v_tasks = row_count;

  if v_repaired > 0 or v_tasks > 0 then
    insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
    values(null, 'RC4_3_REPAIR_ORPHAN_OFFICIAL_DUTY_COVERAGE', 'migration',
      '202610210003', jsonb_build_object('coverage_hidden', v_repaired, 'tasks_hidden', v_tasks));
  end if;
end;
$$;

commit;
