import type { KalenderAkademikItem } from "../models";

/**
 * A specific, dated instructional reassignment can run during a general
 * school activity (e.g., exam preparation during Rumah Tahfidz). A room-only
 * edit or a holiday never overrides an academic closure.
 */
export function datedInstructionOverridesCalendar(args: {
  event: KalenderAkademikItem | null | undefined;
  isDated: boolean;
  replacesTeachers: boolean;
  teacherNames: Array<string | null | undefined>;
}): boolean {
  const { event, isDated, replacesTeachers, teacherNames } = args;
  if (!event || !isDated || !replacesTeachers || !teacherNames.some(name => Boolean(String(name || "").trim()))) return false;
  return !/libur|holiday|cuti bersama/i.test(`${event.tipe || ""} ${event.nama_kegiatan || ""}`);
}
