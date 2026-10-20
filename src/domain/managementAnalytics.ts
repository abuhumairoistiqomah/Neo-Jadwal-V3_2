export interface ManagementAnalyticsSummary {
  requestTotal: number;
  requestSubmitted: number;
  requestApproved: number;
  requestDeclined: number;
  requestCancelled: number;
  absentTeacherDays: number;
  uniqueAbsentTeachers: number;
  uniqueSubstituteTeachers: number;
  absencePeriodsTotal: number;
  teachingAbsencePeriods: number;
  freeAbsencePeriods: number;
  homeroomAbsencePeriods: number;
  coverageNeededPeriods: number;
  coverageAssignedPeriods: number;
  coverageWaitingPeriods: number;
  coverageNoSubstitutePeriods: number;
  coverageExpiredPeriods: number;
  coverageMissingPeriods: number;
  coverageRatePct: number;
  taskEligiblePeriods: number;
  taskReadyPeriods: number;
  taskMissingPeriods: number;
  taskReadinessPct: number;
}

export interface ManagementTeacherAnalyticsRow {
  teacherId: string;
  teacherName: string;
  gender: string;
  regularWeeklyJp: number;
  leaveDays: number;
  absencePeriods: number;
  teachingAbsencePeriods: number;
  freeAbsencePeriods: number;
  homeroomAbsencePeriods: number;
  substitutePeriods: number;
  taskEligiblePeriods: number;
  taskReadyPeriods: number;
  taskReadinessPct: number;
  /** V3.18 — one teacher/date/JP counts once, JP1–6 only. */
  effectiveTeachingJp?: number;
  totalLeaveJp?: number;
  effectiveTeachingDays?: number;
  totalLeaveDays?: number;
  teachingSharePct?: number | null;
  leaveSharePct?: number | null;
}

export interface ManagementDailyAnalyticsRow {
  date: string;
  teachingAbsencePeriods: number;
  freeAbsencePeriods: number;
  assignedCoveragePeriods: number;
  taskReadyPeriods: number;
}

export interface ManagementReasonAnalyticsRow {
  reason: string;
  requestCount: number;
  approvedPeriodCount: number;
}

export interface ManagementRequestStatusRow {
  status: string;
  count: number;
}

export interface ManagementAnalyticsPayload {
  dateStart: string;
  dateEnd: string;
  generatedAt: string;
  summary: ManagementAnalyticsSummary;
  teachers: ManagementTeacherAnalyticsRow[];
  daily: ManagementDailyAnalyticsRow[];
  reasons: ManagementReasonAnalyticsRow[];
  requestStatuses: ManagementRequestStatusRow[];
}

const numberValue = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampPct = (value: unknown): number => {
  const parsed = numberValue(value);
  return Math.max(0, Math.min(100, parsed));
};

export function normalizeManagementAnalyticsPayload(raw: any): ManagementAnalyticsPayload {
  const summary = raw?.summary || {};
  return {
    dateStart: String(raw?.date_start || raw?.dateStart || ""),
    dateEnd: String(raw?.date_end || raw?.dateEnd || ""),
    generatedAt: String(raw?.generated_at || raw?.generatedAt || ""),
    summary: {
      requestTotal: numberValue(summary.request_total),
      requestSubmitted: numberValue(summary.request_submitted),
      requestApproved: numberValue(summary.request_approved),
      requestDeclined: numberValue(summary.request_declined),
      requestCancelled: numberValue(summary.request_cancelled),
      absentTeacherDays: numberValue(summary.absent_teacher_days),
      uniqueAbsentTeachers: numberValue(summary.unique_absent_teachers),
      uniqueSubstituteTeachers: numberValue(summary.unique_substitute_teachers),
      absencePeriodsTotal: numberValue(summary.absence_periods_total),
      teachingAbsencePeriods: numberValue(summary.teaching_absence_periods),
      freeAbsencePeriods: numberValue(summary.free_absence_periods),
      homeroomAbsencePeriods: numberValue(summary.homeroom_absence_periods),
      coverageNeededPeriods: numberValue(summary.coverage_needed_periods),
      coverageAssignedPeriods: numberValue(summary.coverage_assigned_periods),
      coverageWaitingPeriods: numberValue(summary.coverage_waiting_periods),
      coverageNoSubstitutePeriods: numberValue(summary.coverage_no_substitute_periods),
      coverageExpiredPeriods: numberValue(summary.coverage_expired_periods),
      coverageMissingPeriods: numberValue(summary.coverage_missing_periods),
      coverageRatePct: clampPct(summary.coverage_rate_pct),
      taskEligiblePeriods: numberValue(summary.task_eligible_periods),
      taskReadyPeriods: numberValue(summary.task_ready_periods),
      taskMissingPeriods: numberValue(summary.task_missing_periods),
      taskReadinessPct: clampPct(summary.task_readiness_pct),
    },
    teachers: Array.isArray(raw?.teachers)
      ? raw.teachers.map((row: any) => ({
          teacherId: String(row.teacher_id || ""),
          teacherName: String(row.teacher_name || ""),
          gender: String(row.gender || "UNKNOWN"),
          regularWeeklyJp: numberValue(row.regular_weekly_jp),
          leaveDays: numberValue(row.leave_days),
          absencePeriods: numberValue(row.absence_periods),
          teachingAbsencePeriods: numberValue(row.teaching_absence_periods),
          freeAbsencePeriods: numberValue(row.free_absence_periods),
          homeroomAbsencePeriods: numberValue(row.homeroom_absence_periods),
          substitutePeriods: numberValue(row.substitute_periods),
          taskEligiblePeriods: numberValue(row.task_eligible_periods),
          taskReadyPeriods: numberValue(row.task_ready_periods),
          taskReadinessPct: clampPct(row.task_readiness_pct),
        }))
      : [],
    daily: Array.isArray(raw?.daily)
      ? raw.daily.map((row: any) => ({
          date: String(row.date || ""),
          teachingAbsencePeriods: numberValue(row.teaching_absence_periods),
          freeAbsencePeriods: numberValue(row.free_absence_periods),
          assignedCoveragePeriods: numberValue(row.assigned_coverage_periods),
          taskReadyPeriods: numberValue(row.task_ready_periods),
        }))
      : [],
    reasons: Array.isArray(raw?.reasons)
      ? raw.reasons.map((row: any) => ({
          reason: String(row.reason || "Tanpa alasan"),
          requestCount: numberValue(row.request_count),
          approvedPeriodCount: numberValue(row.approved_period_count),
        }))
      : [],
    requestStatuses: Array.isArray(raw?.request_statuses)
      ? raw.request_statuses.map((row: any) => ({
          status: String(row.status || "UNKNOWN"),
          count: numberValue(row.count),
        }))
      : [],
  };
}

export function getCoverageHealthLabel(rate: number): "BAIK" | "PERLU PERHATIAN" | "KRITIS" {
  if (rate >= 95) return "BAIK";
  if (rate >= 80) return "PERLU PERHATIAN";
  return "KRITIS";
}

/**
 * Merge staff-only effective activity RPC into the existing management report.
 * Do not fake zero values if the V3.18 migration hasn't been applied yet.
 * Percentages describe the distribution of recorded instructional JP vs leave JP,
 * not time-clock verified attendance or schoolwide expected JP.
 */
export function mergeTeacherEffectiveActivity(
  base: ManagementAnalyticsPayload,
  raw: unknown,
): ManagementAnalyticsPayload {
  if (!Array.isArray(raw)) throw new Error('ANALYTICS_V318_INVALID_ACTIVITY_PAYLOAD');
  const lookup = new Map<string, {
    effectiveTeachingJp: number;
    totalLeaveJp: number;
    effectiveTeachingDays: number;
    totalLeaveDays: number;
  }>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || !('teacher_id' in entry)) {
      throw new Error('ANALYTICS_V318_INVALID_ACTIVITY_ROW');
    }
    const row = entry as Record<string, unknown>;
    const id = String(row.teacher_id || '');
    if (!id || lookup.has(id) || !['effective_teaching_jp','leave_jp','effective_teaching_days','leave_days']
      .every((field) => Number.isInteger(Number(row[field])) && Number(row[field]) >= 0 && row[field] !== null && row[field] !== undefined)) {
      throw new Error('ANALYTICS_V318_INVALID_ACTIVITY_ROW');
    }
    lookup.set(id, {
      effectiveTeachingJp: Number(row.effective_teaching_jp),
      totalLeaveJp: Number(row.leave_jp),
      effectiveTeachingDays: Number(row.effective_teaching_days),
      totalLeaveDays: Number(row.leave_days),
    });
  }
  return {
    ...base,
    teachers: base.teachers.map((teacher) => {
      const activity = lookup.get(teacher.teacherId);
      if (!activity) throw new Error(`ANALYTICS_V318_TEACHER_NOT_FOUND: ${teacher.teacherId}`);
      const denominator = activity.effectiveTeachingJp + activity.totalLeaveJp;
      return {
        ...teacher,
        ...activity,
        teachingSharePct: denominator ? 100 * activity.effectiveTeachingJp / denominator : null,
        leaveSharePct: denominator ? 100 * activity.totalLeaveJp / denominator : null,
      };
    }),
  };
}

export const teacherActivitySortKeys = [
  'name', 'effectiveTeachingJp', 'totalLeaveJp', 'effectiveTeachingDays',
  'totalLeaveDays', 'teachingSharePct', 'leaveSharePct',
] as const;
export type TeacherActivitySortKey = typeof teacherActivitySortKeys[number];
export type TeacherActivitySortDirection = 'asc' | 'desc';

export function sortTeacherActivityRows(
  rows: ManagementTeacherAnalyticsRow[],
  key: TeacherActivitySortKey,
  direction: TeacherActivitySortDirection,
): ManagementTeacherAnalyticsRow[] {
  return [...rows].sort((a, b) => {
    if (key !== 'name') {
      const left = a[key], right = b[key];
      if (left == null && right != null) return 1;
      if (right == null && left != null) return -1;
      if (left != null && right != null && left !== right) {
        return (Number(left) - Number(right)) * (direction === 'asc' ? 1 : -1);
      }
    } else {
      const byName = a.teacherName.localeCompare(b.teacherName, 'id-ID', { sensitivity: 'base' });
      if (byName) return direction === 'asc' ? byName : -byName;
    }
    return a.teacherName.localeCompare(b.teacherName, 'id-ID', { sensitivity: 'base' });
  });
}

export function buildTeacherAnalyticsCsv(rows: ManagementTeacherAnalyticsRow[]): string {
  const headers = [
    'Guru',
    'Total JP Mengajar Efektif',
    'Total JP Izin',
    'Total Hari Mengajar Efektif',
    'Total Hari Izin',
    'Persentase JP Mengajar',
    'Persentase JP Izin',
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const pct = (value: number | null | undefined) => value == null ? '—' : `${value.toFixed(1)}%`;
  const lines = rows.map((row) => [
    row.teacherName,
    row.effectiveTeachingJp ?? '—',
    row.totalLeaveJp ?? '—',
    row.effectiveTeachingDays ?? '—',
    row.totalLeaveDays ?? '—',
    pct(row.teachingSharePct),
    pct(row.leaveSharePct),
  ].map(escape).join(','));
  return [headers.map(escape).join(','), ...lines].join('\n');
}
