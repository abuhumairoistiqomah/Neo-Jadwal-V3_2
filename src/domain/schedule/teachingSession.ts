import type { ScheduleItem } from "../models";
import { parseScheduleClassMode } from "./classMode";

const TEACHER_FIELDS = ["guru1", "guru2", "guru3", "guru4", "guru5", "guru6"] as const;

function normalize(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function normalizedTeacherSet(item: ScheduleItem): string[] {
  return TEACHER_FIELDS
    .map((field) => normalize(item[field]))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b, "id-ID"));
}

function sameTeachers(a: ScheduleItem, b: ScheduleItem): boolean {
  const aa = normalizedTeacherSet(a);
  const bb = normalizedTeacherSet(b);
  if (aa.length === 0 || bb.length === 0 || aa.length !== bb.length) return false;
  return aa.every((value, index) => value === bb[index]);
}

function sameClock(a: ScheduleItem, b: ScheduleItem): boolean {
  const aStart = normalize(a.mulai);
  const bStart = normalize(b.mulai);
  const aEnd = normalize(a.selesai);
  const bEnd = normalize(b.selesai);

  // Legacy rows occasionally omit explicit clock values. In that case period
  // identity remains authoritative; when both clocks exist they must agree.
  if (aStart && bStart && aStart !== bStart) return false;
  if (aEnd && bEnd && aEnd !== bEnd) return false;
  return true;
}

/**
 * Legacy-compatible shared-session inference.
 *
 * The old E-Jadwal treated different classes as one combined lesson whenever
 * they had the same JP/time, subject and exact teacher set. `kelasgabung=Ya`
 * remains a useful hint/label, but is no longer the only source of truth.
 * ALTERNATING rows are deliberately excluded because they represent a
 * different operational relationship.
 */
export function isSameTeachingSession(a: ScheduleItem, b: ScheduleItem): boolean {
  if (normalize(a.kelas) === normalize(b.kelas)) return true;
  if (normalize(a.hari) && normalize(b.hari) && normalize(a.hari) !== normalize(b.hari)) return false;
  if (Number(a.jam_ke) !== Number(b.jam_ke)) return false;
  if (normalize(a.mapel) !== normalize(b.mapel)) return false;
  if (!sameClock(a, b)) return false;
  if (!sameTeachers(a, b)) return false;
  if (parseScheduleClassMode(a.kelasgabung) === "ALTERNATING") return false;
  if (parseScheduleClassMode(b.kelasgabung) === "ALTERNATING") return false;
  return true;
}

export function teachingSessionSignature(item: ScheduleItem): string {
  const mode = parseScheduleClassMode(item.kelasgabung);
  if (mode === "ALTERNATING") {
    return ["ALT", normalize(item.kelas), Number(item.jam_ke)].join("|");
  }
  return [
    normalize(item.hari),
    Number(item.jam_ke),
    normalize(item.mulai),
    normalize(item.selesai),
    normalize(item.mapel),
    normalizedTeacherSet(item).join("&"),
  ].join("|");
}

export function hasInferredCombinedPeer(item: ScheduleItem, schedules: ScheduleItem[]): boolean {
  return schedules.some((candidate) => (
    normalize(candidate.kelas) !== normalize(item.kelas)
    && isSameTeachingSession(item, candidate)
  ));
}
