import { requireSupabaseClient } from '../supabase/client';

import type { ApprovedLeavePeriodAvailability } from '../../domain/inval/recommendationPerformance';

export async function loadApprovedLeavePeriodsForDate(date: string): Promise<ApprovedLeavePeriodAvailability[]> {
  const client = requireSupabaseClient();
  const {data, error} = await client.from('leave_request_periods')
    .select('schedule_date,period,leave_requests!inner(teacher_id,status,deleted_at)')
    .eq('schedule_date',date)
    .eq('leave_requests.status','APPROVED')
    .is('leave_requests.deleted_at',null);
  if (error) throw new Error(`Gagal memuat JP izin APPROVED: ${error.message}`);
  return (data || []).flatMap((row: any) => {
    const request = Array.isArray(row.leave_requests) ? row.leave_requests[0] : row.leave_requests;
    if (!request?.teacher_id) return [];
    return [{teacherId:String(request.teacher_id), date:String(row.schedule_date), period:Number(row.period)}];
  });
}
