import type { SnapshotSection } from "./snapshotParity";

/**
 * Data dependencies of the three legacy Jam Kosong consumers.
 *
 * V3.9 intentionally preserves current production semantics first: the
 * individual list, all-teacher list, and availability table are derived from
 * teacher master + recurring schedule rows. Incidentals, calendar, leave/badal,
 * and substitute constraints become part of the canonical Inval availability
 * engine in the next stage rather than silently changing these existing views.
 */
export const AVAILABILITY_CUTOVER_SECTIONS = [
  "teachers",
  "schedules",
] as const satisfies readonly SnapshotSection[];

export type AvailabilityPreview = "INDIVIDU" | "TABEL" | "SEMUA";
