import {requireSupabaseClient} from '../supabase/client';
import {parseCanonicalTeacherActivity} from '../../domain/teacherOperationalStatisticsV319';

/** Reuse the staff-only V3.18 operational KPI source; no new SQL or duplicated formulas. */
export class TeacherOperationalStatisticsV319Repository {
  async load(teacherId:string,start:string,end:string) {
    const {data,error}=await requireSupabaseClient().rpc('ejadwal_teacher_effective_activity_v318',{
      p_date_start:start,p_date_end:end,
    });
    if(error)throw new Error(`Gagal memuat statistik JP resmi V3.18: ${error.message}`);
    return parseCanonicalTeacherActivity(data,teacherId);
  }
}
