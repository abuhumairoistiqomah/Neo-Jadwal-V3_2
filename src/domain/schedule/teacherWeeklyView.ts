import type { ScheduleItem, JadwalInsidentalItem, LogIzinItem, KalenderAkademikItem } from "../models";
import { buildEffectiveScheduleForDate } from "./effectiveSchedule";
import { buildRoomWeekDays } from "../roomWeek";
import { getSchoolTodayISO } from "../date";
import { isClassMatch } from "../class";

export type TeacherWeeklyMode = "MASTER" | "EFFECTIVE";
export type TeacherWeekStatus = "NORMAL" | "INSIDENTAL" | "BADAL" | "IZIN" | "TUGAS_RESMI" | "KALENDER";
export type TeacherWeekRow = ScheduleItem & { weekDate: string; weekStatus: TeacherWeekStatus; weekDetail?: string };

/** Reuses the same weekday/weekend rule as Jadwal Ruangan, anchored to Jakarta school date. */
export function teacherWeekDays(today = getSchoolTodayISO(), offset = 0) {
  const [year, month, day] = today.split("-").map(Number);
  return buildRoomWeekDays(new Date(year, month - 1, day, 12), offset);
}

const teacherFields = ["guru1", "guru2", "guru3", "guru4", "guru5", "guru6"] as const;
function sameName(a: unknown, b: string): boolean {
  return String(a || "").trim().toLocaleLowerCase("id-ID") === b.trim().toLocaleLowerCase("id-ID");
}
function withTeachers(row: ScheduleItem, names: string[]): ScheduleItem {
  const updated = { ...row };
  teacherFields.forEach((field, idx) => { updated[field] = names[idx] || ""; });
  return updated;
}

/** Build actual dated teacher workload (including changes and leave), never assuming A/B rotation. */
export function buildTeacherWeeklyView(input: {
  teacher: string;
  mode: TeacherWeeklyMode;
  weekDays: ReturnType<typeof teacherWeekDays>;
  schedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  calendar?: KalenderAkademikItem[];
}): TeacherWeekRow[] {
  const { teacher, mode, weekDays, schedules, incidentals = [], logs = [], calendar = [] } = input;
  if (!teacher.trim()) return [];
  if (mode === "MASTER") return schedules.filter((row) => teacherFields.some((field) => sameName(row[field], teacher)))
    .map((row) => ({ ...row, weekDate: "", weekStatus: "NORMAL" as const }));

  const out: TeacherWeekRow[] = [];
  for (const day of weekDays) {
    const effective = buildEffectiveScheduleForDate({
      date: day.dateStr, schedules, jadwalInsidental: incidentals, logs, kalenderAkademik: calendar,
    });
    const activePeriods = new Set(effective.filter((row) => row.isActive && row.effectiveTeachers.some((name) => sameName(name, teacher)))
      .map((row) => Number(row.jam_ke)));
    // A confirmed dated assignment displaces this teacher's old weekly role
    // at the SAME date + JP. This includes a companion/assistant teacher who
    // remains on another class's canonical master row after accepting a badal.
    // Do not delete that master row: its other teachers still teach normally.
    // Also keep multiple dated assignments visible, so real dated-vs-dated
    // conflicts remain diagnosable rather than being silently discarded.
    const datedPriorityPeriods = new Set(effective.filter((row) =>
      row.isActive
      && row.effectiveTeachers.some((name) => sameName(name, teacher))
      && (row.source !== "MASTER" || row.substituteTeachers.some((name) => sameName(name, teacher)))
    ).map((row) => Number(row.jam_ke)));
    for (const row of effective) {
      const activeForTeacher = row.effectiveTeachers.some((name) => sameName(name, teacher));
      const absentForTeacher = row.absentTeachers.some((name) => sameName(name, teacher));
      const suppressedForTeacher = !row.isActive && row.scheduledTeachers.some((name) => sameName(name, teacher));
      if (!activeForTeacher && !absentForTeacher && !suppressedForTeacher) continue;
      // A dated teaching/badal assignment is the teacher's operational work
      // for this JP. Old master/leave/calendar rows are not a second class.
      // A room-only change to another class must not displace a dated assignment.
      if (datedPriorityPeriods.has(Number(row.jam_ke))
        && !(row.isActive && activeForTeacher
          && (row.source !== "MASTER" || row.substituteTeachers.some((name) => sameName(name, teacher))))) continue;
      // Calendar cancellation is informational, not a second teaching assignment.
      if (suppressedForTeacher && activePeriods.has(Number(row.jam_ke))) continue;
      const officialDutyLog = logs.find((log) => log.source === "OFFICIAL_DUTY"
        && log.tanggal === day.dateStr && Number(log.jam_ke) === Number(row.jam_ke)
        && isClassMatch(log.kelas, row.kelas) && sameName(log.guru_izin, teacher));
      const status: TeacherWeekStatus = row.isSuppressedByAcademicCalendar && !row.isActive ? "KALENDER"
        : absentForTeacher ? (officialDutyLog ? "TUGAS_RESMI" : "IZIN")
        : row.substituteTeachers.some((name) => sameName(name, teacher)) ? "BADAL"
        : row.source !== "MASTER" ? "INSIDENTAL" : "NORMAL";
      const detail = status === "KALENDER" ? row.academicEvent?.nama_kegiatan || "KBM dibatalkan"
        : status === "IZIN" ? `Digantikan: ${row.substituteTeachers.join(", ") || "belum ada badal"}`
        : status === "TUGAS_RESMI" ? `${officialDutyLog?.alasan || "Tugas resmi sekolah"} • Badal: ${row.substituteTeachers.join(", ") || "belum ada"}`
        : status === "BADAL" ? `Mengganti: ${row.absentTeachers.join(", ")}`
        : row.incidentalReason || "";
      const displayTeachers = (["IZIN", "TUGAS_RESMI", "KALENDER"].includes(status)) ? [teacher] : row.effectiveTeachers;
      out.push({ ...withTeachers(row, displayTeachers), weekDate: day.dateStr, weekStatus: status, weekDetail: detail });
    }
  }
  return out;
}
