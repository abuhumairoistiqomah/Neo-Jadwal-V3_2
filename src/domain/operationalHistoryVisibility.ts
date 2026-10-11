/** Presentation-only expiry for administrative histories. Never deletes records. */
export function isStrictPastIsoDate(date: string | null | undefined, today: string): boolean {
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today);
}

export function isPastAcademicEvent(group: { dateEnd: string; dateStart?: string }, today: string): boolean {
  return isStrictPastIsoDate(group.dateEnd || group.dateStart, today);
}

export function isPastSubstituteRule(rule: {
  constraint_type: "DATE" | "WEEKLY";
  specific_date: string | null;
  valid_until: string | null;
}, today: string): boolean {
  // Weekly rules without an end date recur; they must never expire automatically.
  const end = rule.constraint_type === "DATE" ? rule.specific_date : rule.valid_until;
  return isStrictPastIsoDate(end, today);
}

export function filterOperationalHistory<T>(rows: T[], isPast: (row: T) => boolean, showPast: boolean): T[] {
  return showPast ? [...rows] : rows.filter((row) => !isPast(row));
}
