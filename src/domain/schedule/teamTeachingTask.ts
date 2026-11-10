import type { LogIzinItem } from "../models";

/** A resolved class row, not the absence owner's original weekday guess. */
export interface EffectiveTeamClassSlot {
  kelas: string;
  jam_ke: number | string;
  guru1?: string | null;
  guru2?: string | null;
  guru3?: string | null;
  guru4?: string | null;
  guru5?: string | null;
  guru6?: string | null;
  mapel?: string | null;
  /** The dated projection removes absent staff from its operational team. */
  effectiveTeachers?: string[];
  /** The effective timetable can replace the whole teacher team on a date. */
  teacherTeamReplaced?: boolean;
  isActive?: boolean;
  isSuppressedByAcademicCalendar?: boolean;
}

const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
const roster = (row: EffectiveTeamClassSlot) =>
  [row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6].map(normalize).filter(Boolean);

/** Legacy imports can contain NO_SUBSTITUTE for merely unfilled badal rows.
 * Only the RC4.2 verified decisions are allowed to declare "ditangani tim". */
export function isAcknowledgedTeamTeachingCoverage(row: LogIzinItem): boolean {
  return row.coverage_status === "NO_SUBSTITUTE" &&
    !row.guru_pengganti?.trim() &&
    ["ADMIN_MANUAL", "LEAVE_WORKFLOW", "OFFICIAL_DUTY"].includes(row.source || "");
}

/** Only genuinely assigned or completed coverage may be shared as badal work. A WAITING
 * row (or an unverified legacy NO_SUBSTITUTE) must never be presented as a
 * completed assignment. */
export function isAssignedTeamCoverage(row: LogIzinItem): boolean {
  return (row.coverage_status === "ASSIGNED" || row.coverage_status === "COMPLETED") &&
    Boolean(normalize(row.guru_pengganti)) &&
    normalize(row.guru_pengganti) !== normalize(row.guru_izin);
}

/**
 * Read the SAME dated learning_tasks that the substitute sees in Dashboard.
 * For a class/date/JP with ASSIGNED coverage, the other effective team members
 * see the instructional task as well. Existing verified NO_SUBSTITUTE handling
 * is preserved. This is a read-only projection: it creates no extra badal,
 * learning_task, duty or database record.
 *
 * The caller suppresses unavailable/conflicting teacher cards. This helper
 * additionally rejects absent colleagues, displaced rosters, cancelled class
 * slots, pending/cancelled coverage, and a substitute already shown their own
 * badal card. Class matching is deliberately exact after case/space cleanup.
 */
export function findTeamTeachingTasksForTeacher(input: {
  date: string;
  period: number;
  teacherName: string;
  effectiveClasses: EffectiveTeamClassSlot[];
  coverageLogs: LogIzinItem[];
}): LogIzinItem[] {
  const name = normalize(input.teacherName);
  if (!name || !input.date) return [];
  const classSlots = input.effectiveClasses.filter(row =>
    Number(row.jam_ke) === input.period &&
    row.isActive !== false && !row.isSuppressedByAcademicCalendar &&
    roster(row).includes(name)
  );
  if (!classSlots.length) return [];

  const matched = input.coverageLogs.filter(row =>
    row.tanggal === input.date && Number(row.jam_ke) === input.period &&
    (isAcknowledgedTeamTeachingCoverage(row) || isAssignedTeamCoverage(row)) &&
    normalize(row.guru_izin) !== name &&
    // The actual replacement already receives the task on their BADAL card.
    normalize(row.guru_pengganti) !== name &&
    classSlots.some(slot => normalize(slot.kelas) === normalize(row.kelas) &&
      // A dated replacement of the full team invalidates old leave coverage.
      (!slot.teacherTeamReplaced || roster(slot).includes(normalize(row.guru_izin)))) &&
    // A teacher absent for this same class/date/JP cannot act as co-teacher.
    !input.coverageLogs.some(other =>
      other.tanggal === row.tanggal && Number(other.jam_ke) === input.period &&
      normalize(other.kelas) === normalize(row.kelas) && normalize(other.guru_izin) === name &&
      other.coverage_status !== "CANCELLED" && other.coverage_status !== "EXPIRED"
    )
  );
  return [...new Map(matched.map(row => [row.id, row])).values()];
}

/**
 * HF6: derive Teacher Dashboard notices from the full effective day, even
 * when a visual timetable card is hidden by grouping or Native/Syaikh filters.
 * An optional availability guard supplied by Dashboard enforces official-duty
 * restrictions and priority conflicts. Never create duplicate task rows.
 */
export function collectTeacherDashboardTeamTaskNotices<T extends EffectiveTeamClassSlot>(input: {
  date: string;
  teacherName: string;
  effectiveClasses: T[];
  coverageLogs: LogIzinItem[];
  canShowSlot?: (slot: T) => boolean;
}): Array<{coverage: LogIzinItem; subject: string}> {
  const teacher = normalize(input.teacherName);
  if (!teacher || !input.date) return [];
  const seen = new Set<string>();
  const result: Array<{coverage: LogIzinItem; subject: string}> = [];

  for (const slot of input.effectiveClasses) {
    if (slot.isActive === false || slot.isSuppressedByAcademicCalendar ||
        !roster(slot).includes(teacher) ||
        (slot.effectiveTeachers && !slot.effectiveTeachers.some(n => normalize(n) === teacher)) ||
        (input.canShowSlot && !input.canShowSlot(slot))) continue;

    for (const coverage of findTeamTeachingTasksForTeacher({
      date: input.date, period: Number(slot.jam_ke), teacherName: input.teacherName,
      effectiveClasses: [slot], coverageLogs: input.coverageLogs,
    })) {
      if (seen.has(coverage.id)) continue;
      seen.add(coverage.id);
      result.push({coverage, subject: coverage.mapel || slot.mapel || ""});
    }
  }
  return result.sort((a, b) => Number(a.coverage.jam_ke) - Number(b.coverage.jam_ke) ||
    a.coverage.kelas.localeCompare(b.coverage.kelas, "id-ID", {numeric: true}));
}

/** HF6.2: preserve the existing JP lesson cell for a legitimate team task,
 * even if a legacy teacher-list filter hid that class. No synthetic badal
 * session is introduced and each class row appears at most once. */
export function includeTeamTaskClassRows<T extends EffectiveTeamClassSlot & {id: string}>(input: {
  operationalRows: T[];
  effectiveRows: T[];
  notices: Array<{coverage: LogIzinItem}>;
}): T[] {
  const result = [...input.operationalRows];
  const contains = (candidate: T) => result.some(row =>
    row.id === candidate.id && Number(row.jam_ke) === Number(candidate.jam_ke) &&
    normalize(row.kelas) === normalize(candidate.kelas));
  for (const {coverage} of input.notices) {
    for (const row of input.effectiveRows) {
      if (row.isActive === false || row.isSuppressedByAcademicCalendar ||
          Number(row.jam_ke) !== Number(coverage.jam_ke) ||
          normalize(row.kelas) !== normalize(coverage.kelas) || contains(row)) continue;
      result.push(row);
    }
  }
  return result;
}

/** Match one task to one class and JP, never just any card in that period. */
export function inlineTeamTasksForClassCard(input: {
  notices: Array<{coverage: LogIzinItem; subject: string}>;
  period: number;
  classes: Array<{kelas: string}>;
}): Array<{coverage: LogIzinItem; subject: string}> {
  return input.notices.filter(({coverage}) =>
    Number(coverage.jam_ke) === Number(input.period) &&
    input.classes.some(row => normalize(row.kelas) === normalize(coverage.kelas)));
}

/** HF7.2: collapse repeated notices inside ONE existing JP lesson card.
 * Group by exact class identity and keep each leave/coverage ID available in
 * the expanded view. This changes presentation only, never task visibility.
 */
export function groupInlineTeamTasksByClass(
  notices: Array<{coverage: LogIzinItem; subject: string}>,
): Array<{kelas: string; tasks: Array<{coverage: LogIzinItem; subject: string}>}> {
  const groups = new Map<string, {kelas: string; tasks: Array<{coverage: LogIzinItem; subject: string}>}>();
  const seenCoverage = new Set<string>();
  for (const notice of notices) {
    if (!notice.coverage?.id || seenCoverage.has(notice.coverage.id)) continue;
    const classKey = normalize(notice.coverage.kelas);
    if (!classKey) continue;
    seenCoverage.add(notice.coverage.id);
    if (!groups.has(classKey)) groups.set(classKey, {kelas: notice.coverage.kelas, tasks: []});
    groups.get(classKey)!.tasks.push(notice);
  }
  return [...groups.values()].sort((a, b) => a.kelas.localeCompare(b.kelas, "id-ID", {numeric: true}));
}
