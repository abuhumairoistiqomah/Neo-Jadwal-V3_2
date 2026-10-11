import { requireSupabaseClient } from "../supabase/client";
import type {
  ScheduleImportTeacherAlias,
  ScheduleImportTeacherMaster,
  ScheduleImportClassMaster,
} from "../../domain/scheduleImport";
import type { AdminRoomRow } from "./adminMasterDataRepository";

export interface ScheduleAdminContext {
  teachers: ScheduleImportTeacherMaster[];
  classes: ScheduleImportClassMaster[];
  rooms: AdminRoomRow[];
  aliases: ScheduleImportTeacherAlias[];
}

export interface ScheduleMasterEditInput {
  scheduleIds: string[];
  classId?: string | null;
  dayOfWeek: number;
  period: number;
  startTime: string;
  endTime: string;
  subject: string;
  roomId?: string | null;
  isCombined: boolean;
  classMode?: "NORMAL" | "COMBINED" | "ALTERNATING";
  teacherIds: string[];
  teacherNames: string[];
  specialNote?: string | null;
  allowTeacherConflict?: boolean;
}


export interface ScheduleIncidentalEditInput {
  incidentalId?: string | null;
  scheduleDate: string;
  classId: string;
  period: number;
  kind: "OVERRIDE" | "ADDITIONAL";
  subject: string;
  roomId?: string | null;
  isCombined: boolean;
  classMode?: "NORMAL" | "COMBINED" | "ALTERNATING";
  teacherIds: string[];
  teacherNames: string[];
  specialNote?: string | null;
  reason?: string | null;
  incidentalType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allowTeacherConflict?: boolean;
}

export class ScheduleAdminRepository {
  async loadContext(): Promise<ScheduleAdminContext> {
    const client = requireSupabaseClient();
    const [teachers, classes, rooms, aliases] = await Promise.all([
      client.from("teachers").select("id,full_name,short_name,legacy_name,is_active,gender").order("full_name"),
      client.from("classes").select("id,code,display_name,is_active").order("display_name"),
      client.from("rooms").select("*").order("name"),
      client.from("schedule_teacher_aliases").select("alias,teacher_id").order("alias"),
    ]);
    if (teachers.error) throw teachers.error;
    if (classes.error) throw classes.error;
    if (rooms.error) throw rooms.error;
    if (aliases.error) throw aliases.error;
    return {
      teachers: (teachers.data || []) as ScheduleImportTeacherMaster[],
      classes: (classes.data || []) as ScheduleImportClassMaster[],
      rooms: (rooms.data || []) as AdminRoomRow[],
      aliases: (aliases.data || []) as ScheduleImportTeacherAlias[],
    };
  }

  async saveTeacherAliases(mappings: Array<{ alias: string; teacherId: string }>): Promise<void> {
    if (!mappings.length) return;
    const client = requireSupabaseClient();
    for (const mapping of mappings) {
      const { error } = await client.rpc("ejadwal_upsert_schedule_teacher_alias", {
        p_alias: mapping.alias,
        p_teacher_id: mapping.teacherId,
      });
      if (error) throw error;
    }
  }

  async publishImport(args: {
    rows: unknown[];
    sourceFile: string;
    sourceSheet?: string;
    mode?: "REPLACE_ACTIVE" | "MERGE";
  }): Promise<{ batch_id?: string; inserted?: number; deactivated?: number }> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_publish_schedule_import_v1", {
      p_rows: args.rows,
      p_source_file: args.sourceFile,
      p_source_sheet: args.sourceSheet || "ori",
      p_mode: args.mode || "REPLACE_ACTIVE",
    });
    if (error) throw error;
    return (data || {}) as { batch_id?: string; inserted?: number; deactivated?: number };
  }

  async publishSyaikhRotation(args: {
    rows: Array<{
      scheduleDate: string;
      classId: string;
      period: number;
      subject: string;
      isCombined: boolean;
      teacherIds: string[];
      teacherNames: string[];
      specialNote?: string | null;
      reason?: string | null;
      rotationStatus: "NATIVE" | "NORMAL";
      sourceCell?: string;
      groupKey?: string;
    }>;
    sourceFile?: string;
    sourceSheet?: string;
    allowTeacherConflict?: boolean;
  }): Promise<{ batch_id?: string; published?: number; native_rows?: number; normal_rows?: number }> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_publish_syaikh_rotation_v1", {
      p_rows: args.rows.map((row) => ({
        schedule_date: row.scheduleDate,
        class_id: row.classId,
        period: row.period,
        subject: row.subject,
        is_combined: row.isCombined,
        teacher_ids: row.teacherIds,
        teacher_names: row.teacherNames,
        special_note: row.specialNote || null,
        reason: row.reason || null,
        rotation_status: row.rotationStatus,
        source_cell: row.sourceCell || null,
        group_key: row.groupKey || null,
      })),
      p_source_file: args.sourceFile || null,
      p_source_sheet: args.sourceSheet || null,
      p_allow_teacher_conflict: Boolean(args.allowTeacherConflict),
    });
    if (error) throw error;
    return (data || {}) as { batch_id?: string; published?: number; native_rows?: number; normal_rows?: number };
  }

  async upsertScheduleIncidentalSession(args: {
    rows: Array<{ incidentalId?: string | null; classId: string; period: number }>;
    scheduleDate: string;
    kind: "OVERRIDE" | "ADDITIONAL";
    subject: string;
    roomId?: string | null;
    isCombined: boolean;
    classMode?: "NORMAL" | "COMBINED" | "ALTERNATING";
    teacherIds: string[];
    teacherNames: string[];
    specialNote?: string | null;
    reason?: string | null;
    incidentalType?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    allowTeacherConflict?: boolean;
  }): Promise<string[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_upsert_schedule_incidental_session_v3", {
      p_rows: args.rows.map((row) => ({ incidental_id: row.incidentalId || null, class_id: row.classId, period: row.period })),
      p_schedule_date: args.scheduleDate,
      p_kind: args.kind,
      p_subject: args.subject,
      p_room_id: args.roomId || null,
      p_is_combined: args.isCombined,
      p_class_mode: args.classMode || (args.isCombined ? "COMBINED" : "NORMAL"),
      p_teacher_ids: args.teacherIds,
      p_teacher_names: args.teacherNames,
      p_special_note: args.specialNote || null,
      p_reason: args.reason || null,
      p_incidental_type: args.incidentalType || null,
      p_start_time: args.startTime || null,
      p_end_time: args.endTime || null,
      p_allow_teacher_conflict: Boolean(args.allowTeacherConflict),
    });
    if (error) throw error;
    return Array.isArray(data) ? data.map(String) : [];
  }

  async upsertScheduleIncidental(input: ScheduleIncidentalEditInput): Promise<string> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_upsert_schedule_incidental_v3", {
      p_incidental_id: input.incidentalId || null,
      p_schedule_date: input.scheduleDate,
      p_class_id: input.classId,
      p_period: input.period,
      p_kind: input.kind,
      p_subject: input.subject,
      p_room_id: input.roomId || null,
      p_is_combined: input.isCombined,
      p_class_mode: input.classMode || (input.isCombined ? "COMBINED" : "NORMAL"),
      p_teacher_ids: input.teacherIds,
      p_teacher_names: input.teacherNames,
      p_special_note: input.specialNote || null,
      p_reason: input.reason || null,
      p_incidental_type: input.incidentalType || null,
      p_start_time: input.startTime || null,
      p_end_time: input.endTime || null,
      p_allow_teacher_conflict: Boolean(input.allowTeacherConflict),
    });
    if (error) throw error;
    return String(data || "");
  }

  async deleteScheduleIncidental(incidentalId: string, reason?: string): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client.rpc("ejadwal_delete_schedule_incidental_v1", {
      p_incidental_id: incidentalId,
      p_reason: reason || null,
    });
    if (error) throw error;
  }

  /** Atomic date-specific room edit: never updates schedule_master. */
  async relocateRoomForDate(input: {
    scheduleDate: string;
    period: number;
    classIds: string[];
    roomId: string;
    reason: string;
  }): Promise<number> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_relocate_room_date_v1", {
      p_schedule_date: input.scheduleDate,
      p_period: input.period,
      p_class_ids: input.classIds,
      p_room_id: input.roomId,
      p_reason: input.reason,
    });
    if (error) throw error;
    return Number(data || 0);
  }

  /** Creates a date-specific additional session and claims a room in one transaction. */
  async addRoomSessionForDate(input: {
    scheduleDate: string;
    period: number;
    classId: string;
    subject: string;
    roomId: string;
    teacherIds: string[];
    teacherNames: string[];
    reason: string;
    allowTeacherConflict?: boolean;
  }): Promise<string> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_add_room_session_date_v1", {
      p_schedule_date: input.scheduleDate,
      p_period: input.period,
      p_class_id: input.classId,
      p_subject: input.subject,
      p_room_id: input.roomId,
      p_teacher_ids: input.teacherIds,
      p_teacher_names: input.teacherNames,
      p_reason: input.reason,
      p_allow_teacher_conflict: Boolean(input.allowTeacherConflict),
    });
    if (error) throw error;
    return String(data || "");
  }

  async updateScheduleMaster(input: ScheduleMasterEditInput): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client.rpc("ejadwal_update_schedule_master_v4", {
      p_schedule_ids: input.scheduleIds,
      p_class_id: input.classId || null,
      p_day_of_week: input.dayOfWeek,
      p_period: input.period,
      p_start_time: input.startTime || null,
      p_end_time: input.endTime || null,
      p_subject: input.subject,
      p_room_id: input.roomId || null,
      p_is_combined: input.isCombined,
      p_class_mode: input.classMode || (input.isCombined ? "COMBINED" : "NORMAL"),
      p_teacher_ids: input.teacherIds,
      p_teacher_names: input.teacherNames,
      p_special_note: input.specialNote || null,
      p_allow_teacher_conflict: Boolean(input.allowTeacherConflict),
    });
    if (error) throw error;
  }
}
