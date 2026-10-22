import { mergeTeacherEffectiveActivity, normalizeManagementAnalyticsPayload, type ManagementAnalyticsPayload, parseManagementTeacherCategoryActivity, type ManagementTeacherCategoryActivity } from "../../domain/managementAnalytics";
import { requireSupabaseClient } from "../supabase/client";
import { getErrorMessage } from "../../domain/errorMessage";

export class ManagementAnalyticsRepository {
  async load(dateStart: string, dateEnd: string): Promise<ManagementAnalyticsPayload & { categoryActivity: ManagementTeacherCategoryActivity[] }> {
    const client = requireSupabaseClient();
    const [baseResult, activityResult, categoryActivityResult] = await Promise.all([
      client.rpc("ejadwal_management_analytics_v1", { p_date_start: dateStart, p_date_end: dateEnd }),
      client.rpc("ejadwal_teacher_effective_activity_v318", { p_date_start: dateStart, p_date_end: dateEnd }),
      client.rpc("ejadwal_leave_category_teacher_activity_v320", { p_date_start: dateStart, p_date_end: dateEnd }),
    ]);
    if (baseResult.error) throw new Error(getErrorMessage(baseResult.error, "Analytics Supabase gagal dimuat."));
    if (activityResult.error) throw new Error(
      `Metrik V3.18 belum tersedia. Pastikan migration 202610190001 telah berjalan: ${getErrorMessage(activityResult.error, "RPC gagal dimuat.")}`,
    );
    if (categoryActivityResult.error) throw new Error(
      `Kategori guru V3.20 RC1.2 belum tersedia. Jalankan migration RC1.2: ${getErrorMessage(categoryActivityResult.error, "RPC gagal dimuat.")}`,
    );
    return {
      ...mergeTeacherEffectiveActivity(normalizeManagementAnalyticsPayload(baseResult.data || {}), activityResult.data),
      categoryActivity:parseManagementTeacherCategoryActivity(categoryActivityResult.data),
    };
  }
}
