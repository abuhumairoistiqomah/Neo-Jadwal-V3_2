import type { SnapshotSection } from "../schedule/snapshotParity";

/**
 * Direct data dependencies of the legacy Input Inval screen.
 * Substitute constraints are Supabase-only policy data, so they are loaded and
 * reported separately instead of being compared against a legacy Sheet section.
 */
export const INVAL_CUTOVER_SECTIONS = [
  "teachers",
  "schedules",
  "logs",
  "jadwalInsidental",
  "masterRuangan",
  "kalenderAkademik",
] as const satisfies readonly SnapshotSection[];
