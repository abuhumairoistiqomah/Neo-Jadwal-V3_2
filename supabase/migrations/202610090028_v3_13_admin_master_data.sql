-- E-Jadwal V3.13.0 — Admin Master Data CRUD
-- Adds automatic audit logging for teacher/class/room changes.
-- Existing V3.5 RLS already limits writes on these tables to role ADMIN.

begin;

create or replace function public.ejadwal_audit_master_data_change()
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
    'MASTER_' || tg_op,
    upper(tg_table_name),
    v_entity_id,
    v_before,
    v_after
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.ejadwal_audit_master_data_change() from public;

-- Keep one deterministic trigger per master table.
drop trigger if exists audit_master_data_change on public.teachers;
create trigger audit_master_data_change
after insert or update or delete on public.teachers
for each row execute function public.ejadwal_audit_master_data_change();

drop trigger if exists audit_master_data_change on public.classes;
create trigger audit_master_data_change
after insert or update or delete on public.classes
for each row execute function public.ejadwal_audit_master_data_change();

drop trigger if exists audit_master_data_change on public.rooms;
create trigger audit_master_data_change
after insert or update or delete on public.rooms
for each row execute function public.ejadwal_audit_master_data_change();

commit;
