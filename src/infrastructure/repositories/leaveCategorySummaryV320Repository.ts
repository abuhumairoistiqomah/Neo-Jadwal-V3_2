import { requireSupabaseClient } from '../supabase/client';
import { normalizeAbsenceCategory, type LeaveAbsenceCategory } from '../../domain/leaveClassificationV320';

export interface ManagementLeaveCategoryRow {
  category:LeaveAbsenceCategory;
  teachingJp:number;
  otherJp:number;
  totalJp:number;
  days:number;
  teachers:number;
}
/** Staff-only database aggregate; does not rely on keyword guesses. */
export class LeaveCategorySummaryV320Repository {
  async load(start:string,end:string,teacherId:string|null=null):Promise<ManagementLeaveCategoryRow[]> {
    const {data,error} = await requireSupabaseClient().rpc('ejadwal_leave_category_summary_v320', {
      p_date_start:start,p_date_end:end,p_teacher_id:teacherId,
    });
    if(error) throw new Error(`Kategori izin V3.20 belum tersedia: ${error.message}`);
    if(!Array.isArray(data)) throw new Error('Format rekap kategori izin tidak valid.');
    return data.map((row:Record<string,unknown>)=>({
      category:normalizeAbsenceCategory(row.category),
      teachingJp:Number(row.teaching_jp||0),otherJp:Number(row.other_jp||0),
      totalJp:Number(row.total_jp||0),days:Number(row.days||0),teachers:Number(row.teachers||0),
    }));
  }
}
