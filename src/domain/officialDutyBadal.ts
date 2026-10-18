import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "./models";
import { splitHomeroomClasses } from "./leaveRequest";
import { getAcademicCalendarEvent } from "./calendar";
import { buildEffectiveScheduleForDate } from "./schedule/effectiveSchedule";

export interface OfficialDutyRule {
  teacher_id: string;
  constraint_type: "DATE" | "WEEKLY";
  specific_date: string | null;
  day_of_week: number | null;
  period_start: number;
  period_end: number;
  valid_from: string | null;
  valid_until: string | null;
  blocks_normal_teaching: boolean;
  requires_badal?: boolean;
  is_active: boolean;
  reason: string;
}
export interface OfficialDutyNeed {
  date: string;
  period: number;
  className: string;
  subject: string;
}
export interface OfficialDutyAssignment {
  id: string;
  schedule_date: string;
  period: number;
  class_id: string;
  class_name_snapshot: string;
  substitute_teacher_id: string | null;
  substitute_teacher_name_snapshot: string | null;
  status: string;
}

/** Prevent a recurring restriction being mistaken for a perpetual booking. */
export function isOfficialDutyRuleDate(rule: OfficialDutyRule, date: string): boolean {
  if (!rule.is_active || !rule.blocks_normal_teaching || !rule.requires_badal || !date) return false;
  if (rule.constraint_type === "DATE") return rule.specific_date === date;
  if (rule.valid_from && date < rule.valid_from) return false;
  if (rule.valid_until && date > rule.valid_until) return false;
  const [year, month, day] = date.split("-").map(Number);
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isoDay = js === 0 ? 7 : js;
  return rule.day_of_week == null || rule.day_of_week === isoDay;
}

/** Returns instructional obligations, excluding cancelled KBM and JP Free. */
export function findOfficialDutyNeeds(input: {
  date: string;
  teacherName: string;
  rule: OfficialDutyRule;
  schedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  calendar?: KalenderAkademikItem[];
  homeroomClasses?: string;
}): OfficialDutyNeed[] {
  const { date, teacherName, rule, schedules, incidentals = [], logs = [], calendar = [], homeroomClasses = "" } = input;
  if (!isOfficialDutyRuleDate(rule, date) || !teacherName.trim()) return [];
  const name = teacherName.trim().toLocaleLowerCase("id-ID");
  const seen = new Set<string>();
  const instructional = buildEffectiveScheduleForDate({date,schedules,jadwalInsidental:incidentals,logs,kalenderAkademik:calendar})
    .filter((row) => row.isActive && row.jam_ke >= rule.period_start && row.jam_ke <= rule.period_end)
    // Check original dated instructional responsibility even when a substitute already covers it.
    .filter((row) => row.scheduledTeachers.some((n) => n.trim().toLocaleLowerCase("id-ID") === name))
    .filter((row) => {
      const key = `${row.jam_ke}|${row.kelas.trim().toLocaleLowerCase("id-ID")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((row) => ({ date, period: Number(row.jam_ke), className: row.kelas, subject: row.mapel }));
  if (rule.period_start > 0 || rule.period_end < 0) return instructional;
  const homeroom = splitHomeroomClasses(homeroomClasses)
    .filter((className) => !getAcademicCalendarEvent(date, className, 0, calendar))
    .filter((className) => !seen.has(`0|${className.trim().toLocaleLowerCase("id-ID")}`))
    .map((className) => ({ date, period: 0, className, subject: "Homeroom Session" }));
  return [...homeroom, ...instructional];
}

export function summarizeOfficialDutyCoverage(needs: OfficialDutyNeed[], assignments: OfficialDutyAssignment[],
  classIdByName: ReadonlyMap<string,string>): { total: number; assigned: number; pending: number } {
  const filled = new Set(assignments.filter((a) => a.substitute_teacher_id && ["ASSIGNED", "COMPLETED"].includes(a.status))
    .map((a) => `${a.schedule_date}|${a.period}|${a.class_id}`));
  const assigned = needs.filter((need) => filled.has(`${need.date}|${need.period}|${classIdByName.get(need.className.toLocaleLowerCase("id-ID")) || ""}`)).length;
  return { total: needs.length, assigned, pending: needs.length - assigned };
}
