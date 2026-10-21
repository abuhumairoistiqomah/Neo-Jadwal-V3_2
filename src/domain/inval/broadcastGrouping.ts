import type { LogIzinItem } from "../models";

const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

export interface SubstituteBroadcastSession {
  tanggal: string;
  guru_izin: string;
  alasan: string;
  jam_ke: number;
  kelasList: string[];
  mapel: string;
  guru_pengganti: string;
  coverage_status?: string;
  sourceRows: LogIzinItem[];
}

/**
 * Collapse canonical coverage rows that represent one real substitute session.
 *
 * The persistence layer intentionally stores one row per class. For an inferred
 * combined class, that means one physical teaching session can appear as two or
 * more LogIzinItem rows. Broadcast output must recombine those rows so Wakakur
 * does not announce the same JP twice.
 *
 * We only merge when absent teacher + date + JP + subject + substitute are the
 * same. This mirrors the operational combined-session identity closely enough
 * for Log_Izin data, which does not retain the full master teacher-set.
 */
export const groupSubstituteLogsForBroadcast = (
  rows: LogIzinItem[],
): SubstituteBroadcastSession[] => {
  const groups = new Map<string, SubstituteBroadcastSession & { firstIndex: number }>();

  rows.forEach((row, index) => {
    const key = [
      norm(row.tanggal),
      norm(row.guru_izin),
      Number(row.jam_ke),
      norm(row.mapel),
      norm(row.guru_pengganti),
      norm(row.coverage_status),
    ].join("|");

    const existing = groups.get(key);
    if (existing) {
      const className = String(row.kelas || "").trim();
      if (className && !existing.kelasList.some((value) => norm(value) === norm(className))) {
        existing.kelasList.push(className);
      }
      existing.sourceRows.push(row);
      return;
    }

    groups.set(key, {
      tanggal: row.tanggal,
      guru_izin: row.guru_izin,
      alasan: row.alasan,
      jam_ke: Number(row.jam_ke),
      kelasList: String(row.kelas || "").trim() ? [String(row.kelas).trim()] : [],
      mapel: row.mapel,
      guru_pengganti: row.guru_pengganti,
      coverage_status: row.coverage_status,
      sourceRows: [row],
      firstIndex: index,
    });
  });

  return [...groups.values()]
    .sort((a, b) => (a.jam_ke - b.jam_ke) || (a.firstIndex - b.firstIndex))
    .map(({ firstIndex: _firstIndex, ...session }) => session);
};
