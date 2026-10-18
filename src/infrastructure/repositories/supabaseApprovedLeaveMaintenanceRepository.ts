import { requireSupabaseClient } from '../supabase/client';
import { explainApprovedLeaveDatabaseError } from '../../domain/approvedLeaveMaintenance';

export interface ApprovedLeaveCoverage {
  id: string;
  scheduleDate: string;
  period: number;
  className: string;
  subject: string;
  substitute: string;
  status: string;
  deleted: boolean;
}
export interface ApprovedLeavePeriod { date: string; period: number; type: string }
export interface ApprovedLeaveTask { period: number; description: string }
export interface ApprovedLeaveEntry {
  id: string;
  code: string;
  teacher: string;
  dateStart: string;
  dateEnd: string;
  reason: string;
  detail: string;
  decidedAt: string;
  status: string;
  deleted: boolean;
  slots: ApprovedLeaveCoverage[];
  periods: ApprovedLeavePeriod[];
  tasks: ApprovedLeaveTask[];
}

export class SupabaseApprovedLeaveMaintenanceRepository {
  async list(limit = 250): Promise<ApprovedLeaveEntry[]> {
    const client = requireSupabaseClient();
    const {data: leaves,error} = await client.from('leave_requests')
      .select('id,teacher_id,date_start,date_end,reason,detail,status,request_code,decided_at,deleted_at,deleted_previous_status')
      .or('status.eq.APPROVED,deleted_at.not.is.null')
      .order('date_end',{ascending:false}).limit(Math.max(1,Math.min(500,limit)));
    if (error) throw new Error(`Gagal membaca pengajuan disetujui: ${explainApprovedLeaveDatabaseError(error.message)}`);
    const rows=(leaves||[]).filter((v: any)=>v.status==='APPROVED'||(v.deleted_at&&v.deleted_previous_status==='APPROVED'));
    if (!rows.length) return [];
    const ids=rows.map((r:any)=>String(r.id));
    const teacherIds=[...new Set(rows.map((r:any)=>String(r.teacher_id)).filter(Boolean))];
    const [teachers, coverage, periods, tasks] = await Promise.all([
      client.from('teachers').select('id,full_name').in('id',teacherIds),
      client.from('coverage_slots').select('id,leave_request_id,schedule_date,period,class_name_snapshot,subject_snapshot,substitute_teacher_name_snapshot,status,deleted_at').in('leave_request_id',ids).eq('source','LEAVE_WORKFLOW').order('period',{ascending:true}),
      client.from('leave_request_periods').select('leave_request_id,schedule_date,period,period_type').in('leave_request_id',ids),
      client.from('leave_request_tasks').select('leave_request_id,period,description').in('leave_request_id',ids),
    ]);
    for(const item of [teachers,coverage,periods,tasks]) if(item.error) throw new Error(`Gagal membaca detail izin: ${explainApprovedLeaveDatabaseError(item.error.message)}`);
    const names=new Map((teachers.data||[]).map((r:any)=>[String(r.id),String(r.full_name||'')]));
    return rows.map((r:any)=>({
      id:String(r.id), code:String(r.request_code||r.id),
      teacher:names.get(String(r.teacher_id))||'Guru tidak ditemukan',
      dateStart:String(r.date_start),dateEnd:String(r.date_end),
      reason:String(r.reason||''),detail:String(r.detail||''),decidedAt:String(r.decided_at||''),
      status:String(r.status),deleted:Boolean(r.deleted_at),
      slots:(coverage.data||[]).filter((v:any)=>v.leave_request_id===r.id).map((v:any)=>({
        id:String(v.id),scheduleDate:String(v.schedule_date),period:Number(v.period),
        className:String(v.class_name_snapshot||''),subject:String(v.subject_snapshot||''),
        substitute:String(v.substitute_teacher_name_snapshot||''),status:String(v.status||''),deleted:Boolean(v.deleted_at)
      })),
      periods:(periods.data||[]).filter((v:any)=>v.leave_request_id===r.id).map((v:any)=>({date:String(v.schedule_date),period:Number(v.period),type:String(v.period_type)})),
      tasks:(tasks.data||[]).filter((v:any)=>v.leave_request_id===r.id).map((v:any)=>({period:Number(v.period),description:String(v.description||'')})),
    }));
  }
  async moveTeachingPeriod(requestId:string,date:string,oldPeriod:number,newPeriod:number,note:string):Promise<number> {
    const {data,error}=await requireSupabaseClient().rpc('ejadwal_move_approved_leave_period_v1',{
      p_leave_request_id:requestId,p_schedule_date:date,p_old_period:oldPeriod,p_new_period:newPeriod,p_note:note,
    });
    if(error) throw new Error(`Koreksi JP ditolak: ${error.message}`);
    return Number((data as any)?.moved_coverage_rows||0);
  }
  async restore(requestId:string,note:string):Promise<void> {
    const {error}=await requireSupabaseClient().rpc('ejadwal_restore_approved_leave_v1',{
      p_leave_request_id:requestId,p_note:note,
    });
    if(error) throw new Error(`Pemulihan ditolak: ${error.message}`);
  }
  async softDelete(requestId:string,note:string):Promise<void> {
    const {error}=await requireSupabaseClient().rpc('ejadwal_soft_delete_approved_leave_v1',{
      p_leave_request_id:requestId,p_note:note,
    });
    if(error) throw new Error(`Gagal menyembunyikan pengajuan: ${error.message}`);
  }
}
