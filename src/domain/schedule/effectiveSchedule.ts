import { datedInstructionOverridesCalendar } from "./calendarPriority";
import { JAM_TIME_MAP } from "../../constants/schedule";
import { getAcademicCalendarEvent } from "../calendar";
import { isClassMatch } from "../class";
import { normalizeDateString, normalizeDay } from "../date";
import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  ScheduleItem,
} from "../models";
import { hasMeaningfulValue } from "../teacher";

export type EffectiveScheduleSource =
  | "MASTER"
  | "INCIDENTAL_OVERRIDE"
  | "INCIDENTAL_ADDITIONAL";

export interface EffectiveSubstitution {
  logId: string;
  absentTeacher: string;
  substituteTeacher: string;
  reason: string;
  task?: string;
}

/**
 * Canonical schedule row for one concrete calendar date.
 *
 * `guru1..guru6` are the scheduled teachers AFTER Jadwal_Insidental inheritance
 * but BEFORE Log_Izin is applied. This intentionally preserves the underlying
 * teaching assignment for audit/debugging. Use `effectiveTeachers` for the
 * teachers who should actually cover the slot after izin/badal.
 */
export interface EffectiveScheduleItem extends ScheduleItem {
  tanggal: string;
  source: EffectiveScheduleSource;
  masterId?: string;
  incidentalId?: string;
  incidentalReason?: string;
  incidentalType?: string;
  /** Indicates an explicit dated teacher-team replacement, not a room-only move. */
  teacherTeamReplaced?: boolean;

  scheduledTeachers: string[];
  absentTeachers: string[];
  substituteTeachers: string[];
  effectiveTeachers: string[];
  substitutions: EffectiveSubstitution[];
  logIds: string[];

  academicEvent: KalenderAkademikItem | null;
  isSuppressedByAcademicCalendar: boolean;
  isActive: boolean;
}

export interface BuildEffectiveScheduleForDateInput {
  date: string;
  schedules: ScheduleItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
}

const TEACHER_FIELDS = ["guru1", "guru2", "guru3", "guru4", "guru5", "guru6"] as const;
type TeacherField = (typeof TEACHER_FIELDS)[number];

function normalizeName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function uniqueNames(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const name = typeof value === "string" ? value.trim() : "";
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(name);
  });

  return result;
}

function dateToIndonesianDay(dateValue: string): string {
  const normalized = normalizeDateString(dateValue);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return "";

  const names = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return names[date.getDay()] || "";
}

function isSameScheduleClass(classA: string | null | undefined, classB: string | null | undefined): boolean {
  if (!classA || !classB) return false;
  return isClassMatch(classA, classB);
}

function isIncidentalForDate(incidental: JadwalInsidentalItem, date: string): boolean {
  return normalizeDateString(incidental.tanggal) === date;
}

function isLogForSlot(log: LogIzinItem, date: string, kelas: string, jamKe: number): boolean {
  if (normalizeDateString(log.tanggal) !== date) return false;
  if (Number(log.jam_ke) !== Number(jamKe)) return false;
  return isSameScheduleClass(log.kelas, kelas);
}

function inheritString(overrideValue: unknown, baseValue: string | undefined): string {
  return hasMeaningfulValue(overrideValue) ? String(overrideValue).trim() : (baseValue || "");
}

function applyIncidentalOverride(
  master: ScheduleItem,
  incidental: JadwalInsidentalItem,
  date: string,
): EffectiveScheduleItem {
  const inheritedTeachers = {} as Pick<ScheduleItem, TeacherField>;
  TEACHER_FIELDS.forEach((field) => {
    inheritedTeachers[field] = incidental.replaceTeachers
      ? String(incidental[field] || "").trim()
      : inheritString(incidental[field], master[field]);
  });

  const merged: ScheduleItem = {
    ...master,
    // Preserve the concrete master class identity. A combined-class incidental may
    // cover several classes, but must not rename each effective row to the whole group.
    kelas: master.kelas,
    mapel: inheritString(incidental.mapel, master.mapel),
    mulai: inheritString(incidental.mulai, master.mulai),
    selesai: inheritString(incidental.selesai, master.selesai),
    ...inheritedTeachers,
    kelasgabung: inheritString(incidental.kelasgabung, master.kelasgabung),
    ruangan: inheritString(incidental.ruangan, master.ruangan),
    keterangan_khusus: inheritString(incidental.keterangan_khusus, master.keterangan_khusus),
  };

  return createEffectiveItem({
    schedule: merged,
    date,
    source: "INCIDENTAL_OVERRIDE",
    masterId: master.id,
    incidentalId: incidental.id,
    incidentalReason: incidental.alasan || "",
    incidentalType: incidental.tipe_insidental || "",
    teacherTeamReplaced: Boolean(incidental.replaceTeachers),
  });
}

function createStandaloneIncidental(
  incidental: JadwalInsidentalItem,
  date: string,
  dayName: string,
  index: number,
): EffectiveScheduleItem {
  const time = JAM_TIME_MAP[Number(incidental.jam_ke)] || "";
  const [mulai = "", selesai = ""] = time ? time.split(" - ") : ["", ""];

  const schedule: ScheduleItem = {
    id: incidental.id || `incidental-${date}-${index}`,
    kelas: incidental.kelas || "",
    hari: dayName,
    jam_ke: Number(incidental.jam_ke),
    mulai: inheritString(incidental.mulai, mulai),
    selesai: inheritString(incidental.selesai, selesai),
    mapel: incidental.mapel || "",
    guru1: incidental.guru1 || "",
    guru2: incidental.guru2 || "",
    guru3: incidental.guru3 || "",
    guru4: incidental.guru4 || "",
    guru5: incidental.guru5 || "",
    guru6: incidental.guru6 || "",
    kelasgabung: hasMeaningfulValue(incidental.kelasgabung) ? String(incidental.kelasgabung).trim() : "Tidak",
    ruangan: incidental.ruangan || "",
    keterangan_khusus: incidental.keterangan_khusus || "",
  };

  return createEffectiveItem({
    schedule,
    date,
    source: "INCIDENTAL_ADDITIONAL",
    incidentalId: incidental.id,
    incidentalReason: incidental.alasan || "",
    incidentalType: incidental.tipe_insidental || "",
    teacherTeamReplaced: Boolean(incidental.replaceTeachers),
  });
}

function createEffectiveItem(args: {
  schedule: ScheduleItem;
  date: string;
  source: EffectiveScheduleSource;
  masterId?: string;
  incidentalId?: string;
  incidentalReason?: string;
  incidentalType?: string;
  teacherTeamReplaced?: boolean;
}): EffectiveScheduleItem {
  const scheduledTeachers = uniqueNames(TEACHER_FIELDS.map((field) => args.schedule[field]));

  return {
    ...args.schedule,
    tanggal: args.date,
    source: args.source,
    masterId: args.masterId,
    incidentalId: args.incidentalId,
    incidentalReason: args.incidentalReason || "",
    incidentalType: args.incidentalType || "",
    teacherTeamReplaced: Boolean(args.teacherTeamReplaced),
    scheduledTeachers,
    absentTeachers: [],
    substituteTeachers: [],
    effectiveTeachers: scheduledTeachers,
    substitutions: [],
    logIds: [],
    academicEvent: null,
    isSuppressedByAcademicCalendar: false,
    isActive: true,
  };
}

function applyLogs(item: EffectiveScheduleItem, logs: LogIzinItem[]): EffectiveScheduleItem {
  const relevantLogs = logs.filter((log) => {
    if (!isLogForSlot(log, item.tanggal, item.kelas, item.jam_ke)) return false;
    // A new explicit teacher team supersedes the old lesson; old teachers' leave
    // records remain in the log but must not re-appear on the new class schedule.
    if (item.teacherTeamReplaced) {
      return item.scheduledTeachers.some((teacher) => normalizeName(teacher) === normalizeName(log.guru_izin));
    }
    return true;
  });
  if (relevantLogs.length === 0) return item;

  const absentTeachers = uniqueNames(relevantLogs.map((log) => log.guru_izin));
  const substituteTeachers = uniqueNames(relevantLogs.map((log) => log.guru_pengganti));
  const absentKeys = new Set(absentTeachers.map((name) => normalizeName(name)));

  const remainingScheduledTeachers = item.scheduledTeachers.filter(
    (teacher) => !absentKeys.has(normalizeName(teacher)),
  );

  const substitutions: EffectiveSubstitution[] = relevantLogs.map((log) => ({
    logId: log.id,
    absentTeacher: (log.guru_izin || "").trim(),
    substituteTeacher: (log.guru_pengganti || "").trim(),
    reason: (log.alasan || "").trim(),
    task: log.tugas,
  }));

  return {
    ...item,
    absentTeachers,
    substituteTeachers,
    effectiveTeachers: uniqueNames([...remainingScheduledTeachers, ...substituteTeachers]),
    substitutions,
    logIds: relevantLogs.map((log) => log.id),
  };
}

function applyAcademicCalendar(
  item: EffectiveScheduleItem,
  kalenderAkademik: KalenderAkademikItem[],
): EffectiveScheduleItem {
  const event = getAcademicCalendarEvent(
    item.tanggal,
    item.kelas,
    Number(item.jam_ke),
    kalenderAkademik,
  );

  if (!event) return item;

  // A specifically assigned dated teaching replacement has greater operational
  // specificity than the cancellation of regular KBM. E.g. when a school has
  // Rumah Tahfidz, 04 INTER's normal subject is cancelled but a teacher may be
  // explicitly reassigned via incidental to exam preparation in 09 AE/MQ.
  // Room-only changes (without replacement team/subject) do NOT resurrect KBM.
  if (datedInstructionOverridesCalendar({
    event, isDated: item.source !== "MASTER",
    replacesTeachers: Boolean(item.teacherTeamReplaced), teacherNames: item.scheduledTeachers,
  })) {
    return { ...item, academicEvent: event, isSuppressedByAcademicCalendar: false, isActive: true };
  }

  return {
    ...item,
    academicEvent: event,
    isSuppressedByAcademicCalendar: true,
    isActive: false,
  };
}

function compareEffectiveScheduleItems(a: EffectiveScheduleItem, b: EffectiveScheduleItem): number {
  const byJp = Number(a.jam_ke) - Number(b.jam_ke);
  if (byJp !== 0) return byJp;

  const byClass = (a.kelas || "").localeCompare(b.kelas || "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (byClass !== 0) return byClass;

  return a.source.localeCompare(b.source);
}

/**
 * Builds the canonical schedule for one real calendar date.
 *
 * Merge order is intentionally fixed:
 *   Master -> Jadwal_Insidental -> Log_Izin/Badal -> Kalender_Akademik
 *
 * Important rules:
 * - Incidental identity is date + class + jam_ke; mapel is NOT part of identity.
 * - Blank incidental values inherit master values, except a Supabase-explicit
 *   teacher-team replacement: any unused teacher positions are cleared.
 * - Unmatched incidentals become additional schedule rows.
 * - Log_Izin removes the absent teacher and adds guru_pengganti when supplied.
 * - Kalender_Akademik is applied last and marks the slot inactive instead of
 *   deleting it, so consumers can still explain why the lesson does not occur.
 */
export function buildEffectiveScheduleForDate({
  date,
  schedules,
  jadwalInsidental = [],
  logs = [],
  kalenderAkademik = [],
}: BuildEffectiveScheduleForDateInput): EffectiveScheduleItem[] {
  const normalizedDate = normalizeDateString(date);
  if (!normalizedDate) return [];

  const dayName = dateToIndonesianDay(normalizedDate);
  if (!dayName) return [];

  const daySchedules = schedules.filter((schedule) => normalizeDay(schedule.hari) === normalizeDay(dayName));
  const dateIncidentals = jadwalInsidental.filter((incidental) => isIncidentalForDate(incidental, normalizedDate));
  const matchedIncidentalIndices = new Set<number>();
  const overriddenClassSlots = new Set<string>();

  const masterDerivedItems = daySchedules.map((master) => {
    const incidentalIndex = dateIncidentals.findIndex(
      (incidental) =>
        Number(incidental.jam_ke) === Number(master.jam_ke) &&
        isSameScheduleClass(incidental.kelas, master.kelas),
    );

    if (incidentalIndex < 0) {
      return createEffectiveItem({
        schedule: master,
        date: normalizedDate,
        source: "MASTER",
        masterId: master.id,
      });
    }

    matchedIncidentalIndices.add(incidentalIndex);
    // Legacy master data may contain multiple subjects for the same class/JP.
    // Once a dated incidental occupies that slot, it becomes ONE effective row.
    const slotKey = `${normalizeName(master.kelas)}|${Number(master.jam_ke)}`;
    if (overriddenClassSlots.has(slotKey)) return null;
    overriddenClassSlots.add(slotKey);
    return applyIncidentalOverride(master, dateIncidentals[incidentalIndex], normalizedDate);
  });

  const additionalItems = dateIncidentals
    .map((incidental, index) => ({ incidental, index }))
    .filter(({ index }) => !matchedIncidentalIndices.has(index))
    .map(({ incidental, index }) => createStandaloneIncidental(incidental, normalizedDate, dayName, index));

  return [...masterDerivedItems.filter((item): item is EffectiveScheduleItem => item !== null), ...additionalItems]
    .map((item) => applyLogs(item, logs))
    .map((item) => applyAcademicCalendar(item, kalenderAkademik))
    .sort(compareEffectiveScheduleItems);
}

/** Returns only slots whose normal KBM remains active after Kalender_Akademik. */
export function getActiveEffectiveSchedules(items: EffectiveScheduleItem[]): EffectiveScheduleItem[] {
  return items.filter((item) => item.isActive);
}
