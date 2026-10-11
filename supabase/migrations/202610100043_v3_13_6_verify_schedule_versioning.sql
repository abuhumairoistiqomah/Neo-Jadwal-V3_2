select * from (
  values
    ('schedule_versions_table_exists', to_regclass('public.schedule_versions') is not null),
    ('schedule_snapshot_rpc_exists', to_regprocedure('public.ejadwal_schedule_snapshot_v1()') is not null),
    ('schedule_history_rpc_exists', to_regprocedure('public.ejadwal_list_schedule_versions_v1(integer)') is not null),
    ('schedule_rollback_rpc_exists', to_regprocedure('public.ejadwal_rollback_schedule_version_v1(uuid,text)') is not null),
    ('schedule_version_trigger_exists', exists(
      select 1 from pg_trigger
      where tgrelid = 'public.audit_logs'::regclass
        and tgname = 'capture_schedule_version_from_audit'
        and not tgisinternal
    )),
    ('authenticated_can_list_versions', has_function_privilege('authenticated', 'public.ejadwal_list_schedule_versions_v1(integer)', 'EXECUTE')),
    ('authenticated_can_call_rollback', has_function_privilege('authenticated', 'public.ejadwal_rollback_schedule_version_v1(uuid,text)', 'EXECUTE')),
    ('anon_cannot_call_rollback', not has_function_privilege('anon', 'public.ejadwal_rollback_schedule_version_v1(uuid,text)', 'EXECUTE')),
    ('baseline_version_exists', exists(select 1 from public.schedule_versions where source_action = 'VERSIONING_BASELINE')),
    ('schedule_versions_txid_unique', exists(
      select 1
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
      where c.oid = 'public.schedule_versions'::regclass
        and i.indisunique
        and a.attname = 'txid'
    )),
    ('master_quick_edit_v2_still_exists', to_regprocedure('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)') is not null),
    ('syaikh_import_rpc_still_exists', to_regprocedure('public.ejadwal_publish_syaikh_rotation_v1(jsonb,text,text,boolean)') is not null)
) as checks(check_name, ok);
