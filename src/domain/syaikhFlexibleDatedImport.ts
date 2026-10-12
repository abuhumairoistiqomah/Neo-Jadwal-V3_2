import type { JadwalInsidentalItem, ScheduleItem } from "./models";
import {
  normalizeImportClassKey, normalizeImportKey,
  type ImportIssue, type ScheduleImportClassMaster,
  type ScheduleImportTeacherAlias, type ScheduleImportTeacherMaster,
} from "./scheduleImport";
import { LEGACY_ROTATION_HEADER, parseLegacyRotationTemplate, type LegacyRotationTemplateRow } from "./syaikhAlternatingLegacyImport";
import type { SyaikhRotationPublishRow } from "./syaikhRotationImport";

// Ali's schedule is event-driven. No parity, recurring auto-publish, or catch-up.
export type FlexibleScenarioChoice = "A" | "B" | "SKIP";
export type FlexibleTemplateSlot = { key: string; className: string; period: number; isoDay: number; a?: LegacyRotationTemplateRow; b?: LegacyRotationTemplateRow };

function dayOf(date: Date): number { return date.getUTCDay() || 7; }
function parseISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
function rowKey(row: LegacyRotationTemplateRow): string {
  return `${normalizeImportClassKey(row.className)}|${row.isoDay}|${row.period}`;
}
export function getFlexibleTemplateSlots(aText: string, bText: string): { slots: FlexibleTemplateSlot[]; issues: ImportIssue[] } {
  const a = parseLegacyRotationTemplate(aText, "A");
  const b = parseLegacyRotationTemplate(bText, "B");
  const aBlank = !aText.trim() || aText.trim() === LEGACY_ROTATION_HEADER.trim();
  const bBlank = !bText.trim() || bText.trim() === LEGACY_ROTATION_HEADER.trim();
  const issues = [ ...(aBlank ? [] : a.issues), ...(bBlank ? [] : b.issues) ];
  const slots = new Map<string, FlexibleTemplateSlot>();
  for (const [label, rows] of [["A", a.rows], ["B", b.rows]] as const) for (const row of rows) {
    const key = rowKey(row);
    if (!slots.has(key)) slots.set(key, { key, className: row.className, period: row.period, isoDay: row.isoDay });
    slots.get(key)![label === "A" ? "a" : "b"] = row;
  }
  return { slots: Array.from(slots.values()).sort((a, b) => a.isoDay - b.isoDay || a.period - b.period || a.className.localeCompare(b.className)), issues };
}
function cellsFromRow(row: LegacyRotationTemplateRow, date: string): string[] {
  return [date, row.className, String(row.period), row.subject,
    ...Array.from({ length: 6 }, (_, i) => row.teacherTokens[i] || ""),
    row.specialNote, row.reason, row.incidentalType, row.room];
}

/** Explicit per-slot decisions generate ONE dated plan; SKIP does not cancel master. */
export function prepareFlexibleWeek(args: {
  aText: string; bText: string; monday: string;
  selections: Record<string, FlexibleScenarioChoice>;
}): { lines: string[]; issues: ImportIssue[]; skipped: number } {
  const { slots, issues } = getFlexibleTemplateSlots(args.aText, args.bText);
  const monday = parseISO(args.monday);
  if (!monday || dayOf(monday) !== 1) issues.push({ severity: "ERROR", code: "START_MONDAY_REQUIRED", message: "Pilih hari Senin yang valid sebagai awal pekan." });
  const lines: string[] = [];
  let skipped = 0;
  for (const slot of slots) {
    const choice = args.selections[slot.key] || "SKIP";
    if (choice === "SKIP") { skipped++; continue; }
    const picked = choice === "A" ? slot.a : slot.b;
    if (!picked) {
      issues.push({ severity: "ERROR", code: "SCENARIO_NOT_DEFINED", message: `${slot.className} JP${slot.period} belum punya konfigurasi skenario ${choice}.` });
      continue;
    }
    if (!monday) continue;
    const date = new Date(monday.getTime() + (slot.isoDay - 1) * 86400000).toISOString().slice(0, 10);
    lines.push(cellsFromRow(picked, date).join("\t"));
  }
  return { lines, issues, skipped };
}

/** Parse the actual dated TSV. Several Mondays are allowed; no auto alternation. */
export function parseFlexibleDatedTSV(tsv: string): { rows: LegacyRotationTemplateRow[]; issues: ImportIssue[] } {
  const rows: LegacyRotationTemplateRow[] = [];
  const issues: ImportIssue[] = [];
  const lines = tsv.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => line.trim());
  if (first < 0) return { rows, issues: [{ severity: "ERROR", code: "DATED_TSV_EMPTY", message: "Belum ada jadwal aktual untuk dipublish." }] };
  const header = lines[first].split("\t").map(normalizeImportKey);
  const required = ["tanggal", "kelas", "jamke", "mata pelajaran", "guru1"];
  if (!required.every((col, i) => header[i] === col)) return { rows, issues: [{ severity: "ERROR", code: "LEGACY_HEADER", message: "Header TSV wajib dimulai Tanggal, kelas, jamke, mata pelajaran, guru1 (dipisahkan TAB)." }] };
  const seen = new Set<string>();
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split("\t").map((value) => value.trim());
    const sourceCell = `baris ${i + 1}`;
    const date = parseISO(cells[0] || "");
    const period = Number(cells[2]);
    if (!date || !cells[1] || !Number.isInteger(period) || period < 1 || period > 6 || !cells[3]) {
      issues.push({ severity: "ERROR", code: "DATED_ROW_INVALID", sourceCell, message: "Tanggal YYYY-MM-DD, kelas, JP 1–6 dan mapel wajib valid." });
      continue;
    }
    const teacherTokens = cells.slice(4, 10).filter(Boolean);
    if (!teacherTokens.length) {
      issues.push({ severity: "ERROR", code: "TEACHERS_REQUIRED", sourceCell, message: "Minimal guru1 harus terisi." });
      continue;
    }
    const row: LegacyRotationTemplateRow = { rowNumber: i + 1, date: cells[0], isoDay: dayOf(date),
      className: cells[1], period, subject: cells[3], teacherTokens,
      specialNote: cells[10] || "", reason: cells[11] || "", incidentalType: cells[12] || "", room: cells[13] || "" };
    const identity = `${date.toISOString().slice(0, 10)}|${normalizeImportClassKey(row.className)}|${period}`;
    if (seen.has(identity)) {
      issues.push({ severity: "ERROR", code: "DUPLICATE_DATED_SLOT", sourceCell, message: `Satu kelas/tanggal/JP tidak boleh diinput dua kali: ${row.className} JP${period} ${row.date}.` });
      continue;
    }
    seen.add(identity);
    rows.push(row);
  }
  if (!rows.length && !issues.length) issues.push({ severity: "ERROR", code: "DATED_TSV_EMPTY", message: "Belum ada jadwal aktual untuk dipublish." });
  return { rows, issues };
}

export function buildFlexibleDatedRotation(args: {
  datedText: string; selectedSyaikhId: string;
  classes: ScheduleImportClassMaster[]; teachers: ScheduleImportTeacherMaster[];
  aliases: ScheduleImportTeacherAlias[]; schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
}): { rows: SyaikhRotationPublishRow[]; issues: ImportIssue[]; inputCount: number } {
  const parsed = parseFlexibleDatedTSV(args.datedText);
  const issues = [...parsed.issues];
  const rows: SyaikhRotationPublishRow[] = [];
  const syaikh = args.teachers.find((teacher) => teacher.id === args.selectedSyaikhId && teacher.is_active !== false);
  if (!syaikh) issues.push({ severity: "ERROR", code: "SYAIKH_REQUIRED", message: "Pilih Syaikh yang valid di Master Guru." });
  if (!syaikh || issues.some((issue) => issue.severity === "ERROR")) return { rows, issues, inputCount: parsed.rows.length };
  const classes = args.classes.filter((c) => c.is_active !== false);
  const teachers = args.teachers.filter((t) => t.is_active !== false);
  const resolveClass = (name: string) => {
    const key = normalizeImportClassKey(name);
    const matches = classes.filter((c) => [c.code, c.display_name].some((text) => normalizeImportClassKey(text) === key));
    return matches.length === 1 ? matches[0] : null;
  };
  const resolveTeacher = (name: string) => {
    const key = normalizeImportKey(name);
    const aliasIds = args.aliases.filter((a) => normalizeImportKey(a.alias) === key).map((a) => a.teacher_id);
    const matches = teachers.filter((t) => aliasIds.includes(t.id) ||
      [t.full_name, t.short_name, t.legacy_name].some((text) => text && normalizeImportKey(text) === key));
    return matches.length === 1 ? matches[0] : null;
  };
  const dayLookup: Record<string, number> = { senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6, minggu: 7 };
  const teacherSlots = new Map<string, { className: string; subject: string; team: string }>();
  for (const source of parsed.rows) {
    const sourceCell = `baris ${source.rowNumber}`;
    const klass = resolveClass(source.className);
    if (!klass) { issues.push({ severity: "ERROR", code: "CLASS_NOT_FOUND", sourceCell, message: `Kelas '${source.className}' tidak ditemukan/tidak unik.` }); continue; }
    const resolved = source.teacherTokens.map(resolveTeacher);
    for (let i = 0; i < resolved.length; i++) if (!resolved[i]) issues.push({ severity: "ERROR", code: "TEACHER_NOT_FOUND", sourceCell, message: `Guru '${source.teacherTokens[i]}' tidak ditemukan/tidak unik. Periksa alias.` });
    if (resolved.some((t) => !t)) continue;
    const team = resolved.filter((t): t is ScheduleImportTeacherMaster => Boolean(t));
    const masterRows = args.schedules.filter((s) => normalizeImportClassKey(s.kelas) === normalizeImportClassKey(klass.display_name) &&
      Number(s.jam_ke) === source.period && dayLookup[normalizeImportKey(s.hari)] === source.isoDay);
    if (!masterRows.length) { issues.push({ severity: "ERROR", code: "MASTER_SLOT_MISSING", sourceCell, message: `Jadwal master ${klass.display_name} pada hari ke-${source.isoDay} JP${source.period} tidak tersedia.` }); continue; }
    if (masterRows.length > 1) issues.push({ severity: "WARNING", code: "MULTIPLE_MASTER_ROWS", sourceCell, message: `${klass.display_name} punya ${masterRows.length} master pada JP${source.period}.` });
    if (source.room) issues.push({ severity: "WARNING", code: "ROOM_INHERITED", sourceCell, message: `Ruangan '${source.room}' tidak dipublish oleh RPC rotasi; ruangan master tetap digunakan. Ubah lewat Jadwal Ruangan.` });
    const existing = args.incidentals.find((inc) => inc.tanggal === source.date && Number(inc.jam_ke) === source.period && normalizeImportClassKey(inc.kelas) === normalizeImportClassKey(klass.display_name));
    if (existing && !normalizeImportKey(existing.tipe_insidental).includes("syaikh_rotation")) {
      issues.push({ severity: "ERROR", code: "OTHER_INCIDENTAL_OWNS_SLOT", sourceCell, message: `${source.date} ${klass.display_name} JP${source.period} sudah diambil insidental lain.` }); continue;
    }
    if (existing && !normalizeImportKey(existing.alasan).includes(normalizeImportKey(syaikh.full_name))) {
      issues.push({ severity: "ERROR", code: "OTHER_SYAIKH_ROTATION", sourceCell, message: `Slot ${source.date} ${klass.display_name} JP${source.period} milik rotasi Syaikh lain/tidak jelas.` }); continue;
    }
    const isNative = team.some((t) => t.id === syaikh.id);
    if (normalizeImportKey(source.incidentalType) === "native" && !isNative) {
      issues.push({ severity: "ERROR", code: "NATIVE_WITHOUT_SYAIKH", sourceCell, message: `Baris ditandai Native tapi tidak memuat ${syaikh.full_name}.` }); continue;
    }
    for (const teacher of team) {
      const key = `${source.date}|${source.period}|${teacher.id}`;
      const other = teacherSlots.get(key);
      if (other && !(normalizeImportKey(other.subject) === normalizeImportKey(source.subject) && other.team === team.map((t) => t.id).join("|"))) {
        issues.push({ severity: "WARNING", code: "TEACHER_POSSIBLE_CONFLICT", sourceCell, message: `${teacher.full_name} mengajar ${other.className} dan ${klass.display_name} ${source.date} JP${source.period}.` });
      }
      if (!other) teacherSlots.set(key, { className: klass.display_name, subject: source.subject, team: team.map((t) => t.id).join("|") });
    }
    rows.push({ sourceCell, groupKey: `${source.date}|${source.period}|${klass.id}`,
      scheduleDate: source.date, classId: klass.id, className: klass.display_name, period: source.period,
      subject: source.subject, isCombined: false,
      teacherIds: team.map((t) => t.id), teacherNames: team.map((t) => t.full_name),
      specialNote: source.specialNote || null,
      reason: `Rotasi fleksibel ${syaikh.full_name}${source.reason ? ` • ${source.reason}` : ""}`,
      rotationStatus: isNative ? "NATIVE" : "NORMAL", weekLabel: "Dipilih per tanggal",
    });
  }
  return { rows, issues, inputCount: parsed.rows.length };
}
