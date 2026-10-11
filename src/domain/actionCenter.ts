import type { LogIzinItem } from "./models";
import type { LeaveReviewRequest, WaitingBadalSession } from "./leaveApproval";
import type { ScheduleConflict } from "./scheduleConflicts";
import { isTaskRecoveryDateActive, normalizeDateString } from "./date";

export interface MissingTaskActionItem {
  key: string;
  scheduleDate: string;
  period: number;
  absentTeacherName: string;
  substituteTeacherName: string;
  classes: string[];
  classLabel: string;
  subjects: string[];
  subjectLabel: string;
}

export interface OperationalActionSummary {
  pendingApprovalCount: number;
  overdueApprovalCount: number;
  waitingBadalCount: number;
  waitingBadalTodayCount: number;
  missingTaskCount: number;
  missingTaskTodayCount: number;
  conflictCount: number;
  blockerCount: number;
  warningCount: number;
  totalActionCount: number;
  urgentTodayCount: number;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

function uniqueDisplay(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = String(raw || "").trim();
    const key = norm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output.sort((a, b) => a.localeCompare(b, "id-ID"));
}

/**
 * Missing-task cards shown to operators. The same semantic boundary as
 * Lengkapi Tugas is used: current/future only, assigned badal only, and no
 * task text yet. Multiple canonical rows from one inferred combined session
 * collapse into one operator action.
 */
export function deriveMissingTaskActions(
  logs: LogIzinItem[],
  schoolToday: string,
): MissingTaskActionItem[] {
  const buckets = new Map<string, LogIzinItem[]>();

  for (const log of logs) {
    if (!isTaskRecoveryDateActive(log.tanggal, schoolToday)) continue;
    if (!String(log.guru_pengganti || "").trim()) continue;
    if (String(log.tugas || "").trim()) continue;

    const key = [
      normalizeDateString(log.tanggal),
      Number(log.jam_ke),
      norm(log.guru_izin),
      norm(log.guru_pengganti),
      norm(log.mapel),
    ].join("|");
    const current = buckets.get(key) || [];
    current.push(log);
    buckets.set(key, current);
  }

  return [...buckets.entries()].map(([key, rows]) => {
    const first = rows[0];
    const classes = uniqueDisplay(rows.map((row) => row.kelas));
    const subjects = uniqueDisplay(rows.map((row) => row.mapel));
    return {
      key,
      scheduleDate: normalizeDateString(first.tanggal),
      period: Number(first.jam_ke),
      absentTeacherName: String(first.guru_izin || "").trim(),
      substituteTeacherName: String(first.guru_pengganti || "").trim(),
      classes,
      classLabel: classes.join(" + "),
      subjects,
      subjectLabel: subjects.join(" + "),
    };
  }).sort((a, b) => (
    a.scheduleDate.localeCompare(b.scheduleDate)
    || a.period - b.period
    || a.absentTeacherName.localeCompare(b.absentTeacherName, "id-ID")
  ));
}

/** Past date-specific conflicts are historical information, not operator work. */
export function filterActionableConflicts(
  conflicts: ScheduleConflict[],
  schoolToday: string,
): ScheduleConflict[] {
  const today = normalizeDateString(schoolToday);
  return conflicts.filter((conflict) => {
    if (conflict.kind !== "INCIDENTAL") return true;
    const date = normalizeDateString(conflict.dayOrDate);
    return !/^\d{4}-\d{2}-\d{2}$/.test(date) || !today || date >= today;
  });
}

export function summarizeOperationalActions(input: {
  pendingRequests: LeaveReviewRequest[];
  waitingSessions: WaitingBadalSession[];
  missingTasks: MissingTaskActionItem[];
  conflicts: ScheduleConflict[];
  schoolToday: string;
}): OperationalActionSummary {
  const today = normalizeDateString(input.schoolToday);
  const blockerCount = input.conflicts.filter((item) => item.severity === "BLOCKER").length;
  const warningCount = input.conflicts.filter((item) => item.severity === "WARNING").length;
  const overdueApprovalCount = input.pendingRequests.filter((item) => {
    const date = normalizeDateString(item.scheduleDate);
    return Boolean(today && date && date < today);
  }).length;
  const waitingBadalTodayCount = input.waitingSessions.filter((item) => normalizeDateString(item.scheduleDate) === today).length;
  const missingTaskTodayCount = input.missingTasks.filter((item) => normalizeDateString(item.scheduleDate) === today).length;

  return {
    pendingApprovalCount: input.pendingRequests.length,
    overdueApprovalCount,
    waitingBadalCount: input.waitingSessions.length,
    waitingBadalTodayCount,
    missingTaskCount: input.missingTasks.length,
    missingTaskTodayCount,
    conflictCount: input.conflicts.length,
    blockerCount,
    warningCount,
    totalActionCount: input.pendingRequests.length + input.waitingSessions.length + input.missingTasks.length + input.conflicts.length,
    urgentTodayCount: overdueApprovalCount + waitingBadalTodayCount + missingTaskTodayCount + blockerCount,
  };
}
