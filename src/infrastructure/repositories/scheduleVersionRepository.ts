import { requireSupabaseClient } from "../supabase/client";

export interface ScheduleVersionRow {
  versionId: string;
  versionNo: number;
  sourceAction: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actorUserId?: string | null;
  actorLabel: string;
  metadata: Record<string, unknown>;
  masterCount: number;
  activeIncidentalCount: number;
  activeCalendarCount: number;
  createdAt: string;
}

export interface ScheduleRollbackResult {
  rolledBackToVersionId: string;
  rolledBackToVersionNo: number;
  masterRowsRestored: number;
  incidentalsRestored: number;
  academicEventsRestored: number;
}

export class ScheduleVersionRepository {
  async listVersions(limit = 50): Promise<ScheduleVersionRow[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_list_schedule_versions_v1", {
      p_limit: Math.max(1, Math.min(Number(limit) || 50, 200)),
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      versionId: String(row.version_id || ""),
      versionNo: Number(row.version_no || 0),
      sourceAction: String(row.source_action || ""),
      sourceEntityType: row.source_entity_type ?? null,
      sourceEntityId: row.source_entity_id ?? null,
      actorUserId: row.actor_user_id ?? null,
      actorLabel: String(row.actor_label || "System"),
      metadata: (row.metadata && typeof row.metadata === "object") ? row.metadata : {},
      masterCount: Number(row.master_count || 0),
      activeIncidentalCount: Number(row.active_incidental_count || 0),
      activeCalendarCount: Number(row.active_calendar_count || 0),
      createdAt: String(row.created_at || ""),
    }));
  }

  async rollback(versionId: string, reason?: string): Promise<ScheduleRollbackResult> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_rollback_schedule_version_v1", {
      p_version_id: versionId,
      p_reason: reason || null,
    });
    if (error) throw error;
    const value = (data || {}) as any;
    return {
      rolledBackToVersionId: String(value.rolled_back_to_version_id || versionId),
      rolledBackToVersionNo: Number(value.rolled_back_to_version_no || 0),
      masterRowsRestored: Number(value.master_rows_restored || 0),
      incidentalsRestored: Number(value.incidentals_restored || 0),
      academicEventsRestored: Number(value.academic_events_restored || 0),
    };
  }
}
