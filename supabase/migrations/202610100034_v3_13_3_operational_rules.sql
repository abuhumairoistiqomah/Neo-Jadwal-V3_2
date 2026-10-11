-- E-Jadwal V3.13.3 — Operational Rules
-- 1) Admin/Wakasek editor for substitute restrictions.
-- 2) Admin/Wakasek academic calendar editor with multi-class grouping.
-- 3) Audit trail for both operational-rule tables.

begin;

alter table public.academic_events
  add column if not exists admin_group_code text null;

create index if not exists academic_events_admin_group_code_idx
  on public.academic_events (admin_group_code, status, date_start, date_end);

-- Academic calendar is operational scheduling data. WAKASEK and ADMIN may manage
-- it, while authenticated users keep read-only access.
drop policy if exists academic_events_admin_write on public.academic_events;
drop policy if exists academic_events_staff_write on public.academic_events;
create policy academic_events_staff_write
on public.academic_events
for all
to authenticated
using (public.current_user_is_staff())
with check (public.current_user_is_staff());

create or replace function public.ejadwal_audit_operational_rule_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_id text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_entity_id := coalesce(to_jsonb(new)->>'id', '');
    v_before := null;
    v_after := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_entity_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', '');
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  else
    v_entity_id := coalesce(to_jsonb(old)->>'id', '');
    v_before := to_jsonb(old);
    v_after := null;
  end if;

  insert into public.audit_logs(
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'OPERATIONAL_RULE_' || tg_op,
    upper(tg_table_name),
    v_entity_id,
    v_before,
    v_after
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.ejadwal_audit_operational_rule_change() from public;

drop trigger if exists audit_operational_rule_change on public.substitute_constraints;
create trigger audit_operational_rule_change
after insert or update or delete on public.substitute_constraints
for each row execute function public.ejadwal_audit_operational_rule_change();

drop trigger if exists audit_operational_rule_change on public.academic_events;
create trigger audit_operational_rule_change
after insert or update or delete on public.academic_events
for each row execute function public.ejadwal_audit_operational_rule_change();

commit;
