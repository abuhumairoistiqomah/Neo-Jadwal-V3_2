import { normalizeManagementAnalyticsPayload, type ManagementAnalyticsPayload } from "../../domain/managementAnalytics";
import { requireSupabaseClient } from "../supabase/client";
import { getErrorMessage } from "../../domain/errorMessage";

export class ManagementAnalyticsRepository {
  async load(dateStart: string, dateEnd: string): Promise<ManagementAnalyticsPayload> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_management_analytics_v1", {
      p_date_start: dateStart,
      p_date_end: dateEnd,
    });
    if (error) throw new Error(getErrorMessage(error, "Analytics Supabase gagal dimuat."));
    return normalizeManagementAnalyticsPayload(data || {});
  }
}
