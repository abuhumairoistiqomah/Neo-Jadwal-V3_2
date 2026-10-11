import type { LogIzinItem, ScheduleItem } from "../models";
import { getSchoolWeekDateStrings, isSameDay, normalizeDateString } from "../date";
import { isClassMatch } from "../class";
import { parseScheduleClassMode } from "./classMode";
import { hasInferredCombinedPeer, teachingSessionSignature } from "./teachingSession";

export type JadwalKelasCellSemantic = "NORMAL" | "COMBINED" | "ALTERNATING" | "CONFLICT" | "SUBSTITUTE";

function teacherKey(name: unknown): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function scheduleTeachers(item: ScheduleItem): string[] {
  return [item.guru1, item.guru2, item.guru3, item.guru4, item.guru5, item.guru6]
    .map(teacherKey)
    .filter(Boolean);
}

function localDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getReferenceWeekDateForDay(referenceDate: string | undefined, day: string): string {
  const safeReference = referenceDate || localDateString(new Date());
  return getSchoolWeekDateStrings(safeReference).find((entry) => isSameDay(entry.dayName, day))?.dateStr || "";
}

export function findSubstituteLogsForCell(args: {
  logs: LogIzinItem[];
  selectedClass: string;
  day: string;
  period: number;
  referenceDate?: string;
}): LogIzinItem[] {
  const targetDate = getReferenceWeekDateForDay(args.referenceDate, args.day);
  if (!targetDate) return [];
  return args.logs.filter((log) => (
    normalizeDateString(log.tanggal) === targetDate
    && Number(log.jam_ke) === Number(args.period)
    && isClassMatch(log.kelas, args.selectedClass)
    && Boolean(String(log.guru_pengganti || "").trim())
  ));
}

export function hasTeacherConflictForCell(args: {
  items: ScheduleItem[];
  schedules: ScheduleItem[];
  day: string;
  period: number;
}): boolean {
  // A rotation row represents different weeks sharing one master slot. The
  // master does not encode which week is active, so a static weekly view must
  // not label it as a real collision. Concrete dated incidentals are checked
  // elsewhere by the effective-schedule conflict engine.
  if (args.items.some((item) => parseScheduleClassMode(item.kelasgabung) === "ALTERNATING")) return false;

  const currentTeachers = new Set(args.items.flatMap(scheduleTeachers));
  if (currentTeachers.size === 0) return false;

  for (const teacher of currentTeachers) {
    const overlapping = args.schedules.filter((row) => (
      isSameDay(row.hari, args.day)
      && Number(row.jam_ke) === Number(args.period)
      && parseScheduleClassMode(row.kelasgabung) !== "ALTERNATING"
      && scheduleTeachers(row).includes(teacher)
    ));

    const distinctClasses = new Set(
      overlapping.map((row) => String(row.kelas || "").trim().toLocaleLowerCase("id-ID")).filter(Boolean),
    );
    if (distinctClasses.size <= 1) continue;

    const modes = overlapping.map((row) => parseScheduleClassMode(row.kelasgabung));
    const intentionalAlternating = modes.every((mode) => mode === "ALTERNATING");
    if (intentionalAlternating) continue;

    // Legacy-compatible rule: same teacher + JP/time + subject is one shared
    // teaching session even when only one (or neither) class row is explicitly
    // marked as combined.
    const sessionKeys = new Set(overlapping.map(teachingSessionSignature));
    if (sessionKeys.size === 1) continue;

    return true;
  }

  return false;
}

export function classifyJadwalKelasCell(args: {
  items: ScheduleItem[];
  schedules: ScheduleItem[];
  logs?: LogIzinItem[];
  selectedClass: string;
  day: string;
  period: number;
  referenceDate?: string;
}): JadwalKelasCellSemantic {
  // Operational priority: assigned substitute is most immediately relevant to the class.
  if (findSubstituteLogsForCell({
    logs: args.logs || [],
    selectedClass: args.selectedClass,
    day: args.day,
    period: args.period,
    referenceDate: args.referenceDate,
  }).length > 0) {
    return "SUBSTITUTE";
  }

  const modes = args.items.map((item) => parseScheduleClassMode(item.kelasgabung));
  if (modes.some((mode) => mode === "ALTERNATING")) return "ALTERNATING";

  if (hasTeacherConflictForCell({
    items: args.items,
    schedules: args.schedules,
    day: args.day,
    period: args.period,
  })) {
    return "CONFLICT";
  }
  if (
    modes.some((mode) => mode === "COMBINED")
    || args.items.some((item) => hasInferredCombinedPeer(item, args.schedules))
  ) return "COMBINED";
  return "NORMAL";
}

export const JADWAL_KELAS_CELL_VISUALS: Record<JadwalKelasCellSemantic, {
  desktop: string;
  mobile: string;
  teacherText: string;
  periodBadge: string;
  label: string;
  legend: string;
}> = {
  NORMAL: {
    desktop: "bg-blue-50/60 text-blue-900 border-l-2 border-l-blue-400 hover:bg-blue-100/80",
    mobile: "border-blue-100 bg-blue-50/50 text-blue-900 hover:bg-blue-100/80 hover:ring-blue-400/30",
    teacherText: "text-blue-800",
    periodBadge: "border-blue-100 text-blue-700",
    label: "",
    legend: "Normal",
  },
  COMBINED: {
    desktop: "bg-emerald-50/80 text-emerald-950 border-l-2 border-l-emerald-500 hover:bg-emerald-100/80",
    mobile: "border-emerald-200 bg-emerald-50/80 text-emerald-950 hover:bg-emerald-100/80 hover:ring-emerald-400/30",
    teacherText: "text-emerald-800",
    periodBadge: "border-emerald-200 text-emerald-800",
    label: "Gabung",
    legend: "Kelas Gabung",
  },
  ALTERNATING: {
    desktop: "bg-violet-50/90 text-violet-950 border-l-2 border-l-violet-500 hover:bg-violet-100/80",
    mobile: "border-violet-200 bg-violet-50/90 text-violet-950 hover:bg-violet-100/80 hover:ring-violet-400/30",
    teacherText: "text-violet-800",
    periodBadge: "border-violet-200 text-violet-800",
    label: "Bergantian",
    legend: "Kelas Bergantian",
  },
  CONFLICT: {
    desktop: "bg-red-50/90 text-red-950 border-l-2 border-l-red-500 hover:bg-red-100/80",
    mobile: "border-red-200 bg-red-50/90 text-red-950 hover:bg-red-100/80 hover:ring-red-400/30",
    teacherText: "text-red-800",
    periodBadge: "border-red-200 text-red-800",
    label: "Bentrok",
    legend: "Bentrok",
  },
  SUBSTITUTE: {
    desktop: "bg-yellow-50/90 text-yellow-950 border-l-2 border-l-yellow-500 hover:bg-yellow-100/80",
    mobile: "border-yellow-300 bg-yellow-50/90 text-yellow-950 hover:bg-yellow-100/80 hover:ring-yellow-400/30",
    teacherText: "text-yellow-900",
    periodBadge: "border-yellow-300 text-yellow-900",
    label: "Badal",
    legend: "Guru Badal (minggu berjalan)",
  },
};
