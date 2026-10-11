export interface LegacyManagedTotals {
  schedules: number;
  incidentals: number;
  academicEvents: number;
  coverageSlots: number;
  roomUnavailability: number;
}

/**
 * Compare totals for rows wholly managed by the legacy migration pipeline.
 *
 * These checks are intentionally separate from keyed count verification:
 * keyed verification proves every current source row exists; managed-total
 * verification also catches stale legacy rows that should have been cleaned up.
 */
export function compareLegacyManagedTotals(
  expected: LegacyManagedTotals,
  actual: LegacyManagedTotals,
): string[] {
  const labels: Record<keyof LegacyManagedTotals, string> = {
    schedules: "legacy schedule_master total",
    incidentals: "legacy schedule_incidentals total",
    academicEvents: "legacy academic_events total",
    coverageSlots: "LEGACY_IMPORT coverage_slots total",
    roomUnavailability: "LEGACY_INCIDENTAL room_unavailability total",
  };

  const differences: string[] = [];
  (Object.keys(expected) as (keyof LegacyManagedTotals)[]).forEach((key) => {
    if (expected[key] !== actual[key]) {
      differences.push(`${labels[key]}: expected ${expected[key]}, actual ${actual[key]}`);
    }
  });
  return differences;
}
