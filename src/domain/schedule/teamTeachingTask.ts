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
  /** The effective timetable can replace the whole teacher team on a date. */
  teacherTeamReplaced?: boolean;
}

const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

/** Legacy imports can contain NO_SUBSTITUTE for merely unfilled badal rows.
 * Only the RC4.2 verified decisions are allowed to declare "ditangani tim". */
export function isAcknowledgedTeamTeachingCoverage(row: LogIzinItem): boolean {
  return row.coverage_status === "NO_SUBSTITUTE" &&
    !row.guru_pengganti?.trim() &&
    ["ADMIN_MANUAL", "LEAVE_WORKFLOW", "OFFICIAL_DUTY"].includes(row.source || "");
}

/**
 * Reuse the SAME learning_tasks delivered to substitute teachers, but show them
 * on the normal schedule of other teachers of a confirmed NO_SUBSTITUTE class.
 * A leave teacher, a teacher from another class, or a teacher not in the
 * effective roster must never receive another teacher's instructions.
 *
 * Additional duty/leave/unavailability checks belong to the effective-day
 * resolver. The caller must suppress cards for cancelled/unavailable sessions.
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
  const eligibleClasses = new Set(input.effectiveClasses.filter(row =>
    Number(row.jam_ke) === input.period &&
    [row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6].some(n => normalize(n) === name)
  ).map(row => normalize(row.kelas)));
  const matched = input.coverageLogs.filter(row =>
    row.tanggal === input.date && Number(row.jam_ke) === input.period &&
    isAcknowledgedTeamTeachingCoverage(row) &&
    normalize(row.guru_izin) !== name &&
    eligibleClasses.has(normalize(row.kelas)) &&
    // A teacher absent on the same date/class/JP cannot act as co-teacher.
    !input.coverageLogs.some(other =>
      other.tanggal === row.tanggal && Number(other.jam_ke) === input.period &&
      normalize(other.kelas) === normalize(row.kelas) && normalize(other.guru_izin) === name
    )
  );
  return [...new Map(matched.map(row => [row.id, row])).values()];
}
