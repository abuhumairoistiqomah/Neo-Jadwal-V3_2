select * from (values
  ('master_quick_edit_v1_still_exists',
    to_regprocedure('public.ejadwal_update_schedule_master_v1(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text)') is not null),
  ('master_quick_edit_v2_exists',
    to_regprocedure('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)') is not null),
  ('authenticated_can_execute_master_quick_edit_v2',
    has_function_privilege('authenticated', 'public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)', 'EXECUTE')),
  ('anon_cannot_execute_master_quick_edit_v2',
    not has_function_privilege('anon', 'public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)', 'EXECUTE')),
  ('master_quick_edit_v2_requires_admin',
    position('ADMIN_REQUIRED' in pg_get_functiondef('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)'::regprocedure)) > 0),
  ('master_quick_edit_v2_requires_conflict_confirmation',
    position('TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED' in pg_get_functiondef('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)'::regprocedure)) > 0),
  ('master_quick_edit_v2_audits_teacher_override',
    position('teacher_conflict_override' in pg_get_functiondef('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)'::regprocedure)) > 0),
  ('master_quick_edit_v2_supports_jp0',
    position('p_period < 0' in pg_get_functiondef('public.ejadwal_update_schedule_master_v2(uuid[],uuid,smallint,smallint,time without time zone,time without time zone,text,text,boolean,uuid[],text[],text,boolean)'::regprocedure)) > 0)
) as checks(check_name, ok);
