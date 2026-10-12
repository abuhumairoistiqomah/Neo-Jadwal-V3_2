-- RC3.4.9.3 Staff-only individual leave summary. Does not expose health/leave information via guest snapshot.
begin;
create or replace function public.ejadwal_teacher_leave_profile_v1(
  p_teacher_id uuid, p_date_start date, p_date_end date
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_name text; v_result jsonb;
begin
  if auth.uid() is null or not public.current_user_is_staff() then raise exception 'STAFF_REQUIRED'; end if;
  if p_teacher_id is null or p_date_start is null or p_date_end is null
    or p_date_end < p_date_start or p_date_end > (now() at time zone 'Asia/Jakarta')::date
    or p_date_end - p_date_start > 180 then
    raise exception 'TEACHER_ANALYTICS_RANGE_INVALID';
  end if;
  select full_name into v_name from public.teachers where id=p_teacher_id;
  if v_name is null then raise exception 'TEACHER_NOT_FOUND'; end if;
  with approved as (
    select distinct on (lp.schedule_date, lp.period)
      lp.schedule_date as date, lp.period,
      lp.period_type::text as period_type,
      coalesce(nullif(trim(lr.reason),''),'Tanpa alasan') as reason,
      'APPROVED'::text as source
    from public.leave_request_periods lp
    join public.leave_requests lr on lr.id=lp.leave_request_id
    where lr.teacher_id=p_teacher_id and lr.status='APPROVED'
      and lp.schedule_date between p_date_start and p_date_end
    order by lp.schedule_date,lp.period,lr.decided_at desc nulls last,lr.created_at desc
  ), legacy as (
    select distinct on (cs.schedule_date,cs.period)
      cs.schedule_date as date,cs.period,'TEACHING'::text as period_type,
      coalesce(nullif(trim(cs.reason_snapshot),''),'Tanpa alasan') as reason,
      cs.source::text as source
    from public.coverage_slots cs
    where cs.source in ('LEGACY_IMPORT','ADMIN_MANUAL')
      and cs.schedule_date between p_date_start and p_date_end
      and cs.deleted_at is null and cs.status <> 'CANCELLED'
      and (cs.absent_teacher_id=p_teacher_id or
        (cs.absent_teacher_id is null and lower(trim(cs.absent_teacher_name_snapshot))=lower(trim(v_name))))
      and not exists (select 1 from approved a where a.date=cs.schedule_date and a.period=cs.period)
    order by cs.schedule_date,cs.period,cs.updated_at desc
  ), units as (
    select * from approved union all select * from legacy
  )
  select jsonb_build_object(
    'teacher_id',p_teacher_id,'teacher_name',v_name,'date_start',p_date_start,'date_end',p_date_end,
    'units',coalesce(jsonb_agg(jsonb_build_object('date',date,'period',period,
       'period_type',period_type,'reason',reason,'source',source) order by date,period), '[]'::jsonb)
  ) into v_result from units;
  return v_result;
end;
$$;
revoke all on function public.ejadwal_teacher_leave_profile_v1(uuid,date,date) from public,anon;
grant execute on function public.ejadwal_teacher_leave_profile_v1(uuid,date,date) to authenticated;
commit;
