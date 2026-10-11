-- E-Jadwal V3.14.3 — Management Analytics grouping repair
--
-- A single staff-only aggregate RPC powers management reporting without
-- exposing raw operational tables to a new browser-side analytics pipeline.
-- Semantics:
--   * Approved leave_request_periods are the authoritative attendance facts.
--   * Legacy/admin coverage rows are retained as historical teaching-absence units.
--   * Combined-class coverage rows are collapsed to one absent-teacher/date/JP unit.
--   * JP0 counts as TEACHING/Homeroom but is never task-eligible.
--   * FREE periods are attendance/statistics only and never enter badal coverage rate.

begin;

create or replace function public.ejadwal_management_analytics_v1(
  p_date_start date,
  p_date_end date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  if p_date_start is null or p_date_end is null then
    raise exception 'ANALYTICS_DATE_RANGE_REQUIRED';
  end if;
  if p_date_end < p_date_start then
    raise exception 'ANALYTICS_DATE_RANGE_INVALID';
  end if;
  if (p_date_end - p_date_start) > 730 then
    raise exception 'ANALYTICS_DATE_RANGE_TOO_LARGE';
  end if;

  with
  request_scope as (
    select lr.*
    from public.leave_requests lr
    where lr.date_start <= p_date_end
      and lr.date_end >= p_date_start
  ),
  approved_periods as (
    select
      ('LEAVE_WORKFLOW|' || lr.id::text || '|' || lrp.schedule_date::text || '|' || lrp.period::text || '|' || lr.teacher_id::text) as unit_key,
      lr.id as leave_request_id,
      lrp.schedule_date,
      lrp.period,
      lrp.period_type,
      lr.teacher_id as absent_teacher_id,
      t.full_name as absent_teacher_name,
      lr.reason,
      'LEAVE_WORKFLOW'::text as source
    from public.leave_request_periods lrp
    join public.leave_requests lr on lr.id = lrp.leave_request_id
    join public.teachers t on t.id = lr.teacher_id
    where lr.status = 'APPROVED'
      and lrp.schedule_date between p_date_start and p_date_end
  ),
  coverage_sessions as (
    select
      (
        cs.source
        || '|' || coalesce(cs.leave_request_id::text, 'none')
        || '|' || cs.schedule_date::text
        || '|' || cs.period::text
        || '|' || coalesce(cs.absent_teacher_id::text, lower(trim(cs.absent_teacher_name_snapshot)), 'unknown')
      ) as coverage_key,
      cs.leave_request_id,
      cs.schedule_date,
      cs.period,
      cs.absent_teacher_id,
      max(nullif(trim(cs.absent_teacher_name_snapshot), '')) as absent_teacher_name,
      cs.source,
      bool_and(cs.status in ('ASSIGNED','COMPLETED') and cs.substitute_teacher_id is not null) as fully_assigned,
      bool_or(cs.status = 'WAITING') as has_waiting,
      bool_or(cs.status = 'NO_SUBSTITUTE') as has_no_substitute,
      bool_or(cs.status = 'EXPIRED') as has_expired
    from public.coverage_slots cs
    where cs.schedule_date between p_date_start and p_date_end
      and cs.deleted_at is null
      and cs.status <> 'CANCELLED'
    -- Group by the exact absent-teacher identity expression used by coverage_key.
    -- The former CASE expression left absent_teacher_name_snapshot ungrouped and
    -- caused PostgreSQL 42803 as soon as this CTE was executed.
    group by cs.leave_request_id, cs.schedule_date, cs.period, cs.absent_teacher_id,
      coalesce(cs.absent_teacher_id::text, lower(trim(cs.absent_teacher_name_snapshot)), 'unknown'), cs.source
  ),
  coverage_only_absence as (
    select
      cs.coverage_key as unit_key,
      cs.leave_request_id,
      cs.schedule_date,
      cs.period,
      'TEACHING'::text as period_type,
      cs.absent_teacher_id,
      coalesce(t.full_name, cs.absent_teacher_name, 'Guru tidak dikenal') as absent_teacher_name,
      null::text as reason,
      cs.source
    from coverage_sessions cs
    left join public.teachers t on t.id = cs.absent_teacher_id
    where not exists (
      select 1
      from approved_periods ap
      where ap.schedule_date = cs.schedule_date
        and ap.period = cs.period
        and (
          (ap.absent_teacher_id is not null and ap.absent_teacher_id = cs.absent_teacher_id)
          or (ap.leave_request_id is not null and ap.leave_request_id = cs.leave_request_id)
        )
    )
  ),
  all_absence_units as (
    select * from approved_periods
    union all
    select * from coverage_only_absence
  ),
  teaching_units as (
    select * from all_absence_units where period_type = 'TEACHING'
  ),
  unit_coverage as (
    select
      tu.unit_key,
      (cs.coverage_key is not null) as has_coverage,
      cs.fully_assigned,
      cs.has_waiting,
      cs.has_no_substitute,
      cs.has_expired
    from teaching_units tu
    left join coverage_sessions cs
      on cs.schedule_date = tu.schedule_date
     and cs.period = tu.period
     and cs.source = tu.source
     and (
       (tu.leave_request_id is not null and cs.leave_request_id = tu.leave_request_id)
       or (
         tu.leave_request_id is null
         and coalesce(cs.absent_teacher_id::text, lower(trim(cs.absent_teacher_name)), 'unknown') =
             coalesce(tu.absent_teacher_id::text, lower(trim(tu.absent_teacher_name)), 'unknown')
       )
     )
  ),
  task_units as (
    select
      tu.*,
      case
        when tu.period = 0 then false
        else (
          exists (
            select 1
            from public.leave_request_tasks lrt
            where lrt.leave_request_id = tu.leave_request_id
              and lrt.period = tu.period
              and (
                nullif(trim(coalesce(lrt.description,'')), '') is not null
                or exists (
                  select 1 from public.leave_request_task_resources lrtr
                  where lrtr.leave_request_task_id = lrt.id
                )
              )
          )
          or exists (
            select 1
            from public.coverage_slots cs2
            join public.learning_tasks lt on lt.coverage_slot_id = cs2.id and lt.deleted_at is null
            where cs2.schedule_date = tu.schedule_date
              and cs2.period = tu.period
              and cs2.deleted_at is null
              and (
                (tu.leave_request_id is not null and cs2.leave_request_id = tu.leave_request_id)
                or (
                  tu.leave_request_id is null
                  and coalesce(cs2.absent_teacher_id::text, lower(trim(cs2.absent_teacher_name_snapshot)), 'unknown') =
                      coalesce(tu.absent_teacher_id::text, lower(trim(tu.absent_teacher_name)), 'unknown')
                )
              )
              and (
                nullif(trim(coalesce(lt.description,'')), '') is not null
                or exists (select 1 from public.task_resources tr where tr.task_id = lt.id)
              )
          )
        )
      end as task_ready
    from teaching_units tu
    where tu.period between 1 and 6
  ),
  substitution_units as (
    select distinct
      cs.schedule_date,
      cs.period,
      cs.leave_request_id,
      cs.absent_teacher_id,
      cs.substitute_teacher_id
    from public.coverage_slots cs
    where cs.schedule_date between p_date_start and p_date_end
      and cs.deleted_at is null
      and cs.status in ('ASSIGNED','COMPLETED')
      and cs.substitute_teacher_id is not null
  ),
  regular_weekly_load as (
    select smt.teacher_id,
      count(distinct (sm.day_of_week::text || '|' || sm.period::text))::integer as regular_weekly_jp
    from public.schedule_master_teachers smt
    join public.schedule_master sm on sm.id = smt.schedule_id
    where smt.teacher_id is not null
      and sm.is_active = true
      and sm.deleted_at is null
    group by smt.teacher_id
  ),
  teacher_universe as (
    select t.id, t.full_name, t.gender
    from public.teachers t
    where t.is_active = true
       or exists (select 1 from all_absence_units au where au.absent_teacher_id = t.id)
       or exists (select 1 from substitution_units su where su.substitute_teacher_id = t.id)
  ),
  teacher_rows as (
    select
      t.id as teacher_id,
      t.full_name as teacher_name,
      t.gender,
      coalesce(rwl.regular_weekly_jp,0) as regular_weekly_jp,
      count(distinct (au.schedule_date::text)) filter (where au.unit_key is not null)::integer as leave_days,
      count(au.unit_key)::integer as absence_periods,
      count(au.unit_key) filter (where au.period_type = 'TEACHING')::integer as teaching_absence_periods,
      count(au.unit_key) filter (where au.period_type = 'FREE')::integer as free_absence_periods,
      count(au.unit_key) filter (where au.period_type = 'TEACHING' and au.period=0)::integer as homeroom_absence_periods,
      coalesce((select count(*)::integer from substitution_units su where su.substitute_teacher_id=t.id),0) as substitute_periods,
      coalesce((select count(*)::integer from task_units tu where tu.absent_teacher_id=t.id),0) as task_eligible_periods,
      coalesce((select count(*)::integer from task_units tu where tu.absent_teacher_id=t.id and tu.task_ready),0) as task_ready_periods
    from teacher_universe t
    left join regular_weekly_load rwl on rwl.teacher_id=t.id
    left join all_absence_units au on au.absent_teacher_id=t.id
    group by t.id,t.full_name,t.gender,rwl.regular_weekly_jp
  ),
  daily_rows as (
    select
      d.activity_date as date,
      coalesce((select count(*) from all_absence_units au where au.schedule_date=d.activity_date and au.period_type = 'TEACHING'),0)::integer as teaching_absence_periods,
      coalesce((select count(*) from all_absence_units au where au.schedule_date=d.activity_date and au.period_type = 'FREE'),0)::integer as free_absence_periods,
      coalesce((select count(*) from teaching_units tu join unit_coverage uc on uc.unit_key=tu.unit_key where tu.schedule_date=d.activity_date and coalesce(uc.fully_assigned,false)),0)::integer as assigned_coverage_periods,
      coalesce((select count(*) from task_units tu where tu.schedule_date=d.activity_date and tu.task_ready),0)::integer as task_ready_periods
    from (
      select distinct schedule_date as activity_date from all_absence_units
      union
      select distinct schedule_date from coverage_sessions
    ) d
  ),
  reason_rows as (
    select
      coalesce(nullif(trim(rs.reason),''),'Tanpa alasan') as reason,
      count(distinct rs.id)::integer as request_count,
      count(ap.unit_key)::integer as approved_period_count
    from request_scope rs
    left join approved_periods ap on ap.leave_request_id = rs.id
    where rs.status='APPROVED'
    group by coalesce(nullif(trim(rs.reason),''),'Tanpa alasan')
  ),
  request_status_rows as (
    select status, count(*)::integer as count
    from request_scope
    group by status
  ),
  summary_row as (
    select
      (select count(*)::integer from request_scope) as request_total,
      (select count(*)::integer from request_scope where status='SUBMITTED') as request_submitted,
      (select count(*)::integer from request_scope where status='APPROVED') as request_approved,
      (select count(*)::integer from request_scope where status='DECLINED') as request_declined,
      (select count(*)::integer from request_scope where status='CANCELLED') as request_cancelled,
      (select count(distinct (coalesce(absent_teacher_id::text, lower(absent_teacher_name), 'unknown') || '|' || schedule_date::text))::integer from all_absence_units) as absent_teacher_days,
      (select count(distinct coalesce(absent_teacher_id::text, lower(absent_teacher_name), 'unknown'))::integer from all_absence_units) as unique_absent_teachers,
      (select count(distinct substitute_teacher_id)::integer from substitution_units) as unique_substitute_teachers,
      (select count(*)::integer from all_absence_units) as absence_periods_total,
      (select count(*)::integer from teaching_units) as teaching_absence_periods,
      (select count(*)::integer from all_absence_units where period_type = 'FREE') as free_absence_periods,
      (select count(*)::integer from teaching_units where period=0) as homeroom_absence_periods,
      (select count(*)::integer from teaching_units) as coverage_needed_periods,
      (select count(*)::integer from teaching_units tu join unit_coverage uc on uc.unit_key=tu.unit_key where coalesce(uc.fully_assigned,false)) as coverage_assigned_periods,
      (select count(*)::integer from teaching_units tu join unit_coverage uc on uc.unit_key=tu.unit_key where coalesce(uc.has_waiting,false)) as coverage_waiting_periods,
      (select count(*)::integer from teaching_units tu join unit_coverage uc on uc.unit_key=tu.unit_key where coalesce(uc.has_no_substitute,false)) as coverage_no_substitute_periods,
      (select count(*)::integer from teaching_units tu join unit_coverage uc on uc.unit_key=tu.unit_key where coalesce(uc.has_expired,false)) as coverage_expired_periods,
      (select count(*)::integer from teaching_units tu join unit_coverage uc on uc.unit_key=tu.unit_key where not coalesce(uc.has_coverage,false)) as coverage_missing_periods,
      (select count(*)::integer from task_units) as task_eligible_periods,
      (select count(*)::integer from task_units where task_ready) as task_ready_periods
  )
  select jsonb_build_object(
    'date_start', p_date_start,
    'date_end', p_date_end,
    'generated_at', now(),
    'summary', (
      select jsonb_build_object(
        'request_total', s.request_total,
        'request_submitted', s.request_submitted,
        'request_approved', s.request_approved,
        'request_declined', s.request_declined,
        'request_cancelled', s.request_cancelled,
        'absent_teacher_days', s.absent_teacher_days,
        'unique_absent_teachers', s.unique_absent_teachers,
        'unique_substitute_teachers', s.unique_substitute_teachers,
        'absence_periods_total', s.absence_periods_total,
        'teaching_absence_periods', s.teaching_absence_periods,
        'free_absence_periods', s.free_absence_periods,
        'homeroom_absence_periods', s.homeroom_absence_periods,
        'coverage_needed_periods', s.coverage_needed_periods,
        'coverage_assigned_periods', s.coverage_assigned_periods,
        'coverage_waiting_periods', s.coverage_waiting_periods,
        'coverage_no_substitute_periods', s.coverage_no_substitute_periods,
        'coverage_expired_periods', s.coverage_expired_periods,
        'coverage_missing_periods', s.coverage_missing_periods,
        'coverage_rate_pct', case when s.coverage_needed_periods=0 then 100 else round((s.coverage_assigned_periods::numeric*100)/s.coverage_needed_periods,1) end,
        'task_eligible_periods', s.task_eligible_periods,
        'task_ready_periods', s.task_ready_periods,
        'task_missing_periods', greatest(s.task_eligible_periods-s.task_ready_periods,0),
        'task_readiness_pct', case when s.task_eligible_periods=0 then 100 else round((s.task_ready_periods::numeric*100)/s.task_eligible_periods,1) end
      ) from summary_row s
    ),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'teacher_id', tr.teacher_id,
        'teacher_name', tr.teacher_name,
        'gender', tr.gender,
        'regular_weekly_jp', tr.regular_weekly_jp,
        'leave_days', tr.leave_days,
        'absence_periods', tr.absence_periods,
        'teaching_absence_periods', tr.teaching_absence_periods,
        'free_absence_periods', tr.free_absence_periods,
        'homeroom_absence_periods', tr.homeroom_absence_periods,
        'substitute_periods', tr.substitute_periods,
        'task_eligible_periods', tr.task_eligible_periods,
        'task_ready_periods', tr.task_ready_periods,
        'task_readiness_pct', case when tr.task_eligible_periods=0 then 100 else round((tr.task_ready_periods::numeric*100)/tr.task_eligible_periods,1) end
      ) order by tr.substitute_periods desc, tr.teaching_absence_periods desc, tr.teacher_name)
      from teacher_rows tr
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', dr.date,
        'teaching_absence_periods', dr.teaching_absence_periods,
        'free_absence_periods', dr.free_absence_periods,
        'assigned_coverage_periods', dr.assigned_coverage_periods,
        'task_ready_periods', dr.task_ready_periods
      ) order by dr.date)
      from daily_rows dr
    ), '[]'::jsonb),
    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reason', rr.reason,
        'request_count', rr.request_count,
        'approved_period_count', rr.approved_period_count
      ) order by rr.request_count desc, rr.reason)
      from reason_rows rr
    ), '[]'::jsonb),
    'request_statuses', coalesce((
      select jsonb_agg(jsonb_build_object('status', rs.status, 'count', rs.count) order by rs.status)
      from request_status_rows rs
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.ejadwal_management_analytics_v1(date,date) from public;
revoke all on function public.ejadwal_management_analytics_v1(date,date) from anon;
grant execute on function public.ejadwal_management_analytics_v1(date,date) to authenticated;

commit;
