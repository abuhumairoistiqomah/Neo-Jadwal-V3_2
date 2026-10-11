-- E-Jadwal V3.14.2 verifier
with checks(check_name, ok) as (
  values
    (
      'substitute_constraints_blocks_normal_teaching_exists',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'substitute_constraints'
          and column_name = 'blocks_normal_teaching'
          and data_type = 'boolean'
      )
    ),
    (
      'master_quick_edit_v4_exists',
      to_regprocedure('public.ejadwal_update_schedule_master_v4(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean)') is not null
    ),
    (
      'authenticated_can_execute_master_quick_edit_v4',
      has_function_privilege('authenticated', 'public.ejadwal_update_schedule_master_v4(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean)', 'EXECUTE')
    ),
    (
      'anon_cannot_execute_master_quick_edit_v4',
      not has_function_privilege('anon', 'public.ejadwal_update_schedule_master_v4(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean)', 'EXECUTE')
    ),
    (
      'alternating_class_mode_supported',
      exists (
        select 1 from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'schedule_master'
          and pg_get_constraintdef(c.oid) ilike '%ALTERNATING%'
      )
    ),
    (
      'master_quick_edit_v3_still_exists',
      to_regprocedure('public.ejadwal_update_schedule_master_v3(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,text,uuid[],text[],text,boolean)') is not null
    ),
    (
      'substitute_constraints_table_still_exists',
      to_regclass('public.substitute_constraints') is not null
    ),
    (
      'coverage_constraint_overrides_still_exists',
      to_regclass('public.coverage_constraint_overrides') is not null
    )
)
select check_name, ok from checks order by check_name;
