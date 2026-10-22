import { requireSupabaseClient } from '../supabase/client';
import type { IndividualLeaveProfile } from '../../domain/teacherIndividualStatistics';
import { normalizeAbsenceCategory } from '../../domain/leaveClassificationV320';
import { getErrorMessage } from '../../domain/errorMessage';

export class TeacherIndividualStatisticsRepository {
  async load(teacherId: string, dateStart: string, dateEnd: string): Promise<IndividualLeaveProfile> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc('ejadwal_teacher_leave_profile_v320', {
      p_teacher_id: teacherId, p_date_start: dateStart, p_date_end: dateEnd,
    });
    if (error) throw new Error(getErrorMessage(error,'Gagal memuat statistik guru.'));
    const raw = data as Record<string, unknown> | null;
    if (!raw || !Array.isArray(raw.units)) throw new Error('Data statistik izin tidak valid.');
    return {
      teacherId:String(raw.teacher_id || teacherId), teacherName:String(raw.teacher_name || ''),
      dateStart:String(raw.date_start || dateStart), dateEnd:String(raw.date_end || dateEnd),
      units:raw.units.map((row: any) => ({
        date:String(row.date || ''),period:Number(row.period),
        periodType:row.period_type === 'FREE' ? 'FREE' as const : 'TEACHING' as const,
        reason:String(row.reason || ''),source:String(row.source || ''),
        absenceCategory:normalizeAbsenceCategory(row.absence_category),
        requestType:row.request_type === 'FULL_DAY' || row.request_type === 'PARTIAL' ? row.request_type : 'UNKNOWN',
      })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.period) && row.period>=0 && row.period<=6),
    };
  }
}
