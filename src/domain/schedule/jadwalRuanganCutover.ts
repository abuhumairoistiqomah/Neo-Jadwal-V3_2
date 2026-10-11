import type { SnapshotSection } from "./snapshotParity";

/** Direct data dependencies of the Jadwal Ruangan consumer. */
export const JADWAL_RUANGAN_SECTIONS = [
  "schedules",
  "jadwalInsidental",
  "masterRuangan",
  "kalenderAkademik",
] as const satisfies readonly SnapshotSection[];
