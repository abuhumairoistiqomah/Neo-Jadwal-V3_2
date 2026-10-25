import { requireSupabaseClient } from '../supabase/client';
import { parseLeaveDayEvents, type LeaveDayEvent } from '../../domain/leaveDaysAnalyticsV320';
import { getErrorMessage } from '../../domain/errorMessage';
import { parseExpectedTeacherDays, type ExpectedTeacherDaysSummary } from '../../domain/expectedTeacherDaysV320';

/** Staff only; the RPC returns only category, teacher identity and date (never medical/reason text). */
export class ManagementLeaveDaysRepository {
  async loadExpectedDays(start: string, end: string): Promise<ExpectedTeacherDaysSummary> {
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_management_expected_teacher_days_v320', {
      p_date_start:start, p_date_end:end,
    });
    if(error) throw new Error(`Rasio hari izin belum tersedia. Pastikan migrasi RC1.6.1 sudah dipasang: ${getErrorMessage(error,'Gagal memuat kewajiban terjadwal.')}`);
    return parseExpectedTeacherDays(data);
  }
  async load(start: string, end: string): Promise<LeaveDayEvent[]> {
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_management_leave_days_v320', {
      p_date_start:start, p_date_end:end,
    });
    if (error) throw new Error(`Statistik hari izin V3.20 RC1.6 tidak tersedia. Pastikan migrasi terpasang: ${getErrorMessage(error,'Gagal memuat hari izin.')}`);
    return parseLeaveDayEvents(data);
  }
}
