import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  MasterRuanganItem,
  ScheduleItem,
  Teacher,
} from "../../domain/models";
import type { ScheduleDataSnapshot } from "./scheduleRepository";
import { scheduleClassModeToLegacy, type ScheduleClassMode } from "../../domain/schedule/classMode";

export interface TeacherRow {
  id: string;
  full_name: string;
  short_name?: string | null;
  gender?: string | null;
  whatsapp_e164?: string | null;
  primary_subjects_text?: string | null;
  subject_cluster?: string | null;
  levels_text?: string | null;
  additional_task?: string | null;
  notes?: string | null;
  legacy_name?: string | null;
  is_active?: boolean | null;
}

export interface ClassRow {
  id: string;
  code: string;
  display_name: string;
  gender?: string | null;
  grade_level?: number | null;
  program?: string | null;
  is_active?: boolean | null;
}

export interface RoomRow {
  id: string;
  name: string;
  aliases?: string[] | null;
  capacity?: number | null;
  location?: string | null;
  room_type?: string | null;
  status?: string | null;
}

export interface ScheduleMasterRow {
  id: string;
  class_id: string;
  day_of_week: number;
  period: number;
  start_time?: string | null;
  end_time?: string | null;
  subject?: string | null;
  room_id?: string | null;
  is_combined?: boolean | null;
  class_mode?: ScheduleClassMode | null;
  other_teachers_supervise?: boolean | null;
  special_note?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
}

export interface ScheduleTeacherRow {
  schedule_id: string;
  position: number;
  teacher_id?: string | null;
  teacher_name_snapshot?: string | null;
}

export interface ScheduleIncidentalRow {
  id: string;
  schedule_date: string;
  class_id: string;
  period: number;
  kind?: string | null;
  override_subject?: string | null;
  override_start_time?: string | null;
  override_end_time?: string | null;
  override_room_id?: string | null;
  override_is_combined?: boolean | null;
  override_class_mode?: ScheduleClassMode | null;
  override_special_note?: string | null;
  updated_at?: string | null;
  reason?: string | null;
  incidental_type?: string | null;
  copied_from_incidental_id?: string | null;
  deleted_at?: string | null;
}

export interface IncidentalTeacherOverrideRow {
  incidental_id: string;
  position: number;
  action: "SET" | "CLEAR" | string;
  teacher_id?: string | null;
  teacher_name_snapshot?: string | null;
}

export interface AcademicEventRow {
  id: string;
  legacy_event_code?: string | null;
  date_start: string;
  date_end: string;
  event_name: string;
  event_type: string;
  scope: "ALL" | "CLASS" | string;
  class_id?: string | null;
  period_start?: number | null;
  period_end?: number | null;
  status?: "ACTIVE" | "INACTIVE" | string | null;
}

export interface CoverageSlotRow {
  id: string;
  schedule_date: string;
  class_id?: string | null;
  class_name_snapshot?: string | null;
  period: number;
  subject_snapshot?: string | null;
  absent_teacher_id?: string | null;
  absent_teacher_name_snapshot?: string | null;
  substitute_teacher_id?: string | null;
  substitute_teacher_name_snapshot?: string | null;
  /** Sanitized by the public RPC; always null on historical coverage. */
  absent_teacher_whatsapp_e164?: string | null;
  substitute_teacher_whatsapp_e164?: string | null;
  source?: string | null;
  reason_snapshot?: string | null;
  status?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
}

export interface LearningTaskRow {
  id: string;
  coverage_slot_id: string;
  description?: string | null;
  deleted_at?: string | null;
}

export interface TaskResourceRow {
  id: string;
  task_id: string;
  resource_type: string;
  label?: string | null;
  url: string;
  drive_file_id?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
}

export interface RelationalScheduleRows {
  teachers: TeacherRow[];
  classes: ClassRow[];
  rooms: RoomRow[];
  scheduleMaster: ScheduleMasterRow[];
  scheduleTeachers: ScheduleTeacherRow[];
  scheduleIncidentals: ScheduleIncidentalRow[];
  incidentalTeacherOverrides: IncidentalTeacherOverrideRow[];
  academicEvents: AcademicEventRow[];
  coverageSlots: CoverageSlotRow[];
  learningTasks?: LearningTaskRow[];
  taskResources?: TaskResourceRow[];
}

const DAY_NAMES: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

function cleanTime(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : raw;
}

function nameFromTeacherRow(row: TeacherRow | undefined): string {
  return String(row?.full_name || row?.legacy_name || "").trim();
}

function buildTeacherNameResolver(teachers: TeacherRow[]) {
  const byId = new Map(teachers.map((row) => [row.id, row]));

  return (teacherId?: string | null, snapshot?: string | null): string => {
    if (teacherId) {
      const name = nameFromTeacherRow(byId.get(teacherId));
      if (name) return name;
    }
    return String(snapshot || "").trim();
  };
}

function booleanToLegacy(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value ? "Ya" : "Tidak";
}

export function mapTeacherRows(rows: TeacherRow[]): Teacher[] {
  return rows.map((row) => {
    const additionalTask = String(row.additional_task || "").trim();
    const notes = String(row.notes || "").trim();
    const taskLower = additionalTask.toLocaleLowerCase("id-ID");

    const gender = String(row.gender || "UNKNOWN").trim().toUpperCase();
    return {
      id: row.id,
      nama: row.full_name,
      panggilan: row.short_name || null,
      gender: gender === "IKHWAN" || gender === "AKHWAT" ? gender : "UNKNOWN",
      whatsapp_e164: row.whatsapp_e164 || null,
      mapel_utama: row.primary_subjects_text || "",
      rumpun: row.subject_cluster || "",
      jenjang: row.levels_text || "",
      tugas_tambahan: additionalTask,
      keterangan: notes,
      // Preserve the same legacy derivation used by App.tsx so Dashboard Wali
      // Kelas does not change merely because the persistence source changes.
      wali_kelas: taskLower.includes("wali") ? notes || null : null,
      pendamping_kelas: taskLower.includes("pendamping") ? notes || null : null,
      is_manajemen: taskLower.includes("manajemen"),
    };
  });
}

export function mapRoomRows(rows: RoomRow[]): MasterRuanganItem[] {
  return rows.map((row) => ({
    id_ruangan: row.id,
    nama_ruangan: row.name,
    alias: (row.aliases || []).join("|"),
    kapasitas: row.capacity ?? undefined,
    lokasi: row.location || undefined,
    jenis: row.room_type || undefined,
    status: row.status === "INACTIVE" ? "Nonaktif" : "Aktif",
  }));
}

export function mapScheduleRows(args: {
  scheduleMaster: ScheduleMasterRow[];
  scheduleTeachers: ScheduleTeacherRow[];
  classes: ClassRow[];
  teachers: TeacherRow[];
}): ScheduleItem[] {
  const classById = new Map(args.classes.map((row) => [row.id, row]));
  const resolveTeacherName = buildTeacherNameResolver(args.teachers);
  const teachersBySchedule = new Map<string, ScheduleTeacherRow[]>();

  args.scheduleTeachers.forEach((row) => {
    const list = teachersBySchedule.get(row.schedule_id) || [];
    list.push(row);
    teachersBySchedule.set(row.schedule_id, list);
  });

  return args.scheduleMaster.map((row) => {
    const className = classById.get(row.class_id)?.display_name || "";
    const teacherSlots = Array.from({ length: 6 }, () => "");

    (teachersBySchedule.get(row.id) || []).forEach((teacherRow) => {
      const index = Number(teacherRow.position) - 1;
      if (index < 0 || index >= 6) return;
      teacherSlots[index] = resolveTeacherName(
        teacherRow.teacher_id,
        teacherRow.teacher_name_snapshot,
      );
    });

    return {
      id: row.id,
      kelas: className,
      hari: DAY_NAMES[Number(row.day_of_week)] || "",
      jam_ke: Number(row.period),
      mulai: cleanTime(row.start_time),
      selesai: cleanTime(row.end_time),
      mapel: row.subject || "",
      guru1: teacherSlots[0],
      guru2: teacherSlots[1],
      guru3: teacherSlots[2],
      guru4: teacherSlots[3],
      guru5: teacherSlots[4],
      guru6: teacherSlots[5],
      kelasgabung: scheduleClassModeToLegacy(row.class_mode || (row.is_combined ? "COMBINED" : "NORMAL")),
      ruangan: row.room_id || "",
      selainguru1_mengawas: row.other_teachers_supervise ? "Ya" : "Tidak",
      keterangan_khusus: row.special_note || "",
    };
  });
}

export function mapIncidentalRows(args: {
  scheduleIncidentals: ScheduleIncidentalRow[];
  incidentalTeacherOverrides: IncidentalTeacherOverrideRow[];
  classes: ClassRow[];
  teachers: TeacherRow[];
}): JadwalInsidentalItem[] {
  const classById = new Map(args.classes.map((row) => [row.id, row]));
  const resolveTeacherName = buildTeacherNameResolver(args.teachers);
  const overridesByIncidental = new Map<string, IncidentalTeacherOverrideRow[]>();

  args.incidentalTeacherOverrides.forEach((row) => {
    const list = overridesByIncidental.get(row.incidental_id) || [];
    list.push(row);
    overridesByIncidental.set(row.incidental_id, list);
  });

  return args.scheduleIncidentals.map((row) => {
    const teacherSlots = Array.from({ length: 6 }, () => "");

    (overridesByIncidental.get(row.id) || []).forEach((overrideRow) => {
      const index = Number(overrideRow.position) - 1;
      if (index < 0 || index >= 6) return;

      // V3.3 legacy-compatible domain represents blank teacher values as
      // INHERIT. Therefore an explicit database CLEAR cannot be mapped safely
      // yet. Fail loudly instead of silently re-inheriting the master teacher.
      if (String(overrideRow.action).toUpperCase() === "CLEAR") {
        throw new Error(
          `Incidental ${row.id} position ${overrideRow.position} uses CLEAR, which is not yet representable by the V3.3 legacy adapter.`,
        );
      }

      teacherSlots[index] = resolveTeacherName(
        overrideRow.teacher_id,
        overrideRow.teacher_name_snapshot,
      );
    });

    return {
      id: row.id,
      tanggal: row.schedule_date,
      kelas: classById.get(row.class_id)?.display_name || "",
      jam_ke: Number(row.period),
      mapel: row.override_subject || "",
      mulai: row.override_start_time?.slice(0, 5) || "",
      selesai: row.override_end_time?.slice(0, 5) || "",
      guru1: teacherSlots[0],
      guru2: teacherSlots[1],
      guru3: teacherSlots[2],
      guru4: teacherSlots[3],
      guru5: teacherSlots[4],
      guru6: teacherSlots[5],
      kelasgabung: row.override_class_mode ? scheduleClassModeToLegacy(row.override_class_mode) : booleanToLegacy(row.override_is_combined),
      ruangan: row.override_room_id || "",
      keterangan_khusus: row.override_special_note || "",
      alasan: row.reason || "",
      tipe_insidental: row.incidental_type || row.kind || "",
      copiedFromIncidentalId: row.copied_from_incidental_id || undefined,
      classModeOverridden: row.override_class_mode != null || row.override_is_combined != null,
      kind: row.kind || "OVERRIDE",
      replaceTeachers: (overridesByIncidental.get(row.id) || []).length > 0,
    };
  });
}

export function mapAcademicEventRows(
  rows: AcademicEventRow[],
  classes: ClassRow[],
): KalenderAkademikItem[] {
  const classById = new Map(classes.map((row) => [row.id, row]));

  return rows.map((row) => ({
    id: row.legacy_event_code || row.id,
    tanggal_mulai: row.date_start,
    tanggal_selesai: row.date_end,
    nama_kegiatan: row.event_name,
    tipe: row.event_type,
    cakupan: row.scope === "CLASS" ? "Kelas" : "Semua",
    kelas: row.class_id ? classById.get(row.class_id)?.display_name || "" : "",
    jp_mulai: row.period_start ?? null,
    jp_selesai: row.period_end ?? null,
    status: row.status === "INACTIVE" ? "Nonaktif" : "Aktif",
  }));
}

export function mapCoverageRows(
  rows: CoverageSlotRow[],
  classes: ClassRow[],
  teachers: TeacherRow[],
  learningTasks: LearningTaskRow[] = [],
  taskResources: TaskResourceRow[] = [],
  scheduleMaster: ScheduleMasterRow[] = [],
  scheduleIncidentals: ScheduleIncidentalRow[] = [],
): LogIzinItem[] {
  const classById = new Map(classes.map((row) => [row.id, row]));
  const classIdByName = new Map<string, string>();
  for (const entry of classes) {
    for (const label of [entry.code, entry.display_name]) {
      const normalized = String(label || "").trim().toLocaleLowerCase("id-ID");
      if (normalized) classIdByName.set(normalized, entry.id);
    }
  }
  const resolveTeacherName = buildTeacherNameResolver(teachers);
  const tasksByCoverage = new Map<string, LearningTaskRow[]>();
  const resourcesByTask = new Map<string, TaskResourceRow[]>();

  learningTasks.forEach((task) => {
    const list = tasksByCoverage.get(task.coverage_slot_id) || [];
    list.push(task);
    tasksByCoverage.set(task.coverage_slot_id, list);
  });
  taskResources.forEach((resource) => {
    const list = resourcesByTask.get(resource.task_id) || [];
    list.push(resource);
    resourcesByTask.set(resource.task_id, list);
  });

  const taskTextForCoverage = (coverageId: string): string => {
    const parts: string[] = [];
    for (const task of tasksByCoverage.get(coverageId) || []) {
      const description = String(task.description || "").trim();
      if (description) parts.push(description);
      for (const resource of resourcesByTask.get(task.id) || []) {
        const url = String(resource.url || "").trim();
        if (url && !parts.some((part) => part.includes(url))) parts.push(url);
      }
    }
    return parts.join("\n").trim();
  };

  // RC4.2: fill missing legacy/official-duty subject snapshots from the exact
  // dated class + JP. Dated incidental override wins; fallback to that weekday's
  // master schedule. Never infer subject from the substitute teacher's specialty.
  const subjectByMaster = new Map<string, string>();
  for (const master of scheduleMaster) {
    if (master.is_active === false || master.deleted_at) continue;
    const key = `${master.class_id}|${master.day_of_week}|${master.period}`;
    if (!subjectByMaster.has(key) && String(master.subject || "").trim()) subjectByMaster.set(key, String(master.subject).trim());
  }
  const datedSubject = new Map<string, { subject: string; order: string }>();
  for (const inc of scheduleIncidentals) {
    if (inc.deleted_at) continue;
    const key = `${inc.schedule_date}|${inc.class_id}|${inc.period}`;
    const order = `${inc.updated_at || ""}|${inc.id}`;
    const previous = datedSubject.get(key);
    // The latest dated override wins, even when it intentionally inherits
    // the master subject; never resurrect an older incidental override.
    if (!previous || order >= previous.order) {
      datedSubject.set(key, { subject: String(inc.override_subject || "").trim(), order });
    }
  }
  const resolveSubject = (row: CoverageSlotRow): string => {
    const snapshot = String(row.subject_snapshot || "").trim();
    if (snapshot) return snapshot;
    // Older coverage may have only a class-name snapshot. Resolve it by an
    // exact class match; never guess based on grade or the substitute teacher.
    const classId = row.class_id || classIdByName.get(String(row.class_name_snapshot || "").trim().toLocaleLowerCase("id-ID"));
    if (!classId) return "";
    const dated = datedSubject.get(`${row.schedule_date}|${classId}|${row.period}`)?.subject;
    if (dated) return dated;
    const weekday = new Date(`${row.schedule_date}T12:00:00Z`).getUTCDay();
    return subjectByMaster.get(`${classId}|${weekday === 0 ? 7 : weekday}|${row.period}`) || "";
  };

  return rows.map((row) => ({
    id: row.id,
    tanggal: row.schedule_date,
    guru_izin: resolveTeacherName(row.absent_teacher_id, row.absent_teacher_name_snapshot),
    alasan: row.reason_snapshot || "",
    jam_ke: Number(row.period),
    kelas: row.class_id
      ? classById.get(row.class_id)?.display_name || row.class_name_snapshot || ""
      : row.class_name_snapshot || "",
    mapel: resolveSubject(row),
    guru_pengganti: resolveTeacherName(
      row.substitute_teacher_id,
      row.substitute_teacher_name_snapshot,
    ),
    source: row.source || undefined,
    coverage_status: row.status || undefined,
    substitute_teacher_id: row.substitute_teacher_id || null,
    whatsapp_guru_izin: row.absent_teacher_whatsapp_e164 || null,
    whatsapp_guru_pengganti: row.substitute_teacher_whatsapp_e164 || null,
    tugas: taskTextForCoverage(row.id) || undefined,
    created_at: row.created_at || undefined,
  }));
}

export function mapRelationalScheduleRows(rows: RelationalScheduleRows): ScheduleDataSnapshot {
  return {
    teachers: mapTeacherRows(rows.teachers),
    schedules: mapScheduleRows({
      scheduleMaster: rows.scheduleMaster,
      scheduleTeachers: rows.scheduleTeachers,
      classes: rows.classes,
      teachers: rows.teachers,
    }),
    logs: mapCoverageRows(
      rows.coverageSlots,
      rows.classes,
      rows.teachers,
      rows.learningTasks || [],
      rows.taskResources || [],
      rows.scheduleMaster,
      rows.scheduleIncidentals,
    ),
    jadwalInsidental: mapIncidentalRows({
      scheduleIncidentals: rows.scheduleIncidentals,
      incidentalTeacherOverrides: rows.incidentalTeacherOverrides,
      classes: rows.classes,
      teachers: rows.teachers,
    }),
    masterRuangan: mapRoomRows(rows.rooms),
    kalenderAkademik: mapAcademicEventRows(rows.academicEvents, rows.classes),
  };
}
