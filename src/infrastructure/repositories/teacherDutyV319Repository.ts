import {requireSupabaseClient} from '../supabase/client';
import type {DutyAssignmentInput,DutyEventInput,DutyScope,DutyRole} from '../../domain/teacherDutyV319';
export interface StoredDutyEvent {
  id:string;title:string;date_start:string;date_end:string;scope:DutyScope;notes:string;
  status:'ACTIVE'|'CANCELLED';created_at:string;updated_at:string;
}
export interface StoredDutyAssignment {
  id:string;event_id:string;teacher_id:string;duty_role:DutyRole;compensation_date:string|null;
}
export class TeacherDutyV319Repository {
  async list():Promise<{events:StoredDutyEvent[];assignments:StoredDutyAssignment[]}> {
    const client=requireSupabaseClient();
    const eventsResult=await client.from('ejadwal_teacher_duty_events_v319').select('id,title,date_start,date_end,scope,notes,status,created_at,updated_at').order('date_start',{ascending:false});
    if(eventsResult.error)throw new Error(`Gagal membaca penugasan RC2 (periksa migrasi): ${eventsResult.error.message}`);
    const assignmentsResult=await client.from('ejadwal_teacher_duty_assignments_v319').select('id,event_id,teacher_id,duty_role,compensation_date');
    if(assignmentsResult.error)throw new Error(`Gagal membaca daftar peserta RC2: ${assignmentsResult.error.message}`);
    return {events:(eventsResult.data||[]) as StoredDutyEvent[],assignments:(assignmentsResult.data||[]) as StoredDutyAssignment[]};
  }
  /** Date-scoped read for RC3 resolver. All memberships stay staff-only under RLS. */
  async listForDate(date:string):Promise<{events:StoredDutyEvent[];assignments:StoredDutyAssignment[]}> {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Tanggal penugasan tidak valid.');
    const client=requireSupabaseClient();
    // Event start/end is independent of each participant's compensatory date.
    const active=await client.from('ejadwal_teacher_duty_events_v319')
      .select('id,title,date_start,date_end,scope,notes,status,created_at,updated_at').eq('status','ACTIVE');
    if(active.error)throw new Error(`Status kegiatan RC3 tidak dapat dibaca: ${active.error.message}`);
    const assignment=await client.from('ejadwal_teacher_duty_assignments_v319')
      .select('id,event_id,teacher_id,duty_role,compensation_date');
    if(assignment.error)throw new Error(`Penugasan guru RC3 tidak dapat dibaca: ${assignment.error.message}`);
    const rows=(assignment.data||[]) as StoredDutyAssignment[];
    const selectedEvents=((active.data||[]) as StoredDutyEvent[]).filter(e=>
      (e.date_start<=date && e.date_end>=date) || rows.some(a=>a.event_id===e.id && a.compensation_date===date));
    const ids=new Set(selectedEvents.map(e=>e.id));
    return {events:selectedEvents,assignments:rows.filter(a=>ids.has(a.event_id))};
  }
  /** One atomic RPC; never persist a partial participant set. */
  async save(event:DutyEventInput,assignments:DutyAssignmentInput[],eventId:string|null):Promise<string> {
    const {data,error}=await requireSupabaseClient().rpc('ejadwal_save_teacher_duty_v319',{
      p_event_id:eventId,
      p_event:{title:event.title.trim(),date_start:event.dateStart,date_end:event.dateEnd,scope:event.scope,notes:event.notes.trim()},
      p_assignments:assignments.map(a=>({teacher_id:a.teacherId,duty_role:a.role,compensation_date:a.compensationDate}))
    });
    if(error)throw new Error(`Gagal menyimpan penugasan: ${error.message}`);
    return String(data);
  }
  async cancel(eventId:string):Promise<void> {
    const {error}=await requireSupabaseClient().rpc('ejadwal_cancel_teacher_duty_v319',{p_event_id:eventId});
    if(error)throw new Error(`Gagal membatalkan kegiatan: ${error.message}`);
  }
}
