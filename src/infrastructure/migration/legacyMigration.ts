import { normalizeDateString, normalizeDay } from "../../domain/date";
import { isClassMatch, isCombinedClassValue } from "../../domain/class";
import { optionalScheduleClassMode, parseScheduleClassMode, type ScheduleClassMode } from "../../domain/schedule/classMode";

export type MigrationIssueSeverity = "BLOCKING" | "WARNING";

export interface MigrationIssue {
  severity: MigrationIssueSeverity;
  code: string;
  message: string;
  rowId?: string;
}

export interface LegacySourceSnapshot {
  teachers: Record<string, unknown>[];
  schedules: Record<string, unknown>[];
  incidentals: Record<string, unknown>[];
  logs: Record<string, unknown>[];
  rooms: Record<string, unknown>[];
  academicEvents: Record<string, unknown>[];
  ignoredAccountCount: number;
}

export interface PlannedTeacher {
  legacyRowId: string;
  fullName: string;
  shortName: string | null;
  gender: "IKHWAN" | "AKHWAT" | "UNKNOWN";
  whatsappE164: string | null;
  primarySubjectsText: string | null;
  subjectCluster: string | null;
  levelsText: string | null;
  additionalTask: string | null;
  notes: string | null;
}

export interface PlannedClass {
  code: string;
  displayName: string;
  gender: "IKHWAN" | "AKHWAT" | "UNKNOWN";
  gradeLevel: number | null;
  program: string | null;
}

export interface PlannedRoom {
  id: string;
  name: string;
  aliases: string[];
  capacity: number | null;
  location: string | null;
  roomType: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface PlannedRoomUnavailability {
  legacyRowId: string;
  roomId: string;
  dateStart: string;
  dateEnd: string;
  periodStart: number | null;
  periodEnd: number | null;
  reason: string | null;
  note: string | null;
  incidentalType: string | null;
}

export interface PlannedSchedule {
  legacyRowId: string;
  classCode: string;
  dayOfWeek: number;
  period: number;
  startTime: string | null;
  endTime: string | null;
  subject: string;
  roomId: string | null;
  isCombined: boolean;
  classMode: ScheduleClassMode;
  otherTeachersSupervise: boolean;
  specialNote: string | null;
  teacherNames: string[];
}

export interface PlannedIncidental {
  legacyRowId: string;
  scheduleDate: string;
  classCode: string;
  period: number;
  kind: "OVERRIDE" | "ADDITIONAL";
  overrideSubject: string | null;
  overrideRoomId: string | null;
  overrideClassMode: ScheduleClassMode | null;
  overrideSpecialNote: string | null;
  reason: string | null;
  incidentalType: string | null;
  teacherNames: string[];
}

export interface PlannedAcademicEvent {
  legacyRowId: string;
  legacyEventCode: string | null;
  dateStart: string;
  dateEnd: string;
  eventName: string;
  eventType: string;
  scope: "ALL" | "CLASS";
  classCode: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface PlannedCoverage {
  legacyLogId: string;
  scheduleDate: string;
  classCode: string | null;
  period: number;
  subjectSnapshot: string;
  absentTeacherName: string;
  substituteTeacherName: string | null;
  reasonSnapshot: string | null;
  status: "ASSIGNED" | "NO_SUBSTITUTE";
  taskText: string | null;
}

export interface LegacyMigrationPlan {
  teachers: PlannedTeacher[];
  classes: PlannedClass[];
  rooms: PlannedRoom[];
  roomUnavailability: PlannedRoomUnavailability[];
  schedules: PlannedSchedule[];
  incidentals: PlannedIncidental[];
  academicEvents: PlannedAcademicEvent[];
  coverage: PlannedCoverage[];
  issues: MigrationIssue[];
  ignoredAccountCount: number;
  skippedEmptyRows: number;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalizedNameForPlan(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function rowId(row: Record<string, unknown>, fallback: string): string {
  return text(row._row_id) || text(row.id) || fallback;
}

function integer(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeGender(value: unknown): "IKHWAN" | "AKHWAT" | "UNKNOWN" {
  const raw = text(value).toUpperCase().replace(/[^A-Z]/g, "");
  if (["IKHWAN", "I", "L", "LAKILAKI", "MALE", "PRIA"].includes(raw)) return "IKHWAN";
  if (["AKHWAT", "A", "P", "PEREMPUAN", "FEMALE", "WANITA"].includes(raw)) return "AKHWAT";
  return "UNKNOWN";
}

export function normalizeWhatsappE164(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  let normalized = compact;
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (normalized.startsWith("08")) normalized = `+62${normalized.slice(1)}`;
  else if (normalized.startsWith("62")) normalized = `+${normalized}`;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return null;
  return normalized;
}

export function normalizeClassCode(value: unknown): string {
  return text(value).replace(/\s+/g, " ").toUpperCase();
}

export function inferClassMetadata(className: string): Pick<PlannedClass, "gender" | "gradeLevel" | "program"> {
  const upper = normalizeClassCode(className);
  let gender: PlannedClass["gender"] = "UNKNOWN";
  if (/\bIKHWAN\b/.test(upper) || /\sI$/.test(upper)) gender = "IKHWAN";
  else if (/\bAKHWAT\b/.test(upper) || /\sA$/.test(upper)) gender = "AKHWAT";

  const gradeMatch = upper.match(/^0?(1[0-2]|[1-9])\b/);
  const gradeLevel = gradeMatch ? Number(gradeMatch[1]) : null;

  let program: string | null = null;
  if (/\bINTER\b/.test(upper)) program = "INTER";
  else if (/\bAE\b/.test(upper)) program = "AE";
  else if (/\bMQ\b/.test(upper)) program = "MQ";

  return { gender, gradeLevel, program };
}

function dayNumber(value: unknown): number | null {
  const day = normalizeDay(text(value));
  return ({ Senin: 1, Selasa: 2, Rabu: 3, Kamis: 4, Jumat: 5 } as Record<string, number>)[day] || null;
}

function dateDayNumber(dateStr: string): number | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const jsDay = date.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function booleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const raw = text(value).toLowerCase();
  return ["1", "true", "yes", "ya", "iya", "y"].includes(raw);
}

function statusActive(value: unknown): "ACTIVE" | "INACTIVE" {
  const raw = text(value).toLowerCase();
  return raw === "nonaktif" || raw === "inactive" || raw === "0" || raw === "false" ? "INACTIVE" : "ACTIVE";
}

function aliases(value: unknown): string[] {
  return text(value).split(/[|;,]/).map((item) => item.trim()).filter(Boolean);
}

function extractTeacherNames(row: Record<string, unknown>): string[] {
  return [1, 2, 3, 4, 5, 6].map((position) => text(row[`guru${position}`]));
}

function resolveRoomId(rawValue: unknown, rooms: PlannedRoom[]): string | null | "UNKNOWN" {
  const raw = text(rawValue);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const match = rooms.find((room) =>
    room.id.toLowerCase() === lower
    || room.name.toLowerCase() === lower
    || room.aliases.some((alias) => alias.toLowerCase() === lower),
  );
  return match?.id || "UNKNOWN";
}

function addClass(classMap: Map<string, PlannedClass>, rawValue: unknown): string {
  const code = normalizeClassCode(rawValue);
  if (!code) return "";
  if (!classMap.has(code)) {
    classMap.set(code, {
      code,
      displayName: text(rawValue).replace(/\s+/g, " "),
      ...inferClassMetadata(code),
    });
  }
  return code;
}

export function sanitizeLegacyPayload(raw: unknown): LegacySourceSnapshot {
  const payload = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const array = (key: string) => Array.isArray(payload[key]) ? payload[key] as Record<string, unknown>[] : [];
  const accounts = array("akun");
  return {
    teachers: array("Master_Guru"),
    schedules: array("Jadwal"),
    incidentals: array("Jadwal_Insidental"),
    logs: array("Log_Izin"),
    rooms: array("Master_Ruangan"),
    academicEvents: array("Kalender_Akademik"),
    ignoredAccountCount: accounts.length,
  };
}

export function buildLegacyMigrationPlan(source: LegacySourceSnapshot): LegacyMigrationPlan {
  const issues: MigrationIssue[] = [];
  let skippedEmptyRows = 0;

  const sourceRowsForVersionCheck = [
    ...source.teachers,
    ...source.schedules,
    ...source.incidentals,
    ...source.logs,
    ...source.rooms,
    ...source.academicEvents,
  ];
  if (sourceRowsForVersionCheck.length > 0 && !sourceRowsForVersionCheck.some((row) => text(row._row_id))) {
    issues.push({
      severity: "BLOCKING",
      code: "SOURCE_BACKEND_PRE_V3_6",
      message: "Apps Script source belum mengirim _row_id V3.6. Update/redeploy Code.gs V3.6 sebelum import agar row identity dan field WhatsApp/gender termigrasi dengan aman.",
    });
  }

  const teachers: PlannedTeacher[] = [];
  for (let index = 0; index < source.teachers.length; index += 1) {
    const row = source.teachers[index];
    const fullName = text(row.nama || row.nama_guru || row["Nama Guru"]);
    if (!fullName) {
      skippedEmptyRows += 1;
      continue;
    }
    const rawWhatsapp = row.whatsapp_e164 ?? row.whatsapp ?? row.wa ?? row.no_wa ?? row["No WA"];
    const normalizedWhatsapp = normalizeWhatsappE164(rawWhatsapp);
    if (text(rawWhatsapp) && !normalizedWhatsapp) {
      issues.push({ severity: "WARNING", code: "INVALID_WHATSAPP", rowId: rowId(row, `Master_Guru_${index + 1}`), message: `Nomor WA ${fullName} tidak valid dan tidak akan dimigrasikan.` });
    }
    teachers.push({
      legacyRowId: rowId(row, `Master_Guru_${index + 1}`),
      fullName,
      shortName: optionalText(row.panggilan || row.short_name),
      gender: normalizeGender(row.gender || row.jenis_kelamin || row["Jenis Kelamin"]),
      whatsappE164: normalizedWhatsapp,
      primarySubjectsText: optionalText(row.mapel_utama || row.mapel),
      subjectCluster: optionalText(row.rumpun),
      levelsText: optionalText(row.jenjang),
      additionalTask: optionalText(row.tugas_tambahan),
      notes: optionalText(row.keterangan),
    });
  }

  const duplicateTeacherRows = new Map<string, string>();
  for (const teacher of teachers) {
    const key = teacher.fullName.toLocaleLowerCase("id-ID");
    const previous = duplicateTeacherRows.get(key);
    if (previous) {
      issues.push({ severity: "BLOCKING", code: "DUPLICATE_TEACHER", rowId: teacher.legacyRowId, message: `Nama guru duplikat: ${teacher.fullName} (${previous} dan ${teacher.legacyRowId}).` });
    } else duplicateTeacherRows.set(key, teacher.legacyRowId);
  }

  const rooms: PlannedRoom[] = [];
  for (let index = 0; index < source.rooms.length; index += 1) {
    const row = source.rooms[index];
    const id = text(row.id_ruangan || row.room_id);
    const name = text(row.nama_ruangan || row.nama || row.ruangan);
    if (!id && !name) {
      skippedEmptyRows += 1;
      continue;
    }
    if (!id || !name) {
      issues.push({ severity: "BLOCKING", code: "ROOM_IDENTITY_MISSING", rowId: rowId(row, `Master_Ruangan_${index + 1}`), message: "Master Ruangan wajib memiliki id_ruangan dan nama_ruangan." });
      continue;
    }
    const capacity = integer(row.kapasitas || row.capacity);
    rooms.push({
      id,
      name,
      aliases: aliases(row.alias),
      capacity: capacity != null && capacity >= 0 ? capacity : null,
      location: optionalText(row.lokasi || row.location),
      roomType: optionalText(row.jenis || row.type),
      status: statusActive(row.status),
    });
  }

  const classMap = new Map<string, PlannedClass>();
  source.schedules.forEach((row) => addClass(classMap, row.kelas));
  source.incidentals.forEach((row) => addClass(classMap, row.kelas));
  source.logs.forEach((row) => addClass(classMap, row.kelas));
  source.academicEvents.forEach((row) => {
    if (text(row.kelas)) addClass(classMap, row.kelas);
  });

  const schedules: PlannedSchedule[] = [];
  for (let index = 0; index < source.schedules.length; index += 1) {
    const row = source.schedules[index];
    const classCode = addClass(classMap, row.kelas);
    const dayOfWeek = dayNumber(row.hari);
    const period = integer(row.jam_ke ?? row.jamke);
    const legacyRowId = rowId(row, `Jadwal_${index + 1}`);
    if (!classCode && !text(row.mapel) && period == null) {
      skippedEmptyRows += 1;
      continue;
    }
    if (!classCode) issues.push({ severity: "BLOCKING", code: "SCHEDULE_CLASS_MISSING", rowId: legacyRowId, message: "Jadwal tidak memiliki kelas." });
    if (dayOfWeek == null) issues.push({ severity: "BLOCKING", code: "SCHEDULE_DAY_INVALID", rowId: legacyRowId, message: `Hari jadwal tidak dikenali: ${text(row.hari) || "(kosong)"}.` });
    if (period == null || period < 0 || period > 6) issues.push({ severity: "BLOCKING", code: "SCHEDULE_PERIOD_INVALID", rowId: legacyRowId, message: `JP jadwal tidak valid: ${text(row.jam_ke)}.` });
    const roomResolution = resolveRoomId(row.ruangan || row.room || row.id_ruangan, rooms);
    if (roomResolution === "UNKNOWN") issues.push({ severity: "BLOCKING", code: "UNKNOWN_ROOM", rowId: legacyRowId, message: `Ruangan '${text(row.ruangan || row.room || row.id_ruangan)}' tidak ditemukan di Master Ruangan.` });
    if (!classCode || dayOfWeek == null || period == null || period < 0 || period > 6) continue;
    schedules.push({
      legacyRowId,
      classCode,
      dayOfWeek,
      period,
      startTime: optionalText(row.mulai),
      endTime: optionalText(row.selesai),
      subject: text(row.mapel || row.mata_pelajaran),
      roomId: roomResolution === "UNKNOWN" ? null : roomResolution,
      isCombined: isCombinedClassValue(row.kelasgabung),
      classMode: parseScheduleClassMode(row.kelasgabung),
      otherTeachersSupervise: booleanLike(row.selainguru1_mengawas),
      specialNote: optionalText(row.keterangan_khusus),
      teacherNames: extractTeacherNames(row),
    });
  }


  const incidentals: PlannedIncidental[] = [];
  const roomUnavailability: PlannedRoomUnavailability[] = [];
  for (let index = 0; index < source.incidentals.length; index += 1) {
    const row = source.incidentals[index];
    const legacyRowId = rowId(row, `Jadwal_Insidental_${index + 1}`);
    const scheduleDate = normalizeDateString(row.tanggal);
    const classCode = addClass(classMap, row.kelas);
    const period = integer(row.jam_ke ?? row.jamke);
    if (!scheduleDate && !classCode && period == null) {
      skippedEmptyRows += 1;
      continue;
    }
    const dayOfWeek = dateDayNumber(scheduleDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) issues.push({ severity: "BLOCKING", code: "INCIDENTAL_DATE_INVALID", rowId: legacyRowId, message: `Tanggal insidental tidak valid: ${text(row.tanggal)}.` });
    if (period == null || period < 0 || period > 6) issues.push({ severity: "BLOCKING", code: "INCIDENTAL_PERIOD_INVALID", rowId: legacyRowId, message: `JP insidental tidak valid: ${text(row.jam_ke)}.` });
    const roomResolution = resolveRoomId(row.ruangan || row.room || row.id_ruangan, rooms);
    if (roomResolution === "UNKNOWN") issues.push({ severity: "BLOCKING", code: "UNKNOWN_ROOM", rowId: legacyRowId, message: `Ruangan insidental '${text(row.ruangan || row.room || row.id_ruangan)}' tidak ditemukan di Master Ruangan.` });

    const teacherNames = extractTeacherNames(row);
    const hasTeacherOverride = teacherNames.some(Boolean);
    const hasSubjectOverride = Boolean(text(row.mapel || row.mata_pelajaran));

    // Legacy practice: a classless incidental can intentionally mean "this room is unavailable"
    // rather than a malformed class schedule. Preserve it as a dedicated room constraint.
    if (!classCode && roomResolution !== "UNKNOWN" && roomResolution && /^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) && period != null && period >= 0 && period <= 6) {
      if (!hasTeacherOverride && !hasSubjectOverride) {
        roomUnavailability.push({
          legacyRowId,
          roomId: roomResolution,
          dateStart: scheduleDate,
          dateEnd: scheduleDate,
          periodStart: period,
          periodEnd: period,
          reason: optionalText(row.alasan),
          note: optionalText(row.keterangan_khusus || row.keterangan),
          incidentalType: optionalText(row.tipe_insidental || row.tipe),
        });
        issues.push({
          severity: "WARNING",
          code: "INCIDENTAL_ROOM_UNAVAILABILITY",
          rowId: legacyRowId,
          message: `Kelas kosong + ruangan '${roomResolution}' dipertahankan sebagai room unavailability pada JP ${period}.`,
        });
        continue;
      }
      issues.push({
        severity: "BLOCKING",
        code: "INCIDENTAL_CLASS_MISSING",
        rowId: legacyRowId,
        message: "Jadwal insidental tanpa kelas masih memiliki mapel/guru, sehingga tidak aman menganggapnya sebagai room unavailability.",
      });
      continue;
    }

    if (!classCode) issues.push({ severity: "BLOCKING", code: "INCIDENTAL_CLASS_MISSING", rowId: legacyRowId, message: "Jadwal insidental tidak memiliki kelas dan tidak dapat dikenali sebagai room unavailability." });
    if (!scheduleDate || !classCode || period == null || period < 0 || period > 6 || dayOfWeek == null) continue;
    incidentals.push({
      legacyRowId,
      scheduleDate,
      classCode,
      period,
      kind: schedules.some((master) => master.dayOfWeek === dayOfWeek && master.period === period && isClassMatch(master.classCode, classCode)) ? "OVERRIDE" : "ADDITIONAL",
      overrideSubject: optionalText(row.mapel || row.mata_pelajaran),
      overrideRoomId: roomResolution === "UNKNOWN" ? null : roomResolution,
      overrideClassMode: optionalScheduleClassMode(row.kelasgabung),
      overrideSpecialNote: optionalText(row.keterangan_khusus || row.keterangan),
      reason: optionalText(row.alasan),
      incidentalType: optionalText(row.tipe_insidental || row.tipe),
      teacherNames,
    });
  }

  const academicEvents: PlannedAcademicEvent[] = [];
  for (let index = 0; index < source.academicEvents.length; index += 1) {
    const row = source.academicEvents[index];
    const legacyRowId = text(row._row_id) || `Kalender_Akademik_${index + 1}`;
    const dateStart = normalizeDateString(row.tanggal_mulai);
    const dateEnd = normalizeDateString(row.tanggal_selesai || row.tanggal_mulai);
    const classCode = text(row.kelas) ? addClass(classMap, row.kelas) : null;
    const rawScope = text(row.cakupan).toLowerCase();
    let scope: "ALL" | "CLASS" | null = null;
    if (["semua", "all"].includes(rawScope)) scope = "ALL";
    else if (["kelas", "class"].includes(rawScope)) scope = "CLASS";
    else if (!rawScope && classCode) {
      scope = "CLASS";
      issues.push({ severity: "WARNING", code: "CALENDAR_LEGACY_SCOPE_FALLBACK", rowId: legacyRowId, message: `Cakupan kosong + kelas terisi diperlakukan sebagai CLASS untuk '${classCode}'.` });
    } else if (!rawScope && !classCode) {
      issues.push({ severity: "BLOCKING", code: "CALENDAR_SCOPE_AMBIGUOUS", rowId: legacyRowId, message: "Cakupan kalender kosong dan kelas juga kosong; tidak aman menganggap global." });
    } else issues.push({ severity: "BLOCKING", code: "CALENDAR_SCOPE_INVALID", rowId: legacyRowId, message: `Cakupan kalender tidak dikenali: ${text(row.cakupan)}.` });

    const periodStart = integer(row.jp_mulai);
    const periodEnd = integer(row.jp_selesai);
    if ((periodStart == null) !== (periodEnd == null)) issues.push({ severity: "BLOCKING", code: "CALENDAR_PERIOD_PAIR", rowId: legacyRowId, message: "jp_mulai dan jp_selesai harus sama-sama kosong atau sama-sama terisi." });
    if (periodStart != null && (periodStart < 0 || periodStart > 6 || periodEnd == null || periodEnd < periodStart || periodEnd > 6)) issues.push({ severity: "BLOCKING", code: "CALENDAR_PERIOD_INVALID", rowId: legacyRowId, message: `Range JP kalender tidak valid: ${periodStart}-${periodEnd}.` });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(dateEnd) || dateEnd < dateStart) issues.push({ severity: "BLOCKING", code: "CALENDAR_DATE_INVALID", rowId: legacyRowId, message: `Range tanggal kalender tidak valid: ${dateStart} s.d. ${dateEnd}.` });
    if (scope === "CLASS" && !classCode) issues.push({ severity: "BLOCKING", code: "CALENDAR_CLASS_MISSING", rowId: legacyRowId, message: "Event cakupan CLASS tidak memiliki kelas." });
    if (!scope || !dateStart || !dateEnd) continue;
    academicEvents.push({
      legacyRowId,
      legacyEventCode: optionalText(row.id),
      dateStart,
      dateEnd,
      eventName: text(row.nama_kegiatan || row.kegiatan),
      eventType: text(row.tipe || row.jenis) || "Kegiatan",
      scope,
      classCode: scope === "CLASS" ? classCode : null,
      periodStart,
      periodEnd,
      status: statusActive(row.status),
    });
  }

  const coverage: PlannedCoverage[] = [];
  for (let index = 0; index < source.logs.length; index += 1) {
    const row = source.logs[index];
    const legacyLogId = rowId(row, `Log_Izin_${index + 1}`);
    const scheduleDate = normalizeDateString(row.tanggal);
    const classCode = addClass(classMap, row.kelas);
    const period = integer(row.jam_ke ?? row.jamke);
    const absentTeacherName = text(row.guru_izin);
    if (!scheduleDate && !classCode && period == null && !absentTeacherName) {
      skippedEmptyRows += 1;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) issues.push({ severity: "BLOCKING", code: "LOG_DATE_INVALID", rowId: legacyLogId, message: `Tanggal Log_Izin tidak valid: ${text(row.tanggal)}.` });
    if (!classCode) issues.push({ severity: "WARNING", code: "LOG_CLASS_MISSING_HISTORY", rowId: legacyLogId, message: "Log_Izin historis tidak memiliki kelas; row tetap diimport sebagai LEGACY_IMPORT dengan class_id null." });
    if (period == null || period < 0 || period > 6) issues.push({ severity: "BLOCKING", code: "LOG_PERIOD_INVALID", rowId: legacyLogId, message: `JP Log_Izin tidak valid: ${text(row.jam_ke)}.` });
    if (!absentTeacherName) issues.push({ severity: "BLOCKING", code: "LOG_ABSENT_TEACHER_MISSING", rowId: legacyLogId, message: "Log_Izin tidak memiliki guru_izin." });
    if (!scheduleDate || period == null || period < 0 || period > 6 || !absentTeacherName) continue;
    const substituteTeacherName = optionalText(row.guru_pengganti || row.guru_ganti);
    coverage.push({
      legacyLogId,
      scheduleDate,
      classCode: classCode || null,
      period,
      subjectSnapshot: text(row.mapel),
      absentTeacherName,
      substituteTeacherName,
      reasonSnapshot: optionalText(row.alasan),
      status: substituteTeacherName ? "ASSIGNED" : "NO_SUBSTITUTE",
      taskText: optionalText(row.tugas || row.task || row.link || row["keterangan tugas"]),
    });
  }

  const coverageIdentityRows = new Map<string, string>();
  for (const row of coverage) {
    const identity = `${row.scheduleDate}|${row.classCode}|${row.period}|${normalizedNameForPlan(row.absentTeacherName)}`;
    const previous = coverageIdentityRows.get(identity);
    if (previous) {
      issues.push({
        severity: "WARNING",
        code: "DUPLICATE_COVERAGE_IDENTITY",
        rowId: row.legacyLogId,
        message: `Log_Izin memiliki identitas bisnis yang sama (${previous} dan ${row.legacyLogId}); keduanya tetap dipertahankan sebagai row history terpisah.`,
      });
    } else coverageIdentityRows.set(identity, row.legacyLogId);
  }

  const knownTeacherNames = new Set(teachers.map((teacher) => teacher.fullName.toLocaleLowerCase("id-ID")));
  const referencedTeacherNames = new Set<string>();
  schedules.forEach((row) => row.teacherNames.forEach((name) => name && referencedTeacherNames.add(name)));
  incidentals.forEach((row) => row.teacherNames.forEach((name) => name && referencedTeacherNames.add(name)));
  coverage.forEach((row) => {
    referencedTeacherNames.add(row.absentTeacherName);
    if (row.substituteTeacherName) referencedTeacherNames.add(row.substituteTeacherName);
  });
  for (const name of [...referencedTeacherNames].sort()) {
    if (!knownTeacherNames.has(name.toLocaleLowerCase("id-ID"))) {
      issues.push({ severity: "WARNING", code: "TEACHER_REFERENCE_NOT_IN_MASTER", message: `Referensi guru '${name}' tidak ada di Master Guru. Nama snapshot tetap dipertahankan, teacher_id akan null.` });
    }
  }

  return {
    teachers,
    classes: [...classMap.values()].sort((a, b) => a.code.localeCompare(b.code, "id-ID", { numeric: true })),
    rooms,
    roomUnavailability,
    schedules,
    incidentals,
    academicEvents,
    coverage,
    issues,
    ignoredAccountCount: source.ignoredAccountCount,
    skippedEmptyRows,
  };
}

export function migrationHasBlockers(plan: LegacyMigrationPlan): boolean {
  return plan.issues.some((issue) => issue.severity === "BLOCKING");
}

export function extractUrls(value: string): string[] {
  return [...value.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((match) => match[0]);
}

export function getDriveFileId(url: string): string | null {
  const filePath = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (filePath) return filePath[1];
  const queryId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  return queryId ? queryId[1] : null;
}
