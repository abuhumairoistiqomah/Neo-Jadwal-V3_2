-- RC3.4.9.4: read the actual leave request type (FULL_DAY/PARTIAL).
-- Historical legacy coverage without a linked approved request remains UNKNOWN.
-- This additive RPC does not weaken RLS or expose individual reasons publicly.
begin;
create or replace function public.ejadwal_teacher_leave_profile_v2(
  p_teacher_id uuid, p_date_start date, p_date_end date
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_base jsonb;
  v_units jsonb;
begin
  -- V1 enforces staff role, teacher identity and date range. Repeat the staff
  -- guard explicitly so future refactors of V1 cannot bypass this check.
  if auth.uid() is null or not public.current_user_is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;
  v_base := public.ejadwal_teacher_leave_profile_v1(p_teacher_id, p_date_start, p_date_end);
  select coalesce(jsonb_agg(u.value || jsonb_build_object('request_type',
    case when u.value->>'source' = 'APPROVED' then
      coalesce((select case when lr.request_type in ('FULL_DAY','PARTIAL') then lr.request_type else 'UNKNOWN' end
        from public.leave_request_periods lp
        join public.leave_requests lr on lr.id = lp.leave_request_id
        where lr.teacher_id = p_teacher_id and lr.status = 'APPROVED'
          and lp.schedule_date = (u.value->>'date')::date
          and lp.period = (u.value->>'period')::integer
        order by lr.decided_at desc nulls last, lr.created_at desc limit 1), 'UNKNOWN')
    else 'UNKNOWN' end
  ) order by (u.value->>'date'),(u.value->>'period')::integer), '[]'::jsonb)
  into v_units
  from jsonb_array_elements(coalesce(v_base->'units', '[]'::jsonb)) as u(value);
  return jsonb_set(v_base, '{units}', v_units, true);
end;
$$;
revoke all on function public.ejadwal_teacher_leave_profile_v2(uuid,date,date) from public,anon;
grant execute on function public.ejadwal_teacher_leave_profile_v2(uuid,date,date) to authenticated;
commit;
