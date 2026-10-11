-- V3.14.6 RC3.4.1 — Atomic Academic Calendar Bulk Writes
-- Addresses 57014 on multi-class writes: every row used to trigger a complete
-- schedule snapshot via audit_logs -> schedule_versions. Keep per-row audits,
-- but defer canonical snapshot until exactly one batch summary audit is emitted.
-- Apply AFTER earlier E-Jadwal V3 migrations, first in STAGING.
begin;

create or replace function public.ejadwal_capture_schedule_version_from_audit_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_txid bigint := txid_current();
  v_relevant boolean;
  v_metadata jsonb;
begin
  -- A transaction-local flag is set only inside the audited, staff-only RPC.
  -- All row-level audit records are still written; only their repeated full
  -- schedule snapshots are suppressed. Final summary below captures once.
  if current_setting('ejadwal.calendar_bulk_mode', true) = 'on'
    and new.action like 'OPERATIONAL_RULE_%'
    and upper(coalesce(new.entity_type, '')) = 'ACADEMIC_EVENTS'
  then
    return new;
  end if;

  v_relevant := new.action in (
    'SCHEDULE_MASTER_QUICK_EDIT',
    'SCHEDULE_INCIDENTAL_INSERT',
    'SCHEDULE_INCIDENTAL_UPDATE',
    'SCHEDULE_INCIDENTAL_DELETE',
    'SCHEDULE_IMPORT_PUBLISH',
    'SYAIKH_ROTATION_IMPORT_PUBLISH',
    'SCHEDULE_VERSION_ROLLBACK',
    'ACADEMIC_EVENT_GROUP_PUBLISH',
    'ACADEMIC_EVENT_GROUP_STATUS'
  ) or (
    new.action like 'OPERATIONAL_RULE_%'
    and upper(coalesce(new.entity_type, '')) = 'ACADEMIC_EVENTS'
  );
  if not v_relevant then return new; end if;

  v_metadata := jsonb_build_object(
    'audit_id', new.id,
    'request_id', new.request_id,
    'before_data', new.before_data,
    'after_data', new.after_data
  );

  insert into public.schedule_versions(
    txid, source_action, source_entity_type, source_entity_id,
    actor_user_id, metadata, snapshot, created_at
  ) values (
    v_txid, new.action, new.entity_type, new.entity_id,
    new.actor_user_id, v_metadata,
    public.ejadwal_schedule_snapshot_v1(), new.created_at
  )
  on conflict (txid) do update
    set source_action = excluded.source_action,
        source_entity_type = excluded.source_entity_type,
        source_entity_id = excluded.source_entity_id,
        actor_user_id = coalesce(excluded.actor_user_id, public.schedule_versions.actor_user_id),
        metadata = excluded.metadata,
        snapshot = excluded.snapshot,
        created_at = excluded.created_at;
  return new;
end;
$$;
revoke all on function public.ejadwal_capture_schedule_version_from_audit_v1() from public;

create or replace function public.ejadwal_save_academic_event_group_v2(
  p_existing_row_ids uuid[],
  p_group_code text,
  p_date_start date,
  p_date_end date,
  p_event_name text,
  p_event_type text,
  p_scope text,
  p_class_ids uuid[],
  p_period_start integer,
  p_period_end integer
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_code text;
  v_inserted_ids uuid[];
  v_old_ids uuid[];
  v_expected integer;
  v_deactivated integer;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_event_name is null or btrim(p_event_name) = '' then
    raise exception 'EVENT_NAME_REQUIRED';
  end if;
  if p_date_start is null or p_date_end is null or p_date_end < p_date_start then
    raise exception 'INVALID_EVENT_DATES';
  end if;
  if p_scope not in ('ALL', 'CLASS') or p_scope is null then
    raise exception 'INVALID_EVENT_SCOPE';
  end if;
  if (p_period_start is null) <> (p_period_end is null)
    or (p_period_start is not null and
      (p_period_start < 0 or p_period_end > 6 or p_period_end < p_period_start))
  then
    raise exception 'INVALID_EVENT_PERIODS';
  end if;
  if p_scope = 'CLASS' and cardinality(coalesce(p_class_ids, array[]::uuid[])) = 0 then
    raise exception 'EVENT_CLASSES_REQUIRED';
  end if;

  v_old_ids := array(select distinct unnest(coalesce(p_existing_row_ids, array[]::uuid[])));
  v_expected := cardinality(v_old_ids);
  if v_expected > 0 then
    if (select count(*) from public.academic_events where id = any(v_old_ids)) <> v_expected then
      raise exception 'ACADEMIC_EVENT_REVISION_TARGETS_NOT_FOUND';
    end if;
  end if;

  v_code := coalesce(nullif(btrim(p_group_code), ''),
    'CAL-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 8)));
  -- Suppress ONLY redundant full-schedule snapshots, not row-level audit data.
  perform set_config('ejadwal.calendar_bulk_mode', 'on', true);

  with targets as (
    select null::uuid as class_id where p_scope = 'ALL'
    union all
    select distinct x.class_id
    from unnest(coalesce(p_class_ids, array[]::uuid[])) as x(class_id)
    where p_scope = 'CLASS' and x.class_id is not null
  ), inserted as (
    insert into public.academic_events(
      admin_group_code, legacy_event_code, date_start, date_end,
      event_name, event_type, scope, class_id, period_start, period_end, status
    )
    select v_code, null, p_date_start, p_date_end,
      btrim(p_event_name), coalesce(nullif(btrim(p_event_type), ''), 'Kegiatan'),
      p_scope, targets.class_id, p_period_start, p_period_end, 'ACTIVE'
    from targets
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into v_inserted_ids from inserted;

  if cardinality(v_inserted_ids) = 0 then raise exception 'NO_EVENT_ROWS_INSERTED'; end if;

  if v_expected > 0 then
    update public.academic_events set status = 'INACTIVE'
      where id = any(v_old_ids);
    get diagnostics v_deactivated = row_count;
    if v_deactivated <> v_expected then
      raise exception 'ACADEMIC_EVENT_REVISION_INCOMPLETE';
    end if;
  end if;

  perform set_config('ejadwal.calendar_bulk_mode', 'off', true);
  -- One explicit version trigger AFTER all rows are inserted and old rows
  -- inactivated. If anything fails, PostgreSQL rolls back the whole call.
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (
    auth.uid(), 'ACADEMIC_EVENT_GROUP_PUBLISH', 'ACADEMIC_EVENTS', v_code,
    jsonb_build_object(
      'group_code', v_code, 'new_rows', cardinality(v_inserted_ids),
      'old_rows_inactivated', v_expected,
      'date_start', p_date_start, 'date_end', p_date_end,
      'class_count', case when p_scope = 'ALL' then 0 else cardinality(v_inserted_ids) end,
      'scope', p_scope
    )
  );
  return jsonb_build_object('group_code', v_code, 'row_ids', to_jsonb(v_inserted_ids));
end;
$$;
revoke all on function public.ejadwal_save_academic_event_group_v2(
  uuid[], text, date, date, text, text, text, uuid[], integer, integer
) from public;
grant execute on function public.ejadwal_save_academic_event_group_v2(
  uuid[], text, date, date, text, text, text, uuid[], integer, integer
) to authenticated;

create or replace function public.ejadwal_set_academic_event_group_active_v2(
  p_row_ids uuid[], p_active boolean
) returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_ids uuid[];
  v_expected integer;
  v_changed integer;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED' using errcode = '42501';
  end if;
  v_ids := array(select distinct unnest(coalesce(p_row_ids, array[]::uuid[])));
  v_expected := cardinality(v_ids);
  if v_expected = 0 then return 0; end if;
  if (select count(*) from public.academic_events where id = any(v_ids)) <> v_expected then
    raise exception 'ACADEMIC_EVENT_STATUS_TARGETS_NOT_FOUND';
  end if;
  perform set_config('ejadwal.calendar_bulk_mode', 'on', true);
  update public.academic_events
    set status = case when p_active then 'ACTIVE' else 'INACTIVE' end
    where id = any(v_ids);
  get diagnostics v_changed = row_count;
  perform set_config('ejadwal.calendar_bulk_mode', 'off', true);
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, after_data)
  values (
    auth.uid(), 'ACADEMIC_EVENT_GROUP_STATUS', 'ACADEMIC_EVENTS', v_ids[1]::text,
    jsonb_build_object('row_count', v_changed, 'active', p_active)
  );
  return v_changed;
end;
$$;
revoke all on function public.ejadwal_set_academic_event_group_active_v2(uuid[], boolean) from public;
grant execute on function public.ejadwal_set_academic_event_group_active_v2(uuid[], boolean) to authenticated;
commit;
