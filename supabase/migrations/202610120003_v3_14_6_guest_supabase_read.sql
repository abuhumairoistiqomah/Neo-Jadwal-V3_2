-- V3.14.6 RC3.4.8 — Supabase-only guest read.
-- For anonymous visitors the PUBLIC read boundary is this sanitized RPC,
-- never unrestricted SELECT on teachers, leave_requests, tasks, or coverage_slots.
-- Apply in staging before deploying the frontend. Existing RLS/grants stay intact.
-- The function owner must have SELECT privileges on referenced tables.

create or replace function public.ejadwal_public_schedule_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'teachers', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select t.id,t.full_name,t.short_name,t.gender,t.primary_subjects_text,t.subject_cluster,t.levels_text,t.additional_task,t.legacy_name,t.is_active,
  null::text as whatsapp_e164,
  case when lower(coalesce(t.additional_task,'')) ~ '(wali|pendamping)' then
    coalesce((select string_agg(c.display_name,' + ' order by c.display_name)
      from public.classes c where c.is_active = true
      and position(upper(c.display_name) in upper(coalesce(t.notes,''))) > 0),'')
  else '' end as notes
 from public.teachers t where t.is_active = true
    ) as row_data),
    'classes', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,code,display_name,gender,grade_level,program,is_active from public.classes where is_active = true
    ) as row_data),
    'rooms', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,name,aliases,capacity,location,room_type,status from public.rooms
    ) as row_data),
    'scheduleMaster', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,class_id,day_of_week,period,start_time,end_time,subject,room_id,is_combined,class_mode,other_teachers_supervise,special_note,is_active,deleted_at
 from public.schedule_master where is_active = true and deleted_at is null
    ) as row_data),
    'scheduleTeachers', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select schedule_id,position,teacher_id,teacher_name_snapshot from public.schedule_master_teachers
    ) as row_data),
    'scheduleIncidentals', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,schedule_date,class_id,period,kind,override_subject,override_start_time,override_end_time,override_room_id,override_is_combined,override_class_mode,override_special_note,incidental_type,deleted_at,
  ''::text as reason
 from public.schedule_incidentals where deleted_at is null
    ) as row_data),
    'incidentalTeacherOverrides', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select incidental_id,position,action,teacher_id,teacher_name_snapshot from public.schedule_incidental_teacher_overrides
    ) as row_data),
    'academicEvents', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,legacy_event_code,date_start,date_end,event_name,event_type,scope,class_id,period_start,period_end,status from public.academic_events
    ) as row_data),
    'coverageSlots', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,schedule_date,class_id,class_name_snapshot,period,subject_snapshot,absent_teacher_id,absent_teacher_name_snapshot,
 substitute_teacher_id,substitute_teacher_name_snapshot,source,status,created_at,deleted_at,
 ''::text as reason_snapshot
 from public.coverage_slots where deleted_at is null and status not in ('CANCELLED','EXPIRED')
    ) as row_data),
    'learningTasks', '[]'::jsonb,
    'taskResources', '[]'::jsonb,
    -- A dated staff duty can cancel normal lessons. The public needs this
    -- boolean schedule effect, but never the private reason or override notes.
    'normalTeachingBlocks', (select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) from (
      select id,teacher_id,constraint_type,day_of_week,specific_date,
        period_start,period_end,valid_from,valid_until,
        true as blocks_normal_teaching, true as is_active,
        false as override_allowed, ''::text as reason
      from public.substitute_constraints
      where is_active = true and deleted_at is null and blocks_normal_teaching = true
    ) as row_data)
  );
$$;

revoke all on function public.ejadwal_public_schedule_snapshot_v1() from public;
grant execute on function public.ejadwal_public_schedule_snapshot_v1() to anon, authenticated;

comment on function public.ejadwal_public_schedule_snapshot_v1() is
  'Public schedule-only projection: no phone numbers, private teacher notes, leave reasons, private staff restriction reasons, task descriptions or resource links. Read-only; does not relax table RLS.';
