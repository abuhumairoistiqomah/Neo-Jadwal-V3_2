import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "../models";
import { isClassMatch } from "../class";
import { buildEffectiveScheduleForDate, type EffectiveScheduleItem } from "./effectiveSchedule";

export type DashboardEffectiveItem = EffectiveScheduleItem & {
  isOverridden: boolean;
  keterangan_insidental: string;
  alasan_insidental: string;
  tipe_insidental: string;
};

/**
 * Dashboard Guru and Dashboard Wali Kelas consume the SAME dated schedule
 * projection as Jadwal Kelas and Jadwal Ruangan. Never merge the raw master
 * and raw incidental arrays again in a component: that revives old teachers.
 */
export function buildDashboardEffectiveDay(args: {
  date: string;
  schedules: ScheduleItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
}): DashboardEffectiveItem[] {
  return buildEffectiveScheduleForDate(args).map((item) => ({
    ...item,
    isOverridden: item.source !== "MASTER",
    keterangan_insidental: item.source !== "MASTER" ? item.keterangan_khusus || "" : "",
    alasan_insidental: item.incidentalReason || "",
    tipe_insidental: item.incidentalType || "",
  }));
}

export function getDashboardClassSlotItems(
  day: DashboardEffectiveItem[],
  className: string,
  period: number,
): DashboardEffectiveItem[] {
  const candidates = day.filter((item) =>
    Number(item.jam_ke) === Number(period) && isClassMatch(item.kelas, className),
  );
  // Backstop against inconsistent legacy snapshots: an incidental is the
  // authoritative occupant of this class + date + JP, irrespective of mapel.
  const incidentals = candidates.filter((item) => item.source !== "MASTER");
  return incidentals.length > 0 ? incidentals : candidates;
}

/**
 * A canceled master assignment is context, not another lesson. When a teacher
 * receives a dated active replacement in the same JP, suppress the old
 * cancelled class from the teacher-facing grouping only. Preserve the
 * cancelled card when no alternate teaching assignment exists.
 */
export function selectOperationalTeacherSchedules<
  T extends Pick<EffectiveScheduleItem, "jam_ke" | "isActive" | "isSuppressedByAcademicCalendar">
>(items: T[]): T[] {
  const activePeriods = new Set(items
    .filter((item) => item.isActive && !item.isSuppressedByAcademicCalendar)
    .map((item) => Number(item.jam_ke)));
  return items.filter((item) =>
    !item.isSuppressedByAcademicCalendar || !activePeriods.has(Number(item.jam_ke)));
}

/**
 * A peer on today's dashboard must be actually available for this lesson,
 * rather than simply being a name in the weekly master teacher1..teacher6.
 * Coverage logs have already removed the absent teacher and added their badal
 * in `effectiveTeachers`. This view deliberately does not modify master rows.
 */
export function dashboardAvailableTeamTeachingPeers(
  items: Pick<EffectiveScheduleItem, "effectiveTeachers">[],
  selectedTeacher: string,
): string[] {
  const selected = selectedTeacher.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    for (const value of item.effectiveTeachers || []) {
      const name = value.trim();
      const key = name.toLocaleLowerCase();
      if (!key || key === selected || seen.has(key)) continue;
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}
