import type { ScheduleItem } from "./models";

export type ImportSeverity = "ERROR" | "WARNING" | "INFO";

export interface ImportIssue {
  severity: ImportSeverity;
  code: string;
  message: string;
  sourceCell?: string;
}

export interface ScheduleImportTeacherMaster {
  id: string;
  full_name: string;
  short_name?: string | null;
  legacy_name?: string | null;
  is_active?: boolean;
  gender?: "IKHWAN" | "AKHWAT" | "UNKNOWN" | string | null;
}

export interface ScheduleImportClassMaster {
  id: string;
  code: string;
  display_name: string;
  is_active?: boolean;
}

export interface ScheduleImportTeacherAlias {
  alias: string;
  teacher_id: string;
}

export interface OriParsedRow {
  sourceCell: string;
  sourceRow: number;
  sourceColumn: number;
  className: string;
  dayName: string;
  dayOfWeek: number;
  period: number;
  startTime: string;
  endTime: string;
  rawAssignment: string;
  subject: string;
  teacherTokens: string[];
}

export interface ResolvedImportTeacher {
  token: string;
  teacherId: string | null;
  teacherName: string | null;
  matchSource: "FULL_NAME" | "SHORT_NAME" | "LEGACY_NAME" | "ALIAS" | "MANUAL" | "UNRESOLVED";
}

export interface ResolvedScheduleImportRow extends OriParsedRow {
  classId: string | null;
  classDisplayName: string;
  canonicalSubject: string;
  teachers: ResolvedImportTeacher[];
  isCombined: boolean;
  combinedGroupKey: string | null;
  preservedRoomId: string | null;
}

export interface ScheduleImportResolution {
  rows: ResolvedScheduleImportRow[];
  issues: ImportIssue[];
  unresolvedTeacherTokens: string[];
  unknownClasses: string[];
  summary: {
    parsedRows: number;
    resolvedRows: number;
    errorCount: number;
    warningCount: number;
    inferredCombinedRows: number;
    inferredCombinedGroups: number;
  };
}

const DAY_MAP: Record<string, { name: string; number: number }> = {
  MONDAY: { name: "Senin", number: 1 },
  SENIN: { name: "Senin", number: 1 },
  TUESDAY: { name: "Selasa", number: 2 },
  SELASA: { name: "Selasa", number: 2 },
  WEDNESDAY: { name: "Rabu", number: 3 },
  RABU: { name: "Rabu", number: 3 },
  THURSDAY: { name: "Kamis", number: 4 },
  KAMIS: { name: "Kamis", number: 4 },
  FRIDAY: { name: "Jumat", number: 5 },
  JUMAT: { name: "Jumat", number: 5 },
  "JUM'AT": { name: "Jumat", number: 5 },
  SATURDAY: { name: "Sabtu", number: 6 },
  SABTU: { name: "Sabtu", number: 6 },
  SUNDAY: { name: "Minggu", number: 7 },
  MINGGU: { name: "Minggu", number: 7 },
};

export function normalizeImportKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\.\s*/g, ".");
}

export function normalizeImportClassKey(value: unknown): string {
  return normalizeImportKey(value).replace(/^0+(\d+)\b/, "$1");
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

function excelColumnNumber(columnName: string): number {
  let out = 0;
  for (const ch of columnName.toUpperCase()) {
    out = out * 26 + (ch.charCodeAt(0) - 64);
  }
  return out;
}

function resolveMatrixCell(matrix: unknown[][], rowIndex: number, columnIndex: number, seen = new Set<string>()): unknown {
  const key = `${rowIndex}:${columnIndex}`;
  if (seen.has(key)) return matrix[rowIndex]?.[columnIndex];
  seen.add(key);
  const value = matrix[rowIndex]?.[columnIndex];
  if (typeof value !== "string") return value;
  const formula = value.trim().match(/^=\$?([A-Z]{1,3})\$?(\d+)$/i);
  if (!formula) return value;
  const referencedColumn = excelColumnNumber(formula[1]) - 1;
  const referencedRow = Number(formula[2]) - 1;
  if (referencedRow < 0 || referencedColumn < 0) return value;
  return resolveMatrixCell(matrix, referencedRow, referencedColumn, seen);
}

export function parseTimeRange(raw: unknown): { startTime: string; endTime: string } | null {
  const value = String(raw ?? "").trim().replace(/[–—]/g, "-");
  if (!value) return null;
  const match = value.match(/(\d{1,2})\s*[.:]\s*(\d{2})\s*-\s*(\d{1,2})\s*[.:]\s*(\d{2})/);
  if (!match) return null;
  const hhmm = (h: string, m: string) => `${String(Number(h)).padStart(2, "0")}:${m}`;
  return { startTime: hhmm(match[1], match[2]), endTime: hhmm(match[3], match[4]) };
}

export function parseAssignmentCell(raw: unknown): { subject: string; teacherTokens: string[] } | null {
  const value = String(raw ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!value || value === "-") return null;
  const match = value.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!match) return { subject: value, teacherTokens: [] };
  const subject = match[1].trim();
  const teacherTokens = match[2]
    .split(/\s*\/\s*/g)
    .map((token) => token.trim())
    .filter(Boolean);
  return { subject, teacherTokens };
}

/**
 * Parses the school's long-running `ori` schedule template.
 * It deliberately reads the structure (day marker -> class header -> JP/time rows)
 * instead of relying on colors/merged-cell styling, so revisions to formatting do
 * not silently change the imported schedule.
 */
export function parseOriScheduleMatrix(matrix: unknown[][]): { rows: OriParsedRow[]; issues: ImportIssue[] } {
  const rows: OriParsedRow[] = [];
  const issues: ImportIssue[] = [];
  const dayMarkers: Array<{ rowIndex: number; name: string; number: number }> = [];

  matrix.forEach((row, rowIndex) => {
    const marker = String(row?.[1] ?? "").trim().toUpperCase();
    const day = DAY_MAP[marker];
    if (day) dayMarkers.push({ rowIndex, name: day.name, number: day.number });
  });

  if (dayMarkers.length === 0) {
    issues.push({ severity: "ERROR", code: "NO_DAY_MARKERS", message: "Tidak ditemukan blok MONDAY/TUESDAY/... pada sheet ori." });
    return { rows, issues };
  }

  dayMarkers.forEach((dayMarker, dayMarkerIndex) => {
    const headerRowIndex = dayMarker.rowIndex + 1;
    const headerRow = matrix[headerRowIndex] || [];
    const nextDayRowIndex = dayMarkers[dayMarkerIndex + 1]?.rowIndex ?? matrix.length;
    const classColumns: Array<{ columnIndex: number; className: string }> = [];

    for (let columnIndex = 2; columnIndex < headerRow.length; columnIndex += 1) {
      const className = String(headerRow[columnIndex] ?? "").trim();
      if (!className || className === "-") continue;
      classColumns.push({ columnIndex, className });
    }

    if (classColumns.length === 0) {
      issues.push({
        severity: "WARNING",
        code: "EMPTY_DAY_HEADER",
        message: `${dayMarker.name}: header kelas kosong, blok dilewati.`,
        sourceCell: `B${dayMarker.rowIndex + 1}`,
      });
      return;
    }

    for (let rowIndex = headerRowIndex + 1; rowIndex < nextDayRowIndex; rowIndex += 1) {
      const periodRaw = resolveMatrixCell(matrix, rowIndex, 0);
      const period = Number(periodRaw);
      if (!Number.isFinite(period) || period < 0 || period > 6) continue;

      const timeRange = parseTimeRange(resolveMatrixCell(matrix, rowIndex, 1));
      const hasAnyAssignment = classColumns.some(({ columnIndex }) => {
        const value = String(resolveMatrixCell(matrix, rowIndex, columnIndex) ?? "").trim();
        return value !== "" && value !== "-";
      });
      if (!hasAnyAssignment) continue;
      if (!timeRange) {
        issues.push({
          severity: "ERROR",
          code: "MISSING_TIME_RANGE",
          message: `${dayMarker.name} JP ${period}: ada pelajaran tetapi rentang waktu tidak terbaca.`,
          sourceCell: `B${rowIndex + 1}`,
        });
        continue;
      }

      classColumns.forEach(({ columnIndex, className }) => {
        const resolvedValue = resolveMatrixCell(matrix, rowIndex, columnIndex);
        const rawValue = String(resolvedValue ?? "").trim();
        const sourceCell = `${excelColumnName(columnIndex + 1)}${rowIndex + 1}`;
        const openParens = (rawValue.match(/\(/g) || []).length;
        const closeParens = (rawValue.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          issues.push({
            severity: "ERROR",
            code: "MALFORMED_ASSIGNMENT",
            message: `Format pelajaran/guru tidak lengkap: '${rawValue}'. Periksa tanda kurung pada cell ini.`,
            sourceCell,
          });
          return;
        }
        const assignment = parseAssignmentCell(resolvedValue);
        if (!assignment) return;
        if (!assignment.subject) {
          issues.push({ severity: "ERROR", code: "EMPTY_SUBJECT", message: "Mata pelajaran kosong.", sourceCell });
          return;
        }
        rows.push({
          sourceCell,
          sourceRow: rowIndex + 1,
          sourceColumn: columnIndex + 1,
          className,
          dayName: dayMarker.name,
          dayOfWeek: dayMarker.number,
          period,
          startTime: timeRange.startTime,
          endTime: timeRange.endTime,
          rawAssignment: String(resolvedValue ?? "").trim(),
          subject: assignment.subject,
          teacherTokens: assignment.teacherTokens,
        });
      });
    }
  });

  return { rows, issues };
}

export function matrixFromPastedTsv(text: string): unknown[][] {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
}

function buildExistingSubjectMap(schedules: ScheduleItem[]): Map<string, string> {
  const map = new Map<string, string>();
  schedules.forEach((schedule) => {
    const subject = String(schedule.mapel || "").trim();
    if (!subject) return;
    const key = normalizeImportKey(subject);
    if (!map.has(key)) map.set(key, subject);
  });
  return map;
}

function buildPreservedRoomMap(schedules: ScheduleItem[]): Map<string, string> {
  const map = new Map<string, string>();
  schedules.forEach((schedule) => {
    const room = String(schedule.ruangan || "").trim();
    if (!room) return;
    const key = `${normalizeImportClassKey(schedule.kelas)}|${normalizeImportKey(schedule.hari)}|${Number(schedule.jam_ke)}`;
    if (!map.has(key)) map.set(key, room);
  });
  return map;
}

export function resolveScheduleImport(args: {
  parsedRows: OriParsedRow[];
  parserIssues?: ImportIssue[];
  teachers: ScheduleImportTeacherMaster[];
  classes: ScheduleImportClassMaster[];
  aliases?: ScheduleImportTeacherAlias[];
  manualTeacherMap?: Record<string, string>;
  currentSchedules?: ScheduleItem[];
}): ScheduleImportResolution {
  const issues: ImportIssue[] = [...(args.parserIssues || [])];
  const aliases = args.aliases || [];
  const manualTeacherMap = args.manualTeacherMap || {};
  const currentSchedules = args.currentSchedules || [];
  const classByKey = new Map<string, ScheduleImportClassMaster>();
  args.classes.filter((row) => row.is_active !== false).forEach((row) => {
    [row.code, row.display_name].forEach((value) => {
      const key = normalizeImportClassKey(value);
      if (key && !classByKey.has(key)) classByKey.set(key, row);
    });
  });

  type Candidate = { teacher: ScheduleImportTeacherMaster; source: ResolvedImportTeacher["matchSource"] };
  const teacherCandidates = new Map<string, Candidate[]>();
  const pushTeacherKey = (value: unknown, teacher: ScheduleImportTeacherMaster, source: Candidate["source"]) => {
    const key = normalizeImportKey(value);
    if (!key) return;
    const list = teacherCandidates.get(key) || [];
    if (!list.some((item) => item.teacher.id === teacher.id)) list.push({ teacher, source });
    teacherCandidates.set(key, list);
  };
  args.teachers.filter((teacher) => teacher.is_active !== false).forEach((teacher) => {
    pushTeacherKey(teacher.full_name, teacher, "FULL_NAME");
    pushTeacherKey(teacher.short_name, teacher, "SHORT_NAME");
    pushTeacherKey(teacher.legacy_name, teacher, "LEGACY_NAME");
  });
  aliases.forEach((alias) => {
    const teacher = args.teachers.find((row) => row.id === alias.teacher_id);
    if (teacher) pushTeacherKey(alias.alias, teacher, "ALIAS");
  });

  const subjectMap = buildExistingSubjectMap(currentSchedules);
  const roomMap = buildPreservedRoomMap(currentSchedules);
  const unresolved = new Set<string>();
  const unknownClasses = new Set<string>();

  const resolvedRows: ResolvedScheduleImportRow[] = args.parsedRows.map((row) => {
    const classRow = classByKey.get(normalizeImportClassKey(row.className)) || null;
    if (!classRow) {
      unknownClasses.add(row.className);
      issues.push({ severity: "ERROR", code: "UNKNOWN_CLASS", message: `Kelas '${row.className}' belum ada di Master Data.`, sourceCell: row.sourceCell });
    }

    const resolvedTeachers = row.teacherTokens.map((token): ResolvedImportTeacher => {
      const tokenKey = normalizeImportKey(token);
      const manualTeacherId = manualTeacherMap[tokenKey];
      if (manualTeacherId) {
        const teacher = args.teachers.find((candidate) => candidate.id === manualTeacherId);
        if (teacher) return { token, teacherId: teacher.id, teacherName: teacher.full_name, matchSource: "MANUAL" };
      }
      const candidates = teacherCandidates.get(tokenKey) || [];
      if (candidates.length === 1) {
        return { token, teacherId: candidates[0].teacher.id, teacherName: candidates[0].teacher.full_name, matchSource: candidates[0].source };
      }
      unresolved.add(token);
      issues.push({
        severity: "ERROR",
        code: candidates.length > 1 ? "AMBIGUOUS_TEACHER" : "UNKNOWN_TEACHER",
        message: candidates.length > 1
          ? `Nama guru '${token}' cocok ke lebih dari satu Master Guru.`
          : `Guru '${token}' belum dikenali. Pilih padanannya di Alias Resolver.`,
        sourceCell: row.sourceCell,
      });
      return { token, teacherId: null, teacherName: null, matchSource: "UNRESOLVED" };
    });

    const subjectKey = normalizeImportKey(row.subject);
    const canonicalSubject = subjectMap.get(subjectKey) || row.subject.trim();
    const roomKey = `${normalizeImportClassKey(classRow?.display_name || row.className)}|${normalizeImportKey(row.dayName)}|${row.period}`;
    return {
      ...row,
      classId: classRow?.id || null,
      classDisplayName: classRow?.display_name || row.className,
      canonicalSubject,
      teachers: resolvedTeachers,
      isCombined: false,
      combinedGroupKey: null,
      preservedRoomId: roomMap.get(roomKey) || null,
    };
  });

  // Duplicate class-slot check first: one class should have at most one recurring assignment per JP.
  const classSlotMap = new Map<string, ResolvedScheduleImportRow[]>();
  resolvedRows.forEach((row) => {
    const key = `${row.classId || normalizeImportClassKey(row.className)}|${row.dayOfWeek}|${row.period}`;
    const list = classSlotMap.get(key) || [];
    list.push(row);
    classSlotMap.set(key, list);
  });
  classSlotMap.forEach((list) => {
    if (list.length > 1) {
      list.forEach((row) => issues.push({ severity: "ERROR", code: "DUPLICATE_CLASS_SLOT", message: `${row.classDisplayName} memiliki lebih dari satu pelajaran pada ${row.dayName} JP ${row.period}.`, sourceCell: row.sourceCell }));
    }
  });

  // Inferred combined classes: identical day/JP/time/subject and identical teacher set.
  const combinedGroups = new Map<string, ResolvedScheduleImportRow[]>();
  resolvedRows.forEach((row) => {
    const teacherIds = row.teachers.map((teacher) => teacher.teacherId || `?${normalizeImportKey(teacher.token)}`).sort();
    const signature = [row.dayOfWeek, row.period, row.startTime, row.endTime, normalizeImportKey(row.canonicalSubject), teacherIds.join(",")].join("|");
    const list = combinedGroups.get(signature) || [];
    list.push(row);
    combinedGroups.set(signature, list);
  });
  let inferredCombinedGroups = 0;
  combinedGroups.forEach((list, signature) => {
    if (list.length < 2) return;
    inferredCombinedGroups += 1;
    list.forEach((row) => {
      row.isCombined = true;
      row.combinedGroupKey = signature;
    });
  });

  // Teacher double-booking check after combined inference.
  const teacherSlotMap = new Map<string, ResolvedScheduleImportRow[]>();
  resolvedRows.forEach((row) => {
    row.teachers.forEach((teacher) => {
      if (!teacher.teacherId) return;
      const key = `${teacher.teacherId}|${row.dayOfWeek}|${row.period}`;
      const list = teacherSlotMap.get(key) || [];
      list.push(row);
      teacherSlotMap.set(key, list);
    });
  });
  teacherSlotMap.forEach((list) => {
    if (list.length < 2) return;
    const groupKeys = new Set(list.map((row) => row.combinedGroupKey || `single:${row.sourceCell}`));
    if (groupKeys.size <= 1) return;
    const teacherName = list.flatMap((row) => row.teachers).find((teacher) => teacher.teacherId)?.teacherName || "Guru";
    const locations = list.map((row) => `${row.classDisplayName} (${row.sourceCell})`).join(", ");
    issues.push({ severity: "ERROR", code: "TEACHER_CONFLICT", message: `${teacherName} bentrok pada ${list[0].dayName} JP ${list[0].period}: ${locations}.` });
  });

  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;
  const inferredCombinedRows = resolvedRows.filter((row) => row.isCombined).length;

  return {
    rows: resolvedRows,
    issues,
    unresolvedTeacherTokens: [...unresolved].sort((a, b) => a.localeCompare(b, "id")),
    unknownClasses: [...unknownClasses].sort((a, b) => a.localeCompare(b, "id", { numeric: true })),
    summary: {
      parsedRows: args.parsedRows.length,
      resolvedRows: resolvedRows.filter((row) => row.classId && row.teachers.every((teacher) => teacher.teacherId)).length,
      errorCount,
      warningCount,
      inferredCombinedRows,
      inferredCombinedGroups,
    },
  };
}

export function buildImportPublishPayload(rows: ResolvedScheduleImportRow[]) {
  return rows.map((row) => ({
    source_cell: row.sourceCell,
    class_id: row.classId,
    day_of_week: row.dayOfWeek,
    period: row.period,
    start_time: row.startTime,
    end_time: row.endTime,
    subject: row.canonicalSubject,
    room_id: row.preservedRoomId,
    is_combined: row.isCombined,
    teacher_ids: row.teachers.map((teacher) => teacher.teacherId),
    teacher_names: row.teachers.map((teacher) => teacher.teacherName || teacher.token),
  }));
}
