import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "../models";
import { buildEffectiveScheduleForDate } from "./effectiveSchedule";

/**
 * Dated availability must match the operational timetable, not raw master.
 * Cancelled by academic calendar => inactive; overridden teachers are gone;
 * izin removes absent teachers and includes their substitutes.
 */
export function buildDatedEditorAvailability(input: {
  date: string;
  schedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
}): ScheduleItem[] {
  if (!input.date) return [];
  return buildEffectiveScheduleForDate({
    date: input.date,
    schedules: input.schedules,
    jadwalInsidental: input.incidentals || [],
    logs: input.logs || [],
    kalenderAkademik: input.kalenderAkademik || [],
  }).filter((row) => row.isActive).map((row) => {
    const teachers = row.effectiveTeachers;
    return {
      ...row,
      guru1: teachers[0] || "", guru2: teachers[1] || "",
      guru3: teachers[2] || "", guru4: teachers[3] || "",
      guru5: teachers[4] || "", guru6: teachers[5] || "",
    };
  });
}
