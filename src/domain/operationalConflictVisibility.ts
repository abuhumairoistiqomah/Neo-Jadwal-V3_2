import type { ScheduleConflict } from "./scheduleConflicts";

/** Date-based conflicts expire visually, without deleting audit/version history.
 *  Weekly master conflicts are recurring and remain visible.
 */
export function isConflictExpired(conflict: ScheduleConflict, todayISO: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(conflict.dayOrDate) && conflict.dayOrDate < todayISO;
}

export function visibleScheduleConflicts(
  conflicts: ScheduleConflict[],
  todayISO: string,
  includeExpired = false,
): ScheduleConflict[] {
  return includeExpired ? conflicts : conflicts.filter((conflict) => !isConflictExpired(conflict, todayISO));
}

export function localISODate(today = new Date()): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
