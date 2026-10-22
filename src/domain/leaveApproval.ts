import type { LeaveAbsenceCategory } from "./leaveClassificationV320";

export type LeaveWorkflowStatus = "SUBMITTED" | "APPROVED" | "DECLINED" | "CANCELLED" | string;

export interface LeaveReviewPeriod {
  id: string;
  scheduleDate: string;
  period: number;
  periodType: "TEACHING" | "FREE";
}

export interface LeaveReviewSlot {
  id: string;
  scheduleDate: string;
  period: number;
  classCode: string;
  subject: string;
}

export interface LeaveReviewTaskResource {
  resourceType: "LINK" | "DRIVE_FILE" | string;
  label: string;
  url: string;
  fileName: string;
}

export interface LeaveReviewTask {
  id: string;
  period: number;
  description: string;
  resources: LeaveReviewTaskResource[];
}

export interface LeaveReviewRequest {
  id: string;
  requestCode: string;
  teacherId: string;
  teacherName: string;
  scheduleDate: string;
  requestType: "FULL_DAY" | "PARTIAL" | string;
  absenceCategory?: LeaveAbsenceCategory;
  reason: string;
  detail: string | null;
  status: LeaveWorkflowStatus;
  submittedAt: string;
  evidencePath?: string;
  evidenceUploadedAt?: string;
  periods: LeaveReviewPeriod[];
  slots: LeaveReviewSlot[];
  tasks: LeaveReviewTask[];
}

export interface LeaveDecisionResult {
  requestId: string;
  requestCode: string;
  status: "APPROVED" | "DECLINED" | string;
  coverageSlotIds: string[];
  waitingCount: number;
  freePeriodCount: number;
  teachingPeriodCount: number;
}

export interface WaitingCoverageRow {
  id: string;
  leaveRequestId: string | null;
  requestCode: string;
  scheduleDate: string;
  period: number;
  classCode: string;
  subject: string;
  absentTeacherId: string;
  absentTeacherName: string;
  reason: string;
  status: string;
  source: string;
  createdAt: string;
  taskText: string;
  taskUrls: string[];
}

export interface WaitingBadalSession {
  key: string;
  leaveRequestId: string | null;
  requestCode: string;
  scheduleDate: string;
  period: number;
  classCodes: string[];
  classLabel: string;
  subject: string;
  absentTeacherId: string;
  absentTeacherName: string;
  reason: string;
  coverageSlotIds: string[];
  createdAt: string;
  isCombinedSession: boolean;
  taskText: string;
  taskUrls: string[];
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

/**
 * Operator-facing grouping for approved coverage rows.
 *
 * V3.12.1 already defines same teacher + same JP + same subject as one inferred
 * teaching session. Approval still stores one coverage row per concrete class;
 * this projection recombines those rows for the Wakasek waiting-list UI.
 */
export function groupWaitingBadalRows(rows: WaitingCoverageRow[]): WaitingBadalSession[] {
  const groups = new Map<string, WaitingBadalSession>();

  for (const row of rows) {
    const key = [
      row.leaveRequestId || "manual",
      row.scheduleDate,
      Number(row.period),
      norm(row.absentTeacherId || row.absentTeacherName),
      norm(row.subject),
    ].join("|");

    const existing = groups.get(key);
    if (!existing) {
      const classCode = String(row.classCode || "").trim();
      groups.set(key, {
        key,
        leaveRequestId: row.leaveRequestId,
        requestCode: row.requestCode,
        scheduleDate: row.scheduleDate,
        period: Number(row.period),
        classCodes: classCode ? [classCode] : [],
        classLabel: classCode,
        subject: row.subject,
        absentTeacherId: row.absentTeacherId,
        absentTeacherName: row.absentTeacherName,
        reason: row.reason,
        coverageSlotIds: [row.id],
        createdAt: row.createdAt,
        isCombinedSession: false,
        taskText: row.taskText || "",
        taskUrls: [...(row.taskUrls || [])],
      });
      continue;
    }

    const classCode = String(row.classCode || "").trim();
    if (classCode && !existing.classCodes.some((item) => norm(item) === norm(classCode))) {
      existing.classCodes.push(classCode);
    }
    if (!existing.coverageSlotIds.includes(row.id)) existing.coverageSlotIds.push(row.id);
    existing.classLabel = existing.classCodes.join(" + ");
    existing.isCombinedSession = existing.classCodes.length > 1;
    if (!existing.taskText && row.taskText) existing.taskText = row.taskText;
    for (const url of row.taskUrls || []) {
      if (url && !existing.taskUrls.includes(url)) existing.taskUrls.push(url);
    }
    if (row.createdAt && (!existing.createdAt || row.createdAt < existing.createdAt)) {
      existing.createdAt = row.createdAt;
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      classCodes: [...group.classCodes].sort((a, b) => a.localeCompare(b, "id-ID")),
      classLabel: [...group.classCodes].sort((a, b) => a.localeCompare(b, "id-ID")).join(" + "),
      isCombinedSession: group.classCodes.length > 1,
    }))
    .sort((a, b) => {
      const dateDiff = a.scheduleDate.localeCompare(b.scheduleDate);
      if (dateDiff !== 0) return dateDiff;
      const periodDiff = a.period - b.period;
      if (periodDiff !== 0) return periodDiff;
      return a.absentTeacherName.localeCompare(b.absentTeacherName, "id-ID");
    });
}

export function summarizeLeaveRequest(request: LeaveReviewRequest): {
  periodCount: number;
  teachingPeriodCount: number;
  freePeriodCount: number;
  teachingClassCount: number;
} {
  const teachingPeriodCount = request.periods.filter((period) => period.periodType === "TEACHING").length;
  const freePeriodCount = request.periods.filter((period) => period.periodType === "FREE").length;
  return {
    periodCount: request.periods.length,
    teachingPeriodCount,
    freePeriodCount,
    teachingClassCount: request.slots.length,
  };
}

export function buildBadalProcessingUrl(session: WaitingBadalSession): string {
  const params = new URLSearchParams();
  params.set("supabase-inval-write", "1");
  params.set("date", session.scheduleDate);
  params.set("teacher", session.absentTeacherName);
  params.set("period", String(session.period));
  if (session.reason) params.set("reason", session.reason);
  if (session.requestCode) params.set("leave", session.requestCode);
  return `/?${params.toString()}`;
}
