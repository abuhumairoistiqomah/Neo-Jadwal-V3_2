/** A dated incidental remains in history after its school day has passed. */
export function isPastIncidentalDate(value: string, todayISO: string): boolean {
  // Invalid/legacy date formats are kept visible rather than silently hidden.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO)) {
    return false;
  }
  return value < todayISO;
}

export function filterIncidentalHistory<T extends { tanggal: string }>(
  rows: readonly T[], todayISO: string, showPast: boolean
): T[] {
  return showPast ? [...rows] : rows.filter((row) => !isPastIncidentalDate(row.tanggal, todayISO));
}
