import type { JadwalInsidentalItem, ScheduleItem } from "./models";
import {
  normalizeImportClassKey,
  normalizeImportKey,
  type ImportIssue,
  type ScheduleImportClassMaster,
  type ScheduleImportTeacherMaster,
} from "./scheduleImport";

export type SyaikhRotationStatus = "NATIVE" | "NORMAL";

export interface ParsedRotationCell {
  sourceCell: string;
  classGroupLabel: string;
  classNames: string[];
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  status: SyaikhRotationStatus;
}

export interface SyaikhRotationParseResult {
  cells: ParsedRotationCell[];
  issues: ImportIssue[];
  headerRow: number | null;
  classColumn: number | null;
}

export interface SyaikhRotationPublishRow {
  sourceCell: string;
  groupKey: string;
  scheduleDate: string;
  classId: string;
  className: string;
  period: number;
  subject: string;
  isCombined: boolean;
  teacherIds: string[];
  teacherNames: string[];
  specialNote: string | null;
  reason: string;
  rotationStatus: SyaikhRotationStatus;
  weekLabel: string;
}

export interface SyaikhRotationResolution {
  rows: SyaikhRotationPublishRow[];
  issues: ImportIssue[];
  summary: {
    parsedCells: number;
    publishRows: number;
    nativeRows: number;
    normalRows: number;
    combinedGroups: number;
    warningCount: number;
    errorCount: number;
  };
}

const MONTHS: Record<string, number> = {
  JAN: 1,
  JANUARI: 1,
  FEB: 2,
  FEBRUARI: 2,
  MAR: 3,
  MARET: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  MEI: 5,
  JUN: 6,
  JUNI: 6,
  JUL: 7,
  JULI: 7,
  AUG: 8,
  AGU: 8,
  AGUSTUS: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OKT: 10,
  OKTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DES: 12,
  DESEMBER: 12,
};

const DAY_NUMBER: Record<string, number> = {
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  "jum'at": 5,
  sabtu: 6,
  minggu: 7,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function dateValue(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function excelColumnName(columnNumber: number): string {
  let n = columnNumber;
  let out = "";
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function classifyRotationStatus(raw: unknown): SyaikhRotationStatus | null {
  const key = normalizeImportKey(raw).toUpperCase();
  if (!key || key === "-") return null;
  if (key.includes("NATIVE") || key.includes("SYAIKH") || key.includes("SYAIKHOH")) return "NATIVE";
  if (key === "NORMAL" || key.includes("NORMAL")) return "NORMAL";
  if (["ARABIC", "QURAN", "QUR'AN", "AL-QURAN", "AL-QUR'AN", "TAHSIN"].includes(key)) return "NORMAL";
  return null;
}

interface ParsedWeekRange {
  label: string;
  start: string;
  end: string;
  startYear: number;
  startMonth: number;
  startDay: number;
}

function parseWeekRange(raw: unknown, baseYear: number, previous?: ParsedWeekRange): ParsedWeekRange | null {
  const label = String(raw ?? "").trim();
  if (!label) return null;
  const normalized = label
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = normalized.match(/^(\d{1,2})(?:\s+([A-Z]+))?\s*-\s*(\d{1,2})\s+([A-Z]+)(?:\s+(\d{4}))?$/);
  if (!match) return null;

  const startDay = Number(match[1]);
  const startMonthToken = match[2] || match[4];
  const endDay = Number(match[3]);
  const endMonthToken = match[4];
  const startMonth = MONTHS[startMonthToken];
  const endMonth = MONTHS[endMonthToken];
  if (!startMonth || !endMonth) return null;

  let startYear = match[5] ? Number(match[5]) : (previous?.startYear ?? baseYear);
  if (!match[5] && previous) {
    if (startMonth < previous.startMonth) startYear = previous.startYear + 1;
  }
  let endYear = startYear;
  if (endMonth < startMonth) endYear += 1;

  return {
    label,
    start: isoDate(startYear, startMonth, startDay),
    end: isoDate(endYear, endMonth, endDay),
    startYear,
    startMonth,
    startDay,
  };
}

function splitClassGroup(raw: unknown): string[] {
  return String(raw ?? "")
    .split(/\s*\+\s*/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseSyaikhRotationMatrix(matrix: unknown[][], baseYear: number): SyaikhRotationParseResult {
  const issues: ImportIssue[] = [];
  const cells: ParsedRotationCell[] = [];
  let headerRowIndex = -1;
  let classColumnIndex = -1;

  for (let r = 0; r < matrix.length; r += 1) {
    const row = matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const key = normalizeImportKey(row[c]).replace(/\s/g, "");
      if (key.includes("kelas/") && key.includes("pekan")) {
        headerRowIndex = r;
        classColumnIndex = c;
        break;
      }
    }
    if (headerRowIndex >= 0) break;
  }

  if (headerRowIndex < 0 || classColumnIndex < 0) {
    issues.push({ severity: "ERROR", code: "ROTATION_HEADER_NOT_FOUND", message: "Header 'KELAS/ PEKAN' tidak ditemukan." });
    return { cells, issues, headerRow: null, classColumn: null };
  }

  const header = matrix[headerRowIndex] || [];
  const weeks: Array<{ columnIndex: number; range: ParsedWeekRange }> = [];
  let previous: ParsedWeekRange | undefined;
  for (let c = classColumnIndex + 1; c < header.length; c += 1) {
    const raw = header[c];
    if (!String(raw ?? "").trim()) continue;
    const parsed = parseWeekRange(raw, baseYear, previous);
    if (!parsed) {
      issues.push({
        severity: "ERROR",
        code: "WEEK_HEADER_UNREADABLE",
        message: `Rentang pekan '${String(raw)}' tidak terbaca. Gunakan format seperti '12 - 16 OCT'.`,
        sourceCell: `${excelColumnName(c + 1)}${headerRowIndex + 1}`,
      });
      continue;
    }
    if (previous && dateValue(parsed.start) <= dateValue(previous.start)) {
      issues.push({
        severity: "WARNING",
        code: "WEEK_ORDER_NON_MONOTONIC",
        message: `Pekan '${parsed.label}' tidak lebih baru dari pekan sebelumnya. Periksa label bulan/tahun.`,
        sourceCell: `${excelColumnName(c + 1)}${headerRowIndex + 1}`,
      });
    }
    weeks.push({ columnIndex: c, range: parsed });
    previous = parsed;
  }

  if (!weeks.length) {
    issues.push({ severity: "ERROR", code: "NO_WEEK_COLUMNS", message: "Tidak ada kolom pekan yang dapat dibaca." });
    return { cells, issues, headerRow: headerRowIndex + 1, classColumn: classColumnIndex + 1 };
  }

  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const classGroupLabel = String(matrix[r]?.[classColumnIndex] ?? "").trim();
    if (!classGroupLabel || classGroupLabel === "-") continue;
    const classNames = splitClassGroup(classGroupLabel);
    if (!classNames.length) continue;

    weeks.forEach(({ columnIndex, range }) => {
      const rawStatus = matrix[r]?.[columnIndex];
      const rawText = String(rawStatus ?? "").trim();
      if (!rawText || rawText === "-") return;
      const status = classifyRotationStatus(rawStatus);
      const sourceCell = `${excelColumnName(columnIndex + 1)}${r + 1}`;
      if (!status) {
        issues.push({ severity: "ERROR", code: "UNKNOWN_ROTATION_STATUS", message: `Status '${rawText}' tidak dikenali sebagai NATIVE/NORMAL.`, sourceCell });
        return;
      }
      cells.push({
        sourceCell,
        classGroupLabel,
        classNames,
        weekLabel: range.label,
        weekStart: range.start,
        weekEnd: range.end,
        status,
      });
    });
  }

  return { cells, issues, headerRow: headerRowIndex + 1, classColumn: classColumnIndex + 1 };
}

function teacherNamesFromSchedule(schedule: ScheduleItem): string[] {
  return [schedule.guru1, schedule.guru2, schedule.guru3, schedule.guru4, schedule.guru5, schedule.guru6]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function dayNumber(day: string): number {
  return DAY_NUMBER[normalizeImportKey(day)] || 0;
}

function dateForScheduleDay(weekStart: string, weekEnd: string, isoDay: number): string | null {
  const startMs = dateValue(weekStart);
  const endMs = dateValue(weekEnd);
  for (let ms = startMs; ms <= endMs; ms += 86_400_000) {
    const d = new Date(ms);
    const js = d.getUTCDay();
    const candidateIsoDay = js === 0 ? 7 : js;
    if (candidateIsoDay === isoDay) {
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }
  return null;
}

function teacherMatchesMaster(master: ScheduleImportTeacherMaster, name: string): boolean {
  const key = normalizeImportKey(name);
  return [master.full_name, master.short_name, master.legacy_name].some((value) => normalizeImportKey(value) === key);
}

export function resolveSyaikhRotationImport(args: {
  parsed: SyaikhRotationParseResult;
  schedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  teachers: ScheduleImportTeacherMaster[];
  classes: ScheduleImportClassMaster[];
  selectedSyaikhId: string;
  subjectMatcher?: string;
  annotateSpecialNote?: boolean;
}): SyaikhRotationResolution {
  const issues: ImportIssue[] = [...args.parsed.issues];
  const rows: SyaikhRotationPublishRow[] = [];
  const incidentals = args.incidentals || [];
  const selectedTeacher = args.teachers.find((teacher) => teacher.id === args.selectedSyaikhId && teacher.is_active !== false);
  if (!selectedTeacher) {
    issues.push({ severity: "ERROR", code: "SYAIKH_REQUIRED", message: "Pilih Syaikh/Syaikhoh yang akan dirotasi." });
    return {
      rows,
      issues,
      summary: { parsedCells: args.parsed.cells.length, publishRows: 0, nativeRows: 0, normalRows: 0, combinedGroups: 0, warningCount: issues.filter((x) => x.severity === "WARNING").length, errorCount: issues.filter((x) => x.severity === "ERROR").length },
    };
  }

  const classByKey = new Map<string, ScheduleImportClassMaster>();
  args.classes.filter((row) => row.is_active !== false).forEach((row) => {
    [row.code, row.display_name].forEach((value) => classByKey.set(normalizeImportClassKey(value), row));
  });

  const teacherByName = (name: string): ScheduleImportTeacherMaster | null => {
    return args.teachers.find((teacher) => teacher.is_active !== false && teacherMatchesMaster(teacher, name)) || null;
  };

  const matcher = normalizeImportKey(args.subjectMatcher || "");
  const selectedTeacherKeys = [selectedTeacher.full_name, selectedTeacher.short_name, selectedTeacher.legacy_name]
    .map(normalizeImportKey)
    .filter(Boolean);

  const groupKeys = new Set<string>();

  args.parsed.cells.forEach((cell, cellIndex) => {
    const resolvedClasses = cell.classNames.map((className) => ({ raw: className, row: classByKey.get(normalizeImportClassKey(className)) || null }));
    resolvedClasses.forEach(({ raw, row }) => {
      if (!row) issues.push({ severity: "ERROR", code: "UNKNOWN_CLASS", message: `Kelas '${raw}' tidak ditemukan di Master Data.`, sourceCell: cell.sourceCell });
    });
    if (resolvedClasses.some(({ row }) => !row)) return;

    const scheduleMatches = resolvedClasses.map(({ raw, row }) => {
      const candidates = args.schedules.filter((schedule) => {
        if (normalizeImportClassKey(schedule.kelas) !== normalizeImportClassKey(row!.display_name) && normalizeImportClassKey(schedule.kelas) !== normalizeImportClassKey(row!.code)) return false;
        const names = teacherNamesFromSchedule(schedule).map(normalizeImportKey);
        const hasSyaikh = names.some((name) => selectedTeacherKeys.includes(name));
        const hasSubject = matcher ? normalizeImportKey(schedule.mapel).includes(matcher) : false;
        return hasSyaikh || hasSubject;
      });
      if (candidates.length === 0) {
        issues.push({ severity: "ERROR", code: "MASTER_SLOT_NOT_FOUND", message: `${raw}: slot master untuk ${selectedTeacher.full_name}${matcher ? ` / '${args.subjectMatcher}'` : ""} tidak ditemukan.`, sourceCell: cell.sourceCell });
      } else if (candidates.length > 1) {
        issues.push({ severity: "ERROR", code: "AMBIGUOUS_MASTER_SLOT", message: `${raw}: ditemukan ${candidates.length} slot master kandidat. Persempit 'Pencocokan Mapel'.`, sourceCell: cell.sourceCell });
      }
      return { classRaw: raw, classRow: row!, schedule: candidates.length === 1 ? candidates[0] : null };
    });
    if (scheduleMatches.some((entry) => !entry.schedule)) return;

    const slotKeys = new Set(scheduleMatches.map((entry) => `${dayNumber(entry.schedule!.hari)}|${Number(entry.schedule!.jam_ke)}`));
    if (slotKeys.size !== 1) {
      issues.push({ severity: "ERROR", code: "GROUP_SLOT_MISMATCH", message: `${cell.classGroupLabel}: kelas dalam satu baris rotasi tidak berada pada hari/JP master yang sama.`, sourceCell: cell.sourceCell });
      return;
    }

    const firstSchedule = scheduleMatches[0].schedule!;
    const isoDay = dayNumber(firstSchedule.hari);
    const scheduleDate = dateForScheduleDay(cell.weekStart, cell.weekEnd, isoDay);
    if (!scheduleDate) {
      issues.push({ severity: "ERROR", code: "DAY_OUTSIDE_WEEK", message: `${cell.weekLabel} tidak memuat hari ${firstSchedule.hari} untuk ${cell.classGroupLabel}.`, sourceCell: cell.sourceCell });
      return;
    }

    const groupKey = `${scheduleDate}|${Number(firstSchedule.jam_ke)}|${normalizeImportKey(cell.classGroupLabel)}|${cellIndex}`;
    groupKeys.add(groupKey);

    const subjectKeys = new Set(scheduleMatches.map((entry) => normalizeImportKey(entry.schedule!.mapel)));
    if (cell.classNames.length > 1 && subjectKeys.size > 1) {
      issues.push({ severity: "ERROR", code: "GROUP_SUBJECT_MISMATCH", message: `${cell.classGroupLabel}: kelas dalam satu baris rotasi memiliki mapel master yang berbeda.`, sourceCell: cell.sourceCell });
      return;
    }

    const sessionTeacherMap = new Map<string, ScheduleImportTeacherMaster>();
    for (const entry of scheduleMatches) {
      for (const name of teacherNamesFromSchedule(entry.schedule!)) {
        const teacher = teacherByName(name);
        if (!teacher) {
          issues.push({ severity: "ERROR", code: "MASTER_TEACHER_UNRESOLVED", message: `${entry.classRow.display_name}: guru master '${name}' tidak ditemukan di Master Data.`, sourceCell: cell.sourceCell });
          return;
        }
        if (!sessionTeacherMap.has(teacher.id)) sessionTeacherMap.set(teacher.id, teacher);
      }
    }

    let sessionTeachers = [...sessionTeacherMap.values()];
    if (cell.status === "NATIVE") {
      if (!sessionTeachers.some((teacher) => teacher.id === selectedTeacher.id)) sessionTeachers.push(selectedTeacher);
    } else {
      sessionTeachers = sessionTeachers.filter((teacher) => teacher.id !== selectedTeacher.id);
    }

    if (!sessionTeachers.length) {
      issues.push({ severity: "ERROR", code: "NORMAL_HAS_NO_COMPANION", message: `${cell.classGroupLabel}: status NORMAL menghapus ${selectedTeacher.full_name}, tetapi tidak ada guru pendamping tersisa.`, sourceCell: cell.sourceCell });
      return;
    }
    if (sessionTeachers.length > 6) {
      issues.push({ severity: "ERROR", code: "TOO_MANY_TEACHERS", message: `${cell.classGroupLabel}: hasil union guru satu sesi memiliki lebih dari 6 guru.`, sourceCell: cell.sourceCell });
      return;
    }

    scheduleMatches.forEach(({ classRow, schedule }) => {
      const existingIncidental = incidentals.find((incidental) => incidental.tanggal === scheduleDate && Number(incidental.jam_ke) === Number(schedule!.jam_ke) && normalizeImportClassKey(incidental.kelas) === normalizeImportClassKey(classRow.display_name));
      if (existingIncidental && !normalizeImportKey(existingIncidental.tipe_insidental).includes("syaikh_rotation")) {
        issues.push({ severity: "ERROR", code: "INCIDENTAL_SLOT_OCCUPIED", message: `${classRow.display_name} ${scheduleDate} JP${schedule!.jam_ke} sudah memiliki perubahan insidental lain (${existingIncidental.tipe_insidental || existingIncidental.alasan || "tanpa label"}).`, sourceCell: cell.sourceCell });
        return;
      }

      const noteParts = [String(schedule!.keterangan_khusus || "").trim()].filter(Boolean);
      if (args.annotateSpecialNote) noteParts.push(`Rotasi Syaikh: ${cell.status}`);
      rows.push({
        sourceCell: cell.sourceCell,
        groupKey,
        scheduleDate,
        classId: classRow.id,
        className: classRow.display_name,
        period: Number(schedule!.jam_ke),
        subject: schedule!.mapel,
        isCombined: cell.classNames.length > 1 || ["ya", "iya"].includes(normalizeImportKey(schedule!.kelasgabung)),
        teacherIds: sessionTeachers.map((teacher) => teacher.id),
        teacherNames: sessionTeachers.map((teacher) => teacher.full_name),
        specialNote: noteParts.join(" • ") || null,
        reason: `Rotasi ${selectedTeacher.full_name}: ${cell.status} • ${cell.weekLabel}`,
        rotationStatus: cell.status,
        weekLabel: cell.weekLabel,
      });
    });
  });

  // Preview-only collision detection. Multiple classes in the same explicit '+' group
  // are one teaching session and therefore do not warn each other.
  const teacherSlots = new Map<string, { groupKey: string; className: string; sourceCell: string }>();
  rows.forEach((row) => {
    row.teacherIds.forEach((teacherId, index) => {
      const key = `${row.scheduleDate}|${row.period}|${teacherId}`;
      const prior = teacherSlots.get(key);
      if (prior && prior.groupKey !== row.groupKey) {
        issues.push({
          severity: "WARNING",
          code: "ROTATION_TEACHER_CONFLICT",
          message: `${row.scheduleDate} JP${row.period}: ${row.teacherNames[index]} muncul pada '${prior.className}' dan '${row.className}'. Publish memerlukan konfirmasi warning.`,
          sourceCell: row.sourceCell,
        });
      } else if (!prior) {
        teacherSlots.set(key, { groupKey: row.groupKey, className: row.className, sourceCell: row.sourceCell });
      }
    });
  });

  const dedupedIssues = issues.filter((issue, index, all) => all.findIndex((other) => other.severity === issue.severity && other.code === issue.code && other.message === issue.message && other.sourceCell === issue.sourceCell) === index);
  return {
    rows,
    issues: dedupedIssues,
    summary: {
      parsedCells: args.parsed.cells.length,
      publishRows: rows.length,
      nativeRows: rows.filter((row) => row.rotationStatus === "NATIVE").length,
      normalRows: rows.filter((row) => row.rotationStatus === "NORMAL").length,
      combinedGroups: new Set(rows.filter((row) => row.isCombined).map((row) => row.groupKey)).size,
      warningCount: dedupedIssues.filter((issue) => issue.severity === "WARNING").length,
      errorCount: dedupedIssues.filter((issue) => issue.severity === "ERROR").length,
    },
  };
}

export function matrixLooksLikeSyaikhRotation(matrix: unknown[][]): boolean {
  return matrix.some((row) => (row || []).some((value) => {
    const key = normalizeImportKey(value).replace(/\s/g, "");
    return key.includes("kelas/") && key.includes("pekan");
  }));
}

export function rotationMatrixFromPastedTsv(text: string): unknown[][] {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
}
