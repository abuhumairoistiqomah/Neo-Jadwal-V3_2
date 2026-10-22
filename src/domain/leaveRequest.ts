import { JAM_TIME_MAP, LEAVE_JPS } from "../constants/schedule";
import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  ScheduleItem,
  Teacher,
} from "./models";
import {
  buildEffectiveScheduleForDate,
  type EffectiveScheduleItem,
} from "./schedule/effectiveSchedule";
import { groupInvalScheduleItems } from "./inval/sessionGrouping";

import type { NewLeaveAbsenceCategory } from "./leaveClassificationV320";

export type LeaveRequestType = "FULL_DAY" | "PARTIAL";
export type LeavePeriodType = "TEACHING" | "FREE";

export interface LeaveTeachingAssignmentDraft {
  classCode: string;
  subject: string;
  source: EffectiveScheduleItem["source"];
  masterId?: string;
  incidentalId?: string;
}

export interface LeaveRequestPeriodDraft {
  key: string;
  scheduleDate: string;
  period: number;
  periodType: LeavePeriodType;
  classCode: string;
  subject: string;
  startTime: string;
  endTime: string;
  source: EffectiveScheduleItem["source"] | "FREE";
  assignments: LeaveTeachingAssignmentDraft[];
  isCombinedSession: boolean;
}

// Compatibility alias for callers/tests that still use the V3.12 name.
export type LeaveRequestSlotDraft = LeaveRequestPeriodDraft;

export interface LeaveRequestTaskResourceDraft {
  resource_type: "LINK";
  label?: string | null;
  url: string;
}

export interface LeaveRequestTaskDraft {
  period: number;
  description?: string;
  resources?: LeaveRequestTaskResourceDraft[];
}

export interface PublicLeaveSubmissionInput {
  teacherName: string;
  scheduleDate: string;
  requestType: LeaveRequestType;
  absenceCategory?: NewLeaveAbsenceCategory;
  reason: string;
  detail?: string;
  slots: LeaveRequestPeriodDraft[];
  tasks?: LeaveRequestTaskDraft[];
}

export interface PublicLeaveSubmissionPayload {
  p_teacher_name: string;
  p_schedule_date: string;
  p_request_type: LeaveRequestType;
  p_absence_category: NewLeaveAbsenceCategory;
  p_reason: string;
  p_detail: string | null;
  /** Teaching assignments only; FREE periods deliberately have no coverage slot. */
  p_slots: Array<{
    class_code: string;
    period: number;
    subject: string;
  }>;
  /** Attendance absence by JP, including periods with no teaching assignment. */
  p_periods: Array<{
    period: number;
    period_type: LeavePeriodType;
  }>;
  /** Teacher-owned task by teaching JP. Drive files are attached after submit. */
  p_tasks: Array<{
    period: number;
    description: string | null;
    resources: LeaveRequestTaskResourceDraft[];
  }>;
}

function normalizeName(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

function isTeacherScheduled(item: EffectiveScheduleItem, teacherName: string): boolean {
  const teacherKey = normalizeName(teacherName);
  return item.scheduledTeachers.some((name) => normalizeName(name) === teacherKey);
}

function isTeacherAlreadyAbsent(item: EffectiveScheduleItem, teacherName: string): boolean {
  const teacherKey = normalizeName(teacherName);
  return item.absentTeachers.some((name) => normalizeName(name) === teacherKey);
}

function timeForPeriod(period: number, items: EffectiveScheduleItem[]): [string, string] {
  const row = items.find((item) => Number(item.jam_ke) === period && (item.mulai || item.selesai));
  if (row) return [row.mulai || "", row.selesai || ""];
  const raw = JAM_TIME_MAP[period] || "";
  const [start = "", end = ""] = raw.split(" - ");
  return [start, end];
}


/** Wali/pendamping assignments may list several canonical classes in one field. */
export function splitHomeroomClasses(value: string): string[] {
  const names = value.split(/[+,;&|/\n]+|\band\b|\bdan\b/gi).map((part) => part.trim()).filter(Boolean);
  return [...new Map(names.map((name) => [name.toLocaleLowerCase("id-ID"), name])).values()];
}

function teacherHomeroomDuty(teacher?: Teacher): { classCode: string; subject: string } | null {
  if (!teacher) return null;
  const wali = String(teacher.wali_kelas || "").trim();
  if (wali) return { classCode: wali, subject: "Homeroom Session (Wali Kelas)" };
  const pendamping = String(teacher.pendamping_kelas || "").trim();
  if (pendamping) return { classCode: pendamping, subject: "Homeroom Session (Pendamping Wali Kelas)" };
  return null;
}

function hasExistingLeaveAtPeriod(args: {
  logs?: LogIzinItem[];
  teacherName: string;
  scheduleDate: string;
  period: number;
}): boolean {
  const teacherKey = normalizeName(args.teacherName);
  return (args.logs || []).some((log) =>
    String(log.tanggal || "") === args.scheduleDate
    && Number(log.jam_ke) === args.period
    && normalizeName(log.guru_izin) === teacherKey
  );
}

/**
 * Derive attendance-leave periods for one teacher on one date.
 *
 * Unlike V3.12, this is period-based rather than assignment-based. Every active
 * school JP is represented. A period with the teacher's active lesson is
 * TEACHING; a period where the teacher has no active lesson is FREE. Only the
 * former later materializes coverage/badal rows.
 */
export function buildTeacherLeaveSlots(args: {
  teacherName: string;
  teacher?: Teacher;
  scheduleDate: string;
  schedules: ScheduleItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
}): LeaveRequestPeriodDraft[] {
  const teacherName = String(args.teacherName || "").trim();
  const scheduleDate = String(args.scheduleDate || "").trim();
  if (!teacherName || !scheduleDate) return [];

  const effective = buildEffectiveScheduleForDate({
    date: scheduleDate,
    schedules: args.schedules,
    jadwalInsidental: args.jadwalInsidental || [],
    logs: args.logs || [],
    kalenderAkademik: args.kalenderAkademik || [],
  });

  // The school-day period universe is inferred from any active KBM that day.
  // JP-0 (Homeroom Session) is a mandatory attendance period whenever the
  // school day itself is active. Homeroom teachers get TEACHING/coverage;
  // everyone else sees JP-0 as FREE/statistics-only.
  const activeSchoolPeriods = new Set(
    effective
      .filter((item) => item.isActive)
      .map((item) => Number(item.jam_ke))
      .filter((period) => (LEAVE_JPS as readonly number[]).includes(period) && period !== 0),
  );
  if (activeSchoolPeriods.size > 0) activeSchoolPeriods.add(0);

  const result: LeaveRequestPeriodDraft[] = [];
  const homeroomDuty = teacherHomeroomDuty(args.teacher);

  for (const period of [...activeSchoolPeriods].sort((a, b) => a - b)) {
    const periodItems = effective.filter((item) => item.isActive && Number(item.jam_ke) === period);
    const teacherItems = periodItems.filter((item) => isTeacherScheduled(item, teacherName));

    // Existing operational leave/coverage means this JP is already accounted
    // for. JP-0 may be virtual (derived from homeroom metadata), so also check
    // raw operational logs by teacher/date/period.
    if (
      teacherItems.some((item) => isTeacherAlreadyAbsent(item, teacherName))
      || hasExistingLeaveAtPeriod({ logs: args.logs, teacherName, scheduleDate, period })
    ) continue;

    const [startTime, endTime] = timeForPeriod(period, periodItems);

    if (period === 0 && teacherItems.length === 0 && homeroomDuty) {
      const homeroomClasses = splitHomeroomClasses(homeroomDuty.classCode);
      result.push({
        key: `${scheduleDate}|JP0`,
        scheduleDate,
        period: 0,
        periodType: "TEACHING",
        classCode: homeroomClasses.join(" + "),
        subject: homeroomDuty.subject,
        startTime,
        endTime,
        source: "MASTER",
        assignments: homeroomClasses.map((classCode) => ({
          classCode,
          subject: homeroomDuty.subject,
          source: "MASTER" as const,
        })),
        isCombinedSession: homeroomClasses.length > 1,
      });
      continue;
    }

    if (teacherItems.length === 0) {
      result.push({
        key: `${scheduleDate}|JP${period}`,
        scheduleDate,
        period,
        periodType: "FREE",
        classCode: "JAM KOSONG",
        subject: period === 0 ? "Homeroom Session • tidak ada tugas wali kelas" : "Tidak ada jadwal mengajar",
        startTime,
        endTime,
        source: "FREE",
        assignments: [],
        isCombinedSession: false,
      });
      continue;
    }

    const groups = groupInvalScheduleItems(teacherItems);
    const assignments = groups.flatMap((group) => group.targetSlots.map((target) => {
      const sourceItem = teacherItems.find((item) => normalizeName(item.kelas) === normalizeName(target.kelas));
      return {
        classCode: target.kelas,
        subject: target.mapel,
        source: sourceItem?.source || "MASTER",
        masterId: sourceItem?.masterId,
        incidentalId: sourceItem?.incidentalId,
      } satisfies LeaveTeachingAssignmentDraft;
    }));

    const classLabels = groups.map((group) => group.kelas).filter(Boolean);
    const subjects = [...new Set(groups.map((group) => group.mapel).filter(Boolean))];
    const source = teacherItems.some((item) => item.source === "INCIDENTAL_ADDITIONAL")
      ? "INCIDENTAL_ADDITIONAL"
      : teacherItems.some((item) => item.source === "INCIDENTAL_OVERRIDE")
        ? "INCIDENTAL_OVERRIDE"
        : "MASTER";

    result.push({
      key: `${scheduleDate}|JP${period}`,
      scheduleDate,
      period,
      periodType: "TEACHING",
      classCode: classLabels.join(" + "),
      subject: subjects.join(" + "),
      startTime,
      endTime,
      source,
      assignments,
      isCombinedSession: groups.some((group) => group.isCombinedGroup),
    });
  }

  return result;
}

/**
 * Partial-day leave selection: explicitly chosen JP plus FREE periods strictly
 * between the earliest and latest selected teaching JP. JP-0 is never pulled
 * in as a gap automatically. A free period outside that range stays optional.
 */
export function resolvePartialLeaveSelection(
  slots: LeaveRequestPeriodDraft[], explicitKeys: ReadonlySet<string>,
): Set<string> {
  const explicit = new Set(slots.filter(slot => explicitKeys.has(slot.key)).map(slot => slot.key));
  const teachingPeriods = slots
    .filter(slot => slot.periodType === "TEACHING" && explicit.has(slot.key))
    .map(slot => slot.period);
  if (teachingPeriods.length < 2) return explicit;
  const first = Math.min(...teachingPeriods);
  const last = Math.max(...teachingPeriods);
  for (const slot of slots) {
    if (slot.periodType === "FREE" && slot.period > first && slot.period < last) {
      explicit.add(slot.key);
    }
  }
  return explicit;
}

export function buildPublicLeaveSubmission(
  input: PublicLeaveSubmissionInput,
): PublicLeaveSubmissionPayload {
  const teacherName = String(input.teacherName || "").trim();
  const scheduleDate = String(input.scheduleDate || "").trim();
  const reason = String(input.reason || "").trim();
  const detail = String(input.detail || "").trim();

  if (!teacherName) throw new Error("Nama guru wajib dipilih.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) throw new Error("Tanggal izin tidak valid.");
  if (input.requestType !== "FULL_DAY" && input.requestType !== "PARTIAL") {
    throw new Error("Jenis izin tidak valid.");
  }
  if (input.absenceCategory !== undefined && !['PERSONAL','SCHOOL_DUTY'].includes(input.absenceCategory)) {
    throw new Error("Kategori izin harus Urusan Pribadi atau Tugas Sekolah.");
  }
  if (!reason) throw new Error("Alasan izin wajib diisi.");
  if (!Array.isArray(input.slots) || input.slots.length === 0) {
    throw new Error("Pilih minimal satu JP yang terdampak.");
  }

  const seenPeriods = new Set<number>();
  const teachingSlots: PublicLeaveSubmissionPayload["p_slots"] = [];
  const periods: PublicLeaveSubmissionPayload["p_periods"] = [];
  const seenTeaching = new Set<string>();

  for (const slot of input.slots) {
    const period = Number(slot.period);
    if (!Number.isInteger(period) || !(LEAVE_JPS as readonly number[]).includes(period)) {
      throw new Error("Ada JP izin yang tidak valid.");
    }
    if (seenPeriods.has(period)) throw new Error("Ada JP izin yang terduplikasi.");
    seenPeriods.add(period);

    const periodType: LeavePeriodType = slot.periodType === "FREE" ? "FREE" : "TEACHING";
    periods.push({ period, period_type: periodType });

    if (periodType === "FREE") {
      if (slot.assignments.length > 0) throw new Error("JP free tidak boleh membawa kelas coverage.");
      continue;
    }

    if (!slot.assignments.length) throw new Error("JP mengajar harus memiliki kelas terdampak.");
    for (const assignment of slot.assignments) {
      const classCode = String(assignment.classCode || "").trim();
      if (!classCode) throw new Error("Ada kelas izin yang tidak valid.");
      const identity = `${classCode.toLocaleLowerCase("id-ID")}|${period}`;
      if (seenTeaching.has(identity)) continue;
      seenTeaching.add(identity);
      teachingSlots.push({
        class_code: classCode,
        period,
        subject: String(assignment.subject || "").trim(),
      });
    }
  }

  const selectedTeachingPeriods = new Set(
    periods.filter((item) => item.period_type === "TEACHING").map((item) => item.period),
  );
  // JP-0 Homeroom requires a substitute but not a lesson-material task.
  const taskEligiblePeriods = new Set([...selectedTeachingPeriods].filter((period) => period > 0));
  const taskByPeriod = new Map<number, PublicLeaveSubmissionPayload["p_tasks"][number]>();
  for (const task of input.tasks || []) {
    const period = Number(task.period);
    if (!taskEligiblePeriods.has(period)) {
      throw new Error(`Tugas hanya boleh diisi untuk JP mengajar yang dipilih (JP ${period}).`);
    }
    const resources = (task.resources || []).map((resource) => ({
      resource_type: "LINK" as const,
      label: resource.label ? String(resource.label).trim() : null,
      url: String(resource.url || "").trim(),
    })).filter((resource) => /^https?:\/\//i.test(resource.url));
    taskByPeriod.set(period, {
      period,
      description: String(task.description || "").trim() || null,
      resources,
    });
  }

  // Every selected TEACHING JP gets a task row even when text is blank, so a
  // file-only task can be attached immediately after the leave request submits.
  for (const period of taskEligiblePeriods) {
    if (!taskByPeriod.has(period)) {
      taskByPeriod.set(period, { period, description: null, resources: [] });
    }
  }

  return {
    p_teacher_name: teacherName,
    p_schedule_date: scheduleDate,
    p_request_type: input.requestType,
    p_absence_category: input.absenceCategory ?? "PERSONAL",
    p_reason: reason,
    p_detail: detail || null,
    p_slots: teachingSlots,
    p_periods: periods,
    p_tasks: [...taskByPeriod.values()].sort((a, b) => a.period - b.period),
  };
}
