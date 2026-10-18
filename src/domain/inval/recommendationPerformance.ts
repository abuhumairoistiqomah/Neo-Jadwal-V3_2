import type { LogIzinItem, Teacher } from "../models";
import {
  checkIsITBA,
  isAlQuranOrTahsin,
  isITBACoreSubject,
} from "../teacher";
import type { EffectiveScheduleItem } from "../schedule/effectiveSchedule";
/** Minimal attendance projection; never expose private leave reasons in recommendations. */
export interface ApprovedLeavePeriodAvailability {
  teacherId: string;
  date: string;
  period: number;
}

export interface GeneratedInvalRowForRecommendation {
  jam_ke: number;
  kelas: string;
  mapel: string;
  selectedPengganti: string;
  tugas?: string;
  constraintOverrideIds?: string[];
  recommendationClassLabel?: string;
  targetSlots?: Array<{ kelas: string; mapel: string }>;
}

export interface TeacherDayRecommendationStats {
  regularTeachingJamKe: Set<number>;
  scheduleByPeriod: Map<number, EffectiveScheduleItem[]>;
  busyPeriods: Set<number>;
  pendampingPeriods: Set<number>;
  assistingNonCorePeriods: Set<number>;
  periodDutyKind: Map<number, "PENDAMPING" | "MENGAJAR">;
  isPendampingOnDay: boolean;
}

export interface InvalRecommendationDayIndex {
  /** Exact leave periods by teacher. A teacher absent in JP2 remains available in JP4. */
  absentJamKeByTeacher: Map<string, Set<number>>;
  savedSubstituteJamKeByTeacher: Map<string, Set<number>>;
  savedSubstituteTeachersByPeriod: Map<number, Set<string>>;
  teacherStatsByName: Map<string, TeacherDayRecommendationStats>;
}

export interface FormAssignmentRef {
  rowIndex: number;
  jamKe: number;
}

export function normalizeTeacherKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Only fields that can change recommendation output belong in this key.
 * `tugas` is intentionally excluded so typing task text does not invalidate
 * the expensive recommendation memo.
 */
export function buildRecommendationDependencyKey(
  rows: GeneratedInvalRowForRecommendation[],
): string {
  return rows
    .map((row, index) => [
      index,
      Number(row.jam_ke),
      (row.kelas || "").trim().toLowerCase(),
      (row.recommendationClassLabel || "").trim().toLowerCase(),
      (row.mapel || "").trim().toLowerCase(),
      (row.targetSlots || [])
        .map((slot) => `${String(slot.kelas || "").trim().toLowerCase()}@${String(slot.mapel || "").trim().toLowerCase()}`)
        .sort()
        .join(","),
      normalizeTeacherKey(row.selectedPengganti),
      [...(row.constraintOverrideIds || [])].sort().join(","),
    ].join("::"))
    .join("||");
}

export function buildFormAssignmentsByTeacher(
  rows: GeneratedInvalRowForRecommendation[],
): Map<string, FormAssignmentRef[]> {
  const result = new Map<string, FormAssignmentRef[]>();
  rows.forEach((row, rowIndex) => {
    const key = normalizeTeacherKey(row.selectedPengganti);
    if (!key) return;
    const existing = result.get(key) || [];
    existing.push({ rowIndex, jamKe: Number(row.jam_ke) });
    result.set(key, existing);
  });
  return result;
}

function teacherAppearsInSlot(slot: EffectiveScheduleItem, teacherKey: string): boolean {
  return [slot.guru1, slot.guru2, slot.guru3, slot.guru4, slot.guru5, slot.guru6]
    .some((name) => normalizeTeacherKey(name) === teacherKey);
}

function classifyDutyForTeacher(
  slot: EffectiveScheduleItem,
  teacher: Teacher,
): "PENDAMPING" | "MENGAJAR" {
  if (isAlQuranOrTahsin(slot.mapel)) return "MENGAJAR";

  const teacherKey = normalizeTeacherKey(teacher.nama);
  const isGuru1 = normalizeTeacherKey(slot.guru1) === teacherKey;
  const isITBA = checkIsITBA(teacher);

  if (isITBA) {
    const subject = (slot.mapel || "").trim().toLowerCase();
    const isArabic =
      subject.includes("arabic") ||
      subject.includes("bahasa arab") ||
      subject.includes("arab") ||
      subject.includes("b. arab") ||
      subject.includes("b.arab");

    if (isArabic) return isGuru1 ? "MENGAJAR" : "PENDAMPING";
    return isITBACoreSubject(slot.mapel, teacher.nama) ? "MENGAJAR" : "PENDAMPING";
  }

  const isSupervisingCol = ["yes", "ya"].includes(
    (slot.selainguru1_mengawas || "").trim().toLowerCase(),
  );
  return !isGuru1 && isSupervisingCol ? "PENDAMPING" : "MENGAJAR";
}

function isBusyForTeacher(slot: EffectiveScheduleItem, teacher: Teacher): boolean {
  if (!slot.isActive) return false;

  const teacherKey = normalizeTeacherKey(teacher.nama);
  const isGuru1 = normalizeTeacherKey(slot.guru1) === teacherKey;
  const assistingNames = [slot.guru2, slot.guru3, slot.guru4, slot.guru5, slot.guru6];
  const isAssisting = assistingNames.some((name) => normalizeTeacherKey(name) === teacherKey);
  if (!isGuru1 && !isAssisting) return false;

  if (isAlQuranOrTahsin(slot.mapel)) return true;

  const isSupervisingCol = ["yes", "ya"].includes(
    (slot.selainguru1_mengawas || "").trim().toLowerCase(),
  );
  if (isAssisting) return !isSupervisingCol;

  if (checkIsITBA(teacher)) {
    return isITBACoreSubject(slot.mapel, teacher.nama);
  }

  return true;
}

/**
 * Builds the read-only indexes used by all candidate rows for one selected date.
 * This replaces repeated O(teachers × schedule × logs) scans during each render.
 */
export function buildInvalRecommendationDayIndex(args: {
  teachers: Teacher[];
  effectiveSchedulesForDate: EffectiveScheduleItem[];
  logs: LogIzinItem[];
  date: string;
  approvedLeavePeriods?: ApprovedLeavePeriodAvailability[];
}): InvalRecommendationDayIndex {
  const { teachers, effectiveSchedulesForDate, logs, date } = args;

  const absentJamKeByTeacher = new Map<string, Set<number>>();
  const savedSubstituteJamKeByTeacher = new Map<string, Set<number>>();
  const savedSubstituteTeachersByPeriod = new Map<number, Set<string>>();

  logs.forEach((log) => {
    if (log.tanggal !== date) return;

    const absentKey = normalizeTeacherKey(log.guru_izin);
    const period = Number(log.jam_ke);
    if (absentKey && Number.isFinite(period)) {
      if (!absentJamKeByTeacher.has(absentKey)) {
        absentJamKeByTeacher.set(absentKey, new Set<number>());
      }
      absentJamKeByTeacher.get(absentKey)!.add(period);
    }

    const substituteKey = normalizeTeacherKey(log.guru_pengganti);
    if (!substituteKey) return;

    if (!savedSubstituteJamKeByTeacher.has(substituteKey)) {
      savedSubstituteJamKeByTeacher.set(substituteKey, new Set<number>());
    }
    savedSubstituteJamKeByTeacher.get(substituteKey)!.add(period);

    if (!savedSubstituteTeachersByPeriod.has(period)) {
      savedSubstituteTeachersByPeriod.set(period, new Set<string>());
    }
    savedSubstituteTeachersByPeriod.get(period)!.add(substituteKey);
  });

  // Unlike coverage_slots, leave_request_periods includes FREE periods.
  // Use the canonical teacher UUID so a JP FREE still blocks recommendation.
  const namesById = new Map(teachers.filter(t=>t.id).map(t=>[String(t.id), normalizeTeacherKey(t.nama)]));
  for (const leave of args.approvedLeavePeriods || []) {
    if (leave.date !== date) continue;
    const teacherKey = namesById.get(leave.teacherId);
    if (!teacherKey || !Number.isInteger(leave.period)) continue;
    const periods = absentJamKeByTeacher.get(teacherKey) || new Set<number>();
    periods.add(leave.period);
    absentJamKeByTeacher.set(teacherKey, periods);
  }

  const schedulesByTeacher = new Map<string, EffectiveScheduleItem[]>();
  effectiveSchedulesForDate.forEach((slot) => {
    const uniqueTeacherKeys = new Set(
      [slot.guru1, slot.guru2, slot.guru3, slot.guru4, slot.guru5, slot.guru6]
        .map(normalizeTeacherKey)
        .filter(Boolean),
    );
    uniqueTeacherKeys.forEach((key) => {
      const rows = schedulesByTeacher.get(key) || [];
      rows.push(slot);
      schedulesByTeacher.set(key, rows);
    });
  });

  const teacherStatsByName = new Map<string, TeacherDayRecommendationStats>();
  teachers.forEach((teacher) => {
    const teacherKey = normalizeTeacherKey(teacher.nama);
    const teacherSchedules = schedulesByTeacher.get(teacherKey) || [];
    const regularTeachingJamKe = new Set<number>();
    const scheduleByPeriod = new Map<number, EffectiveScheduleItem[]>();
    const busyPeriods = new Set<number>();
    const pendampingPeriods = new Set<number>();
    const assistingNonCorePeriods = new Set<number>();
    const periodDutyKind = new Map<number, "PENDAMPING" | "MENGAJAR">();

    let hasAnyPendampingSlot = false;

    teacherSchedules.forEach((slot) => {
      if (!teacherAppearsInSlot(slot, teacherKey)) return;
      const period = Number(slot.jam_ke);
      regularTeachingJamKe.add(period);

      const rows = scheduleByPeriod.get(period) || [];
      rows.push(slot);
      scheduleByPeriod.set(period, rows);

      const dutyKind = classifyDutyForTeacher(slot, teacher);
      if (dutyKind === "PENDAMPING") {
        pendampingPeriods.add(period);
        hasAnyPendampingSlot = true;
      }

      // V3.11 load breakdown ignored calendar-suppressed regular duties when
      // classifying mengajar vs pendamping, even though the raw occupied-period
      // set still contained those periods. Preserve that behavior here.
      if (slot.isActive) {
        const prior = periodDutyKind.get(period);
        if (prior !== "MENGAJAR") {
          periodDutyKind.set(period, dutyKind);
        }
      }

      if (isBusyForTeacher(slot, teacher)) busyPeriods.add(period);

      // Preserve V3.11 scoring semantics: this flag did not filter academic calendar.
      if (checkIsITBA(teacher)) assistingNonCorePeriods.add(period);
    });

    const isPendampingOnDay = hasAnyPendampingSlot;

    teacherStatsByName.set(teacherKey, {
      regularTeachingJamKe,
      scheduleByPeriod,
      busyPeriods,
      pendampingPeriods,
      assistingNonCorePeriods,
      periodDutyKind,
      isPendampingOnDay,
    });
  });

  return {
    absentJamKeByTeacher,
    savedSubstituteJamKeByTeacher,
    savedSubstituteTeachersByPeriod,
    teacherStatsByName,
  };
}
