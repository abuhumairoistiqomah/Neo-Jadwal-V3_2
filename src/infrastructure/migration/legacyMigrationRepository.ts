import { getCurrentUserContext } from "../auth/supabaseAuthRepository";
import { requireSupabaseClient } from "../supabase/client";
import { compareLegacyManagedTotals, type LegacyManagedTotals } from "./legacyMigrationVerification";
import {
  extractUrls,
  getDriveFileId,
  sanitizeLegacyPayload,
  type LegacyMigrationPlan,
  type LegacySourceSnapshot,
} from "./legacyMigration";

export interface MigrationProgress {
  phase: string;
  detail: string;
  completed: number;
  total: number;
}

export interface MigrationResultCounts {
  teachers: number;
  classes: number;
  rooms: number;
  roomUnavailability: number;
  schedules: number;
  scheduleTeachers: number;
  incidentals: number;
  incidentalTeacherOverrides: number;
  academicEvents: number;
  coverageSlots: number;
  learningTasks: number;
  taskResources: number;
}

export interface MigrationVerification {
  expected: MigrationResultCounts;
  actual: MigrationResultCounts;
  ok: boolean;
  differences: string[];
}

type ProgressCallback = (progress: MigrationProgress) => void;

const BATCH_SIZE = 150;

function chunks<T>(items: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function withMigrationQuery(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("migration", "1");
  return parsed.toString();
}

export async function fetchLegacyMigrationSource(apiUrl: string): Promise<LegacySourceSnapshot> {
  const target = apiUrl.trim();
  if (!/^https:\/\/script\.google\.com\//i.test(target)) {
    throw new Error("Source harus berupa Google Apps Script Web App URL (https://script.google.com/.../exec). ");
  }
  const response = await fetch(withMigrationQuery(target));
  if (!response.ok) throw new Error(`Legacy API HTTP ${response.status}`);
  const raw = await response.json();
  if (raw?.status === "error") throw new Error(String(raw.message || "Legacy API mengembalikan error."));
  return sanitizeLegacyPayload(raw);
}

async function requireAdmin(): Promise<void> {
  const context = await getCurrentUserContext();
  if (!context) throw new Error("Login Supabase diperlukan sebelum migrasi.");
  if (!context.roles.includes("ADMIN")) throw new Error("Migrasi hanya boleh dijalankan oleh ADMIN.");
}

async function deleteByIds(table: string, ids: string[]): Promise<void> {
  const client = requireSupabaseClient();
  for (const batch of chunks(ids)) {
    if (batch.length === 0) continue;
    const { error } = await client.from(table).delete().in("id", batch);
    if (error) throw new Error(`${table} stale cleanup: ${error.message}`);
  }
}

async function deleteStaleLegacyRows(table: string, keyColumn: string, currentKeys: string[]): Promise<void> {
  const client = requireSupabaseClient();
  const { data, error } = await client.from(table).select(`id,${keyColumn}`).not(keyColumn, "is", null);
  if (error) throw new Error(`${table} stale scan: ${error.message}`);
  const keep = new Set(currentKeys);
  // Dynamic select columns confuse supabase-js' compile-time parser even though
  // the runtime payload is a normal row object. Narrow once at this boundary.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const staleIds = rows
    .filter((row) => !keep.has(String(row[keyColumn] ?? "")))
    .map((row) => String(row.id));
  await deleteByIds(table, staleIds);
}

async function upsertTeachers(plan: LegacyMigrationPlan): Promise<Map<string, string>> {
  const client = requireSupabaseClient();
  const { data: existing, error: existingError } = await client
    .from("teachers")
    .select("id,full_name,legacy_row_id");
  if (existingError) throw new Error(`teachers existing scan: ${existingError.message}`);

  const byLegacy = new Map<string, { id: string; full_name: string }>();
  const byName = new Map<string, { id: string; full_name: string }>();
  for (const row of existing || []) {
    if (row.legacy_row_id) byLegacy.set(String(row.legacy_row_id), { id: String(row.id), full_name: String(row.full_name) });
    byName.set(normalizedName(String(row.full_name)), { id: String(row.id), full_name: String(row.full_name) });
  }

  for (const teacher of plan.teachers) {
    const payload = {
      full_name: teacher.fullName,
      short_name: teacher.shortName,
      gender: teacher.gender,
      whatsapp_e164: teacher.whatsappE164,
      primary_subjects_text: teacher.primarySubjectsText,
      subject_cluster: teacher.subjectCluster,
      levels_text: teacher.levelsText,
      additional_task: teacher.additionalTask,
      notes: teacher.notes,
      legacy_name: teacher.fullName,
      legacy_row_id: teacher.legacyRowId,
      is_active: true,
    };
    const match = byLegacy.get(teacher.legacyRowId) || byName.get(normalizedName(teacher.fullName));
    if (match) {
      const { error } = await client.from("teachers").update(payload).eq("id", match.id);
      if (error) throw new Error(`teacher ${teacher.fullName}: ${error.message}`);
    } else {
      const { data, error } = await client.from("teachers").insert(payload).select("id").single();
      if (error) throw new Error(`teacher ${teacher.fullName}: ${error.message}`);
      byName.set(normalizedName(teacher.fullName), { id: String(data.id), full_name: teacher.fullName });
      byLegacy.set(teacher.legacyRowId, { id: String(data.id), full_name: teacher.fullName });
    }
  }

  const sourceLegacyIds = new Set(plan.teachers.map((row) => row.legacyRowId));
  const staleIds = (existing || [])
    .filter((row) => row.legacy_row_id && !sourceLegacyIds.has(String(row.legacy_row_id)))
    .map((row) => String(row.id));
  for (const batch of chunks(staleIds)) {
    const { error } = await client.from("teachers").update({ is_active: false }).in("id", batch);
    if (error) throw new Error(`teachers stale deactivate: ${error.message}`);
  }

  const { data: finalRows, error: finalError } = await client.from("teachers").select("id,full_name");
  if (finalError) throw new Error(`teachers final scan: ${finalError.message}`);
  return new Map((finalRows || []).map((row) => [normalizedName(String(row.full_name)), String(row.id)]));
}

async function upsertClasses(plan: LegacyMigrationPlan): Promise<Map<string, string>> {
  const client = requireSupabaseClient();
  for (const batch of chunks(plan.classes)) {
    const payload = batch.map((row) => ({
      code: row.code,
      display_name: row.displayName,
      gender: row.gender,
      grade_level: row.gradeLevel,
      program: row.program,
      is_active: true,
    }));
    const { error } = await client.from("classes").upsert(payload, { onConflict: "code" });
    if (error) throw new Error(`classes: ${error.message}`);
  }
  const { data, error } = await client.from("classes").select("id,code");
  if (error) throw new Error(`classes scan: ${error.message}`);
  return new Map((data || []).map((row) => [String(row.code), String(row.id)]));
}

async function upsertRooms(plan: LegacyMigrationPlan): Promise<void> {
  const client = requireSupabaseClient();
  for (const batch of chunks(plan.rooms)) {
    const payload = batch.map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      capacity: row.capacity,
      location: row.location,
      room_type: row.roomType,
      status: row.status,
    }));
    const { error } = await client.from("rooms").upsert(payload, { onConflict: "id" });
    if (error) throw new Error(`rooms: ${error.message}`);
  }
}

async function importRoomUnavailability(plan: LegacyMigrationPlan): Promise<number> {
  const client = requireSupabaseClient();
  await deleteStaleLegacyRows(
    "room_unavailability",
    "legacy_row_id",
    plan.roomUnavailability.map((row) => row.legacyRowId),
  );
  for (const batch of chunks(plan.roomUnavailability)) {
    const payload = batch.map((row) => ({
      room_id: row.roomId,
      date_start: row.dateStart,
      date_end: row.dateEnd,
      period_start: row.periodStart,
      period_end: row.periodEnd,
      reason: row.reason,
      note: row.note,
      legacy_incidental_type: row.incidentalType,
      source: "LEGACY_INCIDENTAL",
      status: "ACTIVE",
      legacy_row_id: row.legacyRowId,
      created_by: null,
      deleted_at: null,
      deleted_by: null,
    }));
    const { error } = await client.from("room_unavailability").upsert(payload, { onConflict: "legacy_row_id" });
    if (error) throw new Error(`room_unavailability: ${error.message}`);
  }
  return plan.roomUnavailability.length;
}

async function importSchedules(
  plan: LegacyMigrationPlan,
  classIds: Map<string, string>,
  teacherIds: Map<string, string>,
): Promise<{ scheduleCount: number; teacherCount: number }> {
  const client = requireSupabaseClient();
  await deleteStaleLegacyRows("schedule_master", "legacy_row_id", plan.schedules.map((row) => row.legacyRowId));

  const scheduleIdByLegacy = new Map<string, string>();
  for (const batch of chunks(plan.schedules)) {
    const payload = batch.map((row) => ({
      class_id: classIds.get(row.classCode),
      day_of_week: row.dayOfWeek,
      period: row.period,
      start_time: row.startTime,
      end_time: row.endTime,
      subject: row.subject,
      room_id: row.roomId,
      is_combined: row.isCombined,
      class_mode: row.classMode,
      other_teachers_supervise: row.otherTeachersSupervise,
      special_note: row.specialNote,
      is_active: true,
      legacy_row_id: row.legacyRowId,
      deleted_at: null,
      deleted_by: null,
    }));
    const { data, error } = await client
      .from("schedule_master")
      .upsert(payload, { onConflict: "legacy_row_id" })
      .select("id,legacy_row_id");
    if (error) throw new Error(`schedule_master: ${error.message}`);
    for (const row of data || []) scheduleIdByLegacy.set(String(row.legacy_row_id), String(row.id));
  }

  const scheduleIds = [...scheduleIdByLegacy.values()];
  for (const batch of chunks(scheduleIds)) {
    const { error } = await client.from("schedule_master_teachers").delete().in("schedule_id", batch);
    if (error) throw new Error(`schedule_master_teachers reset: ${error.message}`);
  }

  const teacherRows: Record<string, unknown>[] = [];
  for (const row of plan.schedules) {
    const scheduleId = scheduleIdByLegacy.get(row.legacyRowId);
    if (!scheduleId) continue;
    row.teacherNames.forEach((name, index) => {
      if (!name) return;
      teacherRows.push({
        schedule_id: scheduleId,
        position: index + 1,
        teacher_id: teacherIds.get(normalizedName(name)) || null,
        teacher_name_snapshot: name,
      });
    });
  }
  for (const batch of chunks(teacherRows)) {
    const { error } = await client.from("schedule_master_teachers").insert(batch);
    if (error) throw new Error(`schedule_master_teachers: ${error.message}`);
  }
  return { scheduleCount: plan.schedules.length, teacherCount: teacherRows.length };
}

async function importIncidentals(
  plan: LegacyMigrationPlan,
  classIds: Map<string, string>,
  teacherIds: Map<string, string>,
): Promise<{ incidentalCount: number; teacherOverrideCount: number }> {
  const client = requireSupabaseClient();
  await deleteStaleLegacyRows("schedule_incidentals", "legacy_row_id", plan.incidentals.map((row) => row.legacyRowId));
  const incidentalIdByLegacy = new Map<string, string>();
  for (const batch of chunks(plan.incidentals)) {
    const payload = batch.map((row) => ({
      schedule_date: row.scheduleDate,
      class_id: classIds.get(row.classCode),
      period: row.period,
      kind: row.kind,
      override_subject: row.overrideSubject,
      override_room_id: row.overrideRoomId,
      override_is_combined: row.overrideClassMode == null ? null : row.overrideClassMode === "COMBINED",
      override_class_mode: row.overrideClassMode,
      override_special_note: row.overrideSpecialNote,
      reason: row.reason,
      incidental_type: row.incidentalType,
      legacy_row_id: row.legacyRowId,
      deleted_at: null,
      deleted_by: null,
    }));
    const { data, error } = await client
      .from("schedule_incidentals")
      .upsert(payload, { onConflict: "legacy_row_id" })
      .select("id,legacy_row_id");
    if (error) throw new Error(`schedule_incidentals: ${error.message}`);
    for (const row of data || []) incidentalIdByLegacy.set(String(row.legacy_row_id), String(row.id));
  }

  const ids = [...incidentalIdByLegacy.values()];
  for (const batch of chunks(ids)) {
    const { error } = await client.from("schedule_incidental_teacher_overrides").delete().in("incidental_id", batch);
    if (error) throw new Error(`incidental teacher reset: ${error.message}`);
  }

  const teacherRows: Record<string, unknown>[] = [];
  for (const row of plan.incidentals) {
    const incidentalId = incidentalIdByLegacy.get(row.legacyRowId);
    if (!incidentalId) continue;
    row.teacherNames.forEach((name, index) => {
      // Blank means INHERIT. Do NOT emit CLEAR.
      if (!name) return;
      teacherRows.push({
        incidental_id: incidentalId,
        position: index + 1,
        action: "SET",
        teacher_id: teacherIds.get(normalizedName(name)) || null,
        teacher_name_snapshot: name,
      });
    });
  }
  for (const batch of chunks(teacherRows)) {
    const { error } = await client.from("schedule_incidental_teacher_overrides").insert(batch);
    if (error) throw new Error(`schedule_incidental_teacher_overrides: ${error.message}`);
  }
  return { incidentalCount: plan.incidentals.length, teacherOverrideCount: teacherRows.length };
}

async function importAcademicEvents(plan: LegacyMigrationPlan, classIds: Map<string, string>): Promise<number> {
  const client = requireSupabaseClient();
  await deleteStaleLegacyRows("academic_events", "legacy_row_id", plan.academicEvents.map((row) => row.legacyRowId));
  for (const batch of chunks(plan.academicEvents)) {
    const payload = batch.map((row) => ({
      legacy_row_id: row.legacyRowId,
      legacy_event_code: row.legacyEventCode,
      date_start: row.dateStart,
      date_end: row.dateEnd,
      event_name: row.eventName,
      event_type: row.eventType,
      scope: row.scope,
      class_id: row.classCode ? classIds.get(row.classCode) : null,
      period_start: row.periodStart,
      period_end: row.periodEnd,
      status: row.status,
    }));
    const { error } = await client.from("academic_events").upsert(payload, { onConflict: "legacy_row_id" });
    if (error) throw new Error(`academic_events: ${error.message}`);
  }
  return plan.academicEvents.length;
}

async function importCoverage(
  plan: LegacyMigrationPlan,
  classIds: Map<string, string>,
  teacherIds: Map<string, string>,
): Promise<{ coverageCount: number; learningTaskCount: number; taskResourceCount: number }> {
  const client = requireSupabaseClient();
  await deleteStaleLegacyRows("coverage_slots", "legacy_log_id", plan.coverage.map((row) => row.legacyLogId));
  const coverageIdByLegacy = new Map<string, string>();

  for (const batch of chunks(plan.coverage)) {
    const payload = batch.map((row) => ({
      leave_request_id: null,
      schedule_date: row.scheduleDate,
      class_id: row.classCode ? classIds.get(row.classCode) || null : null,
      class_name_snapshot: row.classCode,
      period: row.period,
      subject_snapshot: row.subjectSnapshot,
      absent_teacher_id: teacherIds.get(normalizedName(row.absentTeacherName)) || null,
      absent_teacher_name_snapshot: row.absentTeacherName,
      substitute_teacher_id: row.substituteTeacherName ? teacherIds.get(normalizedName(row.substituteTeacherName)) || null : null,
      substitute_teacher_name_snapshot: row.substituteTeacherName,
      reason_snapshot: row.reasonSnapshot,
      status: row.status,
      source: "LEGACY_IMPORT",
      schedule_master_id: null,
      schedule_incidental_id: null,
      assigned_by: null,
      // Legacy sheet does not preserve assignment timestamp; do not invent one.
      assigned_at: null,
      legacy_log_id: row.legacyLogId,
      deleted_at: null,
      deleted_by: null,
    }));
    const { data, error } = await client
      .from("coverage_slots")
      .upsert(payload, { onConflict: "legacy_log_id" })
      .select("id,legacy_log_id");
    if (error) throw new Error(`coverage_slots: ${error.message}`);
    for (const row of data || []) coverageIdByLegacy.set(String(row.legacy_log_id), String(row.id));
  }

  const importedCoverageIds = [...coverageIdByLegacy.values()];
  if (importedCoverageIds.length > 0) {
    for (const batch of chunks(importedCoverageIds)) {
      const { data: taskRows, error: taskScanError } = await client.from("learning_tasks").select("id").in("coverage_slot_id", batch);
      if (taskScanError) throw new Error(`learning_tasks scan: ${taskScanError.message}`);
      await deleteByIds("learning_tasks", (taskRows || []).map((row) => String(row.id)));
    }
  }

  let learningTaskCount = 0;
  let taskResourceCount = 0;
  for (const row of plan.coverage) {
    if (!row.taskText) continue;
    const coverageSlotId = coverageIdByLegacy.get(row.legacyLogId);
    if (!coverageSlotId) continue;
    const { data: task, error: taskError } = await client
      .from("learning_tasks")
      .insert({ coverage_slot_id: coverageSlotId, description: row.taskText, created_by: null })
      .select("id")
      .single();
    if (taskError) throw new Error(`learning_task ${row.legacyLogId}: ${taskError.message}`);
    learningTaskCount += 1;

    const resourceRows = extractUrls(row.taskText).map((url, index) => {
      const driveId = getDriveFileId(url);
      return {
        task_id: task.id,
        resource_type: driveId ? "DRIVE_FILE" : "LINK",
        label: `Legacy link ${index + 1}`,
        url,
        drive_file_id: driveId,
        file_name: null,
        mime_type: null,
      };
    });
    if (resourceRows.length > 0) {
      const { error } = await client.from("task_resources").insert(resourceRows);
      if (error) throw new Error(`task_resources ${row.legacyLogId}: ${error.message}`);
      taskResourceCount += resourceRows.length;
    }
  }
  return { coverageCount: plan.coverage.length, learningTaskCount, taskResourceCount };
}

export async function runLegacyMigration(
  plan: LegacyMigrationPlan,
  onProgress: ProgressCallback = () => undefined,
): Promise<MigrationResultCounts> {
  await requireAdmin();
  if (plan.issues.some((issue) => issue.severity === "BLOCKING")) {
    throw new Error("Migration plan masih memiliki BLOCKING issue. Perbaiki source Spreadsheet lalu fetch ulang.");
  }

  const phases = 8;
  onProgress({ phase: "teachers", detail: "Upsert Master Guru", completed: 0, total: phases });
  const teacherIds = await upsertTeachers(plan);

  onProgress({ phase: "classes", detail: "Upsert kelas hasil derivasi", completed: 1, total: phases });
  const classIds = await upsertClasses(plan);

  onProgress({ phase: "rooms", detail: "Upsert Master Ruangan", completed: 2, total: phases });
  await upsertRooms(plan);

  onProgress({ phase: "room-unavailability", detail: "Import room unavailability dari insidental tanpa kelas", completed: 3, total: phases });
  const roomUnavailability = await importRoomUnavailability(plan);

  onProgress({ phase: "schedule", detail: "Import Jadwal + guru", completed: 4, total: phases });
  const schedule = await importSchedules(plan, classIds, teacherIds);

  onProgress({ phase: "incidentals", detail: "Import Jadwal_Insidental berkonteks kelas", completed: 5, total: phases });
  const incidental = await importIncidentals(plan, classIds, teacherIds);

  onProgress({ phase: "calendar", detail: "Import Kalender_Akademik", completed: 6, total: phases });
  const academicEvents = await importAcademicEvents(plan, classIds);

  onProgress({ phase: "coverage", detail: "Import Log_Izin + tugas", completed: 7, total: phases });
  const coverage = await importCoverage(plan, classIds, teacherIds);

  onProgress({ phase: "done", detail: "Migration selesai", completed: phases, total: phases });
  return {
    teachers: plan.teachers.length,
    classes: plan.classes.length,
    rooms: plan.rooms.length,
    roomUnavailability,
    schedules: schedule.scheduleCount,
    scheduleTeachers: schedule.teacherCount,
    incidentals: incidental.incidentalCount,
    incidentalTeacherOverrides: incidental.teacherOverrideCount,
    academicEvents,
    coverageSlots: coverage.coverageCount,
    learningTasks: coverage.learningTaskCount,
    taskResources: coverage.taskResourceCount,
  };
}

function expectedCounts(plan: LegacyMigrationPlan): MigrationResultCounts {
  return {
    teachers: plan.teachers.length,
    classes: plan.classes.length,
    rooms: plan.rooms.length,
    roomUnavailability: plan.roomUnavailability.length,
    schedules: plan.schedules.length,
    scheduleTeachers: plan.schedules.reduce((sum, row) => sum + row.teacherNames.filter(Boolean).length, 0),
    incidentals: plan.incidentals.length,
    incidentalTeacherOverrides: plan.incidentals.reduce((sum, row) => sum + row.teacherNames.filter(Boolean).length, 0),
    academicEvents: plan.academicEvents.length,
    coverageSlots: plan.coverage.length,
    learningTasks: plan.coverage.filter((row) => Boolean(row.taskText)).length,
    taskResources: plan.coverage.reduce((sum, row) => sum + (row.taskText ? extractUrls(row.taskText).length : 0), 0),
  };
}

async function countExact(table: string, filter?: (query: any) => any): Promise<number> {
  const client = requireSupabaseClient();
  let query: any = client.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table} count: ${error.message}`);
  return Number(count || 0);
}

export async function verifyLegacyMigration(plan: LegacyMigrationPlan): Promise<MigrationVerification> {
  await requireAdmin();
  const expected = expectedCounts(plan);
  const client = requireSupabaseClient();

  const safeCountByValues = async (table: string, column: string, values: string[]): Promise<number> => {
    let total = 0;
    for (const batch of chunks(values)) {
      if (batch.length === 0) continue;
      total += await countExact(table, (q) => q.in(column, batch));
    }
    return total;
  };

  const selectIdsByValues = async (table: string, column: string, values: string[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const batch of chunks(values)) {
      if (batch.length === 0) continue;
      const { data, error } = await client.from(table).select("id").in(column, batch);
      if (error) throw new Error(`${table} verify IDs: ${error.message}`);
      ids.push(...(data || []).map((row) => String(row.id)));
    }
    return ids;
  };

  const [scheduleIds, incidentalIds, coverageIds] = await Promise.all([
    selectIdsByValues("schedule_master", "legacy_row_id", plan.schedules.map((row) => row.legacyRowId)),
    selectIdsByValues("schedule_incidentals", "legacy_row_id", plan.incidentals.map((row) => row.legacyRowId)),
    selectIdsByValues("coverage_slots", "legacy_log_id", plan.coverage.map((row) => row.legacyLogId)),
  ]);

  const [
    teachers,
    classes,
    rooms,
    roomUnavailability,
    schedules,
    scheduleTeachers,
    incidentals,
    incidentalTeacherOverrides,
    academicEvents,
    coverageSlots,
  ] = await Promise.all([
    safeCountByValues("teachers", "legacy_row_id", plan.teachers.map((row) => row.legacyRowId)),
    safeCountByValues("classes", "code", plan.classes.map((row) => row.code)),
    safeCountByValues("rooms", "id", plan.rooms.map((row) => row.id)),
    safeCountByValues("room_unavailability", "legacy_row_id", plan.roomUnavailability.map((row) => row.legacyRowId)),
    safeCountByValues("schedule_master", "legacy_row_id", plan.schedules.map((row) => row.legacyRowId)),
    safeCountByValues("schedule_master_teachers", "schedule_id", scheduleIds),
    safeCountByValues("schedule_incidentals", "legacy_row_id", plan.incidentals.map((row) => row.legacyRowId)),
    safeCountByValues("schedule_incidental_teacher_overrides", "incidental_id", incidentalIds),
    safeCountByValues("academic_events", "legacy_row_id", plan.academicEvents.map((row) => row.legacyRowId)),
    safeCountByValues("coverage_slots", "legacy_log_id", plan.coverage.map((row) => row.legacyLogId)),
  ]);

  const learningTasks = await safeCountByValues("learning_tasks", "coverage_slot_id", coverageIds);
  const taskIds = await selectIdsByValues("learning_tasks", "coverage_slot_id", coverageIds);
  const taskResources = await safeCountByValues("task_resources", "task_id", taskIds);

  const actual: MigrationResultCounts = {
    teachers,
    classes,
    rooms,
    roomUnavailability,
    schedules,
    scheduleTeachers,
    incidentals,
    incidentalTeacherOverrides,
    academicEvents,
    coverageSlots,
    learningTasks,
    taskResources,
  };

  const differences: string[] = [];
  (Object.keys(expected) as (keyof MigrationResultCounts)[]).forEach((key) => {
    if (expected[key] !== actual[key]) differences.push(`${key}: expected ${expected[key]}, actual ${actual[key]}`);
  });

  // Stronger parity check: keyed counts can still pass when stale legacy rows
  // remain in Supabase. These tables are fully owned by the migration pipeline
  // whenever their legacy/source marker is present, so their managed totals must
  // exactly match the current source snapshot.
  const legacyManagedExpected: LegacyManagedTotals = {
    schedules: expected.schedules,
    incidentals: expected.incidentals,
    academicEvents: expected.academicEvents,
    coverageSlots: expected.coverageSlots,
    roomUnavailability: expected.roomUnavailability,
  };
  const legacyManagedActual: LegacyManagedTotals = {
    schedules: await countExact("schedule_master", (q) => q.not("legacy_row_id", "is", null)),
    incidentals: await countExact("schedule_incidentals", (q) => q.not("legacy_row_id", "is", null)),
    academicEvents: await countExact("academic_events", (q) => q.not("legacy_row_id", "is", null)),
    coverageSlots: await countExact("coverage_slots", (q) => q.eq("source", "LEGACY_IMPORT")),
    roomUnavailability: await countExact("room_unavailability", (q) => q.eq("source", "LEGACY_INCIDENTAL")),
  };
  differences.push(...compareLegacyManagedTotals(legacyManagedExpected, legacyManagedActual));

  return { expected, actual, ok: differences.length === 0, differences };
}
