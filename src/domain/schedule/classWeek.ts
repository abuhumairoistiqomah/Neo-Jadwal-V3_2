import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "../models";
import { getSchoolWeekDateStrings, isSameDay } from "../date";
import { isClassMatch } from "../class";
import { buildEffectiveScheduleForDate, type EffectiveScheduleItem } from "./effectiveSchedule";

export interface ClassWeekCell {
  date: string;
  dayName: string;
  period: number;
  items: EffectiveScheduleItem[];
  baseItems: ScheduleItem[];
  isAcademicEvent: boolean;
  hasSubstitute: boolean;
  hasMissingSubstitute: boolean;
  isIncidental: boolean;
}

export type ClassWeekMap = Record<string, Record<number, ClassWeekCell>>;

export function buildClassWeekMap(args: {
  referenceDate: string;
  className: string;
  schedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
}): ClassWeekMap {
  const map: ClassWeekMap = {};
  for (const { dateStr, dayName } of getSchoolWeekDateStrings(args.referenceDate)) {
    map[dayName] = {};
    const effective = buildEffectiveScheduleForDate({
      date: dateStr,
      schedules: args.schedules,
      jadwalInsidental: args.incidentals || [],
      logs: args.logs || [],
      kalenderAkademik: args.kalenderAkademik || [],
    }).filter((item) => isClassMatch(item.kelas, args.className));

    const periods = [...new Set(effective.map((item) => Number(item.jam_ke)))];
    for (const period of periods) {
      const items = effective.filter((item) => Number(item.jam_ke) === period);
      const substitutions = items.flatMap((item) => item.substitutions || []);
      const hasSubstitute = substitutions.some((sub) => Boolean(String(sub.substituteTeacher || "").trim()));
      const hasMissingSubstitute = substitutions.some((sub) => !String(sub.substituteTeacher || "").trim());
      const baseItems = args.schedules.filter((item) => (
        Number(item.jam_ke) === period
        && isSameDay(item.hari, dayName)
        && isClassMatch(item.kelas, args.className)
      ));
      map[dayName][period] = {
        date: dateStr,
        dayName,
        period,
        items,
        baseItems,
        isAcademicEvent: items.some((item) => item.isSuppressedByAcademicCalendar),
        hasSubstitute,
        hasMissingSubstitute,
        isIncidental: items.some((item) => item.source !== "MASTER"),
      };
    }
  }
  return map;
}
