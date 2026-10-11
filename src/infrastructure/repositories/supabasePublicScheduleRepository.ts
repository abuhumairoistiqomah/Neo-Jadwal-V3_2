import { requireSupabaseClient } from "../supabase/client";
import type { ScheduleDataSnapshot, ScheduleReadRepository } from "./scheduleRepository";
import { mapRelationalScheduleRows, type RelationalScheduleRows } from "./supabaseScheduleMappers";
import { mapSubstituteConstraintRow, type SubstituteConstraintRow } from "./substituteConstraintMappers";
import type { SubstituteConstraint } from "../../domain/substituteAvailability";

/**
 * Guest/read-only runtime uses the same canonical schedule mapping as Admin.
 * PostgreSQL exposes only a sanitized projection through one RPC; the public RPC never opens the global teacher phone directory or leave reasons.
 * It exposes only dated contact fields on live current/future coverage slots.
 * Instructional tasks for current/future substitute slots remain available.
 * A failed request must never fall back to old data.
 */
export class SupabasePublicScheduleRepository implements ScheduleReadRepository {
  async loadPublicState(): Promise<{ snapshot: ScheduleDataSnapshot; constraints: SubstituteConstraint[] }> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_public_schedule_snapshot_v3");
    if (error) throw new Error(`Gagal memuat jadwal publik Supabase: ${error.message}`);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Respons jadwal publik Supabase tidak valid.");
    }
    const rows = data as unknown as RelationalScheduleRows;
    const required: (keyof RelationalScheduleRows)[] = [
      "teachers", "classes", "rooms", "scheduleMaster", "scheduleTeachers",
      "scheduleIncidentals", "incidentalTeacherOverrides", "academicEvents", "coverageSlots",
      "learningTasks", "taskResources",
    ];
    for (const key of required) {
      if (!Array.isArray(rows[key])) throw new Error(`Respons jadwal publik kehilangan ${key}.`);
    }
    const publicBlocks = (data as { normalTeachingBlocks?: unknown }).normalTeachingBlocks;
    if (!Array.isArray(publicBlocks)) {
      throw new Error("Respons jadwal publik kehilangan status tugas guru.");
    }
    return {
      snapshot: mapRelationalScheduleRows(rows),
      constraints: (publicBlocks as SubstituteConstraintRow[]).map(mapSubstituteConstraintRow),
    };
  }

  async loadSnapshot(): Promise<ScheduleDataSnapshot> {
    return (await this.loadPublicState()).snapshot;
  }
}
