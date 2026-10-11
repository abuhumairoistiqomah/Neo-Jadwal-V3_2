import type { InvalWriteBundle } from "../../domain/inval/invalWrite";
import { requireSupabaseClient } from "../supabase/client";
import type {
  AuditLogRow,
  InvalWriteRepository,
  InvalWriteResult,
  RecentOperationalCoverageRow,
} from "./invalWriteRepository";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeWriteResult(data: unknown): InvalWriteResult {
  const row = asObject(data);
  const slotIds = Array.isArray(row.coverage_slot_ids)
    ? row.coverage_slot_ids.map(String)
    : [];
  return {
    requestId: String(row.request_id || ""),
    coverageSlotIds: slotIds,
    roomIncidentalId: row.room_incidental_id ? String(row.room_incidental_id) : null,
  };
}

export class SupabaseInvalWriteRepository implements InvalWriteRepository {
  async saveBundle(bundle: InvalWriteBundle): Promise<InvalWriteResult> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_save_inval_bundle_v3", {
      p_rows: bundle.rows,
      p_room_incidental: bundle.room_incidental,
      p_override_note: bundle.override_note,
    });
    if (error) throw new Error(`Supabase gagal menyimpan Inval: ${error.message}`);
    return normalizeWriteResult(data);
  }

  async updateAssignment(input: {
    coverageSlotId: string;
    substituteTeacherId: string;
    taskText?: string;
    constraintIds?: string[];
    overrideNote?: string;
  }): Promise<{ coverageSlotId: string; requestId: string }> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_update_inval_assignment", {
      p_coverage_slot_id: input.coverageSlotId,
      p_substitute_teacher_id: input.substituteTeacherId,
      p_task_text: input.taskText ?? "",
      p_constraint_ids: input.constraintIds ?? [],
      p_override_note: input.overrideNote ?? null,
    });
    if (error) throw new Error(`Supabase gagal memperbarui Inval: ${error.message}`);
    const row = asObject(data);
    return {
      coverageSlotId: String(row.coverage_slot_id || input.coverageSlotId),
      requestId: String(row.request_id || ""),
    };
  }

  /** Change only the substitute; tasks, resources and absence remain untouched. */
  async replaceSubstitute(input: {
    coverageSlotId: string;
    substituteTeacherId: string;
    constraintIds?: string[];
    overrideNote?: string;
  }): Promise<{ coverageSlotId: string; requestId: string }> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_replace_inval_substitute_v1", {
      p_coverage_slot_id: input.coverageSlotId,
      p_substitute_teacher_id: input.substituteTeacherId,
      p_constraint_ids: input.constraintIds ?? [],
      p_override_note: input.overrideNote ?? null,
    });
    if (error) throw new Error(`Gagal mengganti guru badal: ${error.message}`);
    const row = asObject(data);
    return {
      coverageSlotId: String(row.coverage_slot_id || input.coverageSlotId),
      requestId: String(row.request_id || ""),
    };
  }

  async deleteAssignment(input: {
    coverageSlotId: string;
    deleteNote?: string;
  }): Promise<{ coverageSlotId: string; requestId: string }> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_delete_inval_assignment", {
      p_coverage_slot_id: input.coverageSlotId,
      p_delete_note: input.deleteNote ?? null,
    });
    if (error) throw new Error(`Supabase gagal menghapus Inval: ${error.message}`);
    const row = asObject(data);
    return {
      coverageSlotId: String(row.coverage_slot_id || input.coverageSlotId),
      requestId: String(row.request_id || ""),
    };
  }

  async listRecentOperationalCoverage(limit = 20): Promise<RecentOperationalCoverageRow[]> {
    const client = requireSupabaseClient();
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const { data, error } = await client
      .from("coverage_slots")
      .select("id,source,status,created_at")
      .neq("source", "LEGACY_IMPORT")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw new Error(`Gagal membaca coverage operasional: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      id: String(row.id),
      source: String(row.source || ""),
      status: String(row.status || ""),
      createdAt: String(row.created_at || ""),
    }));
  }

  async listRecentAuditLogs(limit = 20): Promise<AuditLogRow[]> {
    const client = requireSupabaseClient();
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const { data, error } = await client
      .from("audit_logs")
      .select("id,actor_user_id,action,entity_type,entity_id,request_id,created_at")
      .in("entity_type", ["coverage_slot", "schedule_incidental", "coverage_constraint_override"])
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw new Error(`Gagal membaca audit Inval: ${error.message}`);
    return (data ?? []).map((row: any) => ({
      id: Number(row.id),
      actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
      action: String(row.action || ""),
      entityType: String(row.entity_type || ""),
      entityId: String(row.entity_id || ""),
      requestId: row.request_id ? String(row.request_id) : null,
      createdAt: String(row.created_at || ""),
    }));
  }
}
