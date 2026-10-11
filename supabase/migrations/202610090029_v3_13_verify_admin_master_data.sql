-- E-Jadwal V3.13.0 verifier — one result set
with checks(check_name, ok) as (
  values
    ('master_audit_function_exists', to_regprocedure('public.ejadwal_audit_master_data_change()') is not null),
    ('teachers_audit_trigger_exists', exists(select 1 from pg_trigger where tgrelid='public.teachers'::regclass and tgname='audit_master_data_change' and not tgisinternal)),
    ('classes_audit_trigger_exists', exists(select 1 from pg_trigger where tgrelid='public.classes'::regclass and tgname='audit_master_data_change' and not tgisinternal)),
    ('rooms_audit_trigger_exists', exists(select 1 from pg_trigger where tgrelid='public.rooms'::regclass and tgname='audit_master_data_change' and not tgisinternal)),
    ('teachers_admin_write_policy_exists', exists(select 1 from pg_policies where schemaname='public' and tablename='teachers' and policyname='teachers_admin_write')),
    ('classes_admin_write_policy_exists', exists(select 1 from pg_policies where schemaname='public' and tablename='classes' and policyname='classes_admin_write')),
    ('rooms_admin_write_policy_exists', exists(select 1 from pg_policies where schemaname='public' and tablename='rooms' and policyname='rooms_admin_write')),
    ('audit_log_staff_read_policy_exists', exists(select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_logs_staff_select'))
)
select check_name, ok from checks order by check_name;
