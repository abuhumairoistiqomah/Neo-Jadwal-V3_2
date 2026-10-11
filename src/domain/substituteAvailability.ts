/**
 * Substitute-teacher availability constraints.
 *
 * A constraint is intentionally separate from the teaching schedule:
 * a teacher may be free from class but still be a poor substitute candidate
 * because of a recurring or one-off commitment.
 */

export type SubstituteConstraintKind = "WEEKLY" | "DATE";
export type SubstituteAvailabilityStatus = "AVAILABLE" | "SOFT_BLOCKED" | "HARD_BLOCKED";

export interface SubstituteConstraint {
  id: string;
  teacherId: string;
  kind: SubstituteConstraintKind;
  /** Monday=1 ... Sunday=7. Null on WEEKLY means every weekday/date. */
  dayOfWeek?: number | null;
  /** Required for DATE rules; null for WEEKLY rules. */
  specificDate?: string | null;
  periodStart: number;
  periodEnd: number;
  /** Optional validity window for recurring WEEKLY rules. */
  validFrom?: string | null;
  validUntil?: string | null;
  reason: string;
  /** true = warn but Wakasek/Admin may deliberately override. */
  overrideAllowed: boolean;
  /** When true, this rule also means the teacher is unavailable for their own normal class. */
  blocksNormalTeaching?: boolean;
  isActive: boolean;
}

export interface SubstituteAvailabilityResult {
  status: SubstituteAvailabilityStatus;
  matchingConstraints: SubstituteConstraint[];
  /** Convenience flag for UI/recommendation code. */
  requiresOverride: boolean;
}

function parseIsoDateParts(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Monday=1 ... Sunday=7. Returns null for invalid YYYY-MM-DD. */
export function getIsoDayOfWeek(date: string): number | null {
  const parts = parseIsoDateParts(date);
  if (!parts) return null;

  const jsDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function isDateInsideInclusiveWindow(
  date: string,
  start?: string | null,
  end?: string | null,
): boolean {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function constraintMatchesSlot(
  constraint: SubstituteConstraint,
  teacherId: string,
  date: string,
  period: number,
): boolean {
  if (!constraint.isActive) return false;
  if (constraint.teacherId !== teacherId) return false;
  if (!Number.isInteger(period)) return false;
  if (period < constraint.periodStart || period > constraint.periodEnd) return false;

  if (constraint.kind === "DATE") {
    return Boolean(constraint.specificDate && constraint.specificDate === date);
  }

  if (constraint.kind === "WEEKLY") {
    if (!isDateInsideInclusiveWindow(date, constraint.validFrom, constraint.validUntil)) {
      return false;
    }

    if (constraint.dayOfWeek == null) return true;
    const dayOfWeek = getIsoDayOfWeek(date);
    return dayOfWeek !== null && constraint.dayOfWeek === dayOfWeek;
  }

  return false;
}


export interface NormalTeachingBlockResult {
  blocked: boolean;
  matchingConstraints: SubstituteConstraint[];
}

export function resolveNormalTeachingBlock(input: {
  teacherId: string;
  date: string;
  period: number;
  constraints: SubstituteConstraint[];
}): NormalTeachingBlockResult {
  const matchingConstraints = input.constraints.filter((constraint) =>
    Boolean(constraint.blocksNormalTeaching)
    && constraintMatchesSlot(constraint, input.teacherId, input.date, input.period),
  );
  return { blocked: matchingConstraints.length > 0, matchingConstraints };
}

/**
 * Resolve special substitute constraints only.
 *
 * This does NOT check schedule conflicts, leave, calendar events, or teacher load.
 * Those remain separate signals in the future recommendation engine.
 */
export function resolveSubstituteAvailability(input: {
  teacherId: string;
  date: string;
  period: number;
  constraints: SubstituteConstraint[];
}): SubstituteAvailabilityResult {
  const matchingConstraints = input.constraints.filter((constraint) =>
    constraintMatchesSlot(constraint, input.teacherId, input.date, input.period),
  );

  if (matchingConstraints.length === 0) {
    return {
      status: "AVAILABLE",
      matchingConstraints: [],
      requiresOverride: false,
    };
  }

  const hasNonOverridableConstraint = matchingConstraints.some(
    (constraint) => !constraint.overrideAllowed,
  );

  return {
    status: hasNonOverridableConstraint ? "HARD_BLOCKED" : "SOFT_BLOCKED",
    matchingConstraints,
    requiresOverride: true,
  };
}
