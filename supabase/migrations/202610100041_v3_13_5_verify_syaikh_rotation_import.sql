select 'syaikh_rotation_publish_rpc_exists' as check_name,
       to_regprocedure('public.ejadwal_publish_syaikh_rotation_v1(jsonb,text,text,boolean)') is not null as ok
union all
select 'authenticated_can_execute_syaikh_rotation_publish',
       has_function_privilege('authenticated', 'public.ejadwal_publish_syaikh_rotation_v1(jsonb,text,text,boolean)', 'EXECUTE')
union all
select 'anon_cannot_execute_syaikh_rotation_publish',
       not has_function_privilege('anon', 'public.ejadwal_publish_syaikh_rotation_v1(jsonb,text,text,boolean)', 'EXECUTE')
union all
select 'incidental_upsert_dependency_exists',
       to_regprocedure('public.ejadwal_upsert_schedule_incidental_v1(uuid,date,uuid,smallint,text,text,text,boolean,uuid[],text[],text,text,text,boolean)') is not null
union all
select 'master_quick_edit_v2_still_exists',
       to_regprocedure('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)') is not null
union all
select 'schedule_incidentals_support_jp0',
       exists (
         select 1 from pg_constraint c
         where c.conrelid = 'public.schedule_incidentals'::regclass
           and pg_get_constraintdef(c.oid) ilike '%period >= 0%'
       )
union all
select 'audit_logs_exists', to_regclass('public.audit_logs') is not null
union all
select 'syaikh_rotation_type_is_supported_by_incidentals',
       exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'schedule_incidentals' and column_name = 'incidental_type'
       );
