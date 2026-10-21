import type { LogIzinItem } from "../models";
import { isAcknowledgedTeamTeachingCoverage } from "./teamTeachingTask";

/** Use authoritative, active coverage for the exact original teacher, date, class and JP.
 * Never infer a substitute from someone's roster or a different class in the same JP.
 */
export function findAbsentTeacherCoverage(input: {
  date: string;
  period: number;
  teacherName: string;
  classes: Array<{ kelas: string; jam_ke: number | string }>;
  logs: LogIzinItem[];
}): LogIzinItem[] {
  const norm = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
  const owner = norm(input.teacherName);
  if (!owner || !input.date) return [];
  const classes = new Set(input.classes
    .filter(item => Number(item.jam_ke) === input.period)
    .map(item => norm(item.kelas)));
  const matching = input.logs.filter(log =>
    log.tanggal === input.date &&
    Number(log.jam_ke) === input.period &&
    norm(log.guru_izin) === owner &&
    classes.has(norm(log.kelas)) &&
    log.coverage_status !== "CANCELLED"
  );
  return [...new Map(matching.map(log => [log.id, log])).values()];
}

export function absentCoverageLabel(log: LogIzinItem): string {
  const name = log.guru_pengganti?.trim();
  if (log.coverage_status === "ASSIGNED" && name) return `Digantikan oleh: ${name}`;
  // Legacy records may lack coverage_status but have an actual replacement name.
  if (!log.coverage_status && name) return `Digantikan oleh: ${name}`;
  if (isAcknowledgedTeamTeachingCoverage(log)) return "Ditangani team teaching (tanpa badal tambahan)";
  return "Badal belum ditentukan";
}
