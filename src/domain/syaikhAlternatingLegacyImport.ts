import {
  normalizeImportClassKey,
  normalizeImportKey,
  type ImportIssue,
} from "./scheduleImport";

/** The familiar date/class/period/subject/teacher1-6/special/reason/type/room TSV. */
export const LEGACY_ROTATION_HEADER = [
  "Tanggal", "kelas", "jamke", "mata pelajaran", "guru1", "guru2", "guru3",
  "guru4", "guru5", "guru6", "keterangan khusus", "Alasan", "Tipe_Insidental", "ruangan",
].join("\t");

export type LegacyRotationTemplateRow = {
  rowNumber: number;
  date: string;
  isoDay: number;
  className: string;
  period: number;
  subject: string;
  teacherTokens: string[];
  specialNote: string;
  reason: string;
  incidentalType: string;
  room: string;
};

function parseISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null;
}
function isoDayOf(date: Date): number { return date.getUTCDay() || 7; }
function key(row: LegacyRotationTemplateRow): string {
  return `${normalizeImportClassKey(row.className)}|${row.isoDay}|${row.period}`;
}

export function parseLegacyRotationTemplate(tsv: string, label: "A" | "B"):
  { rows: LegacyRotationTemplateRow[]; issues: ImportIssue[] } {
  const rows: LegacyRotationTemplateRow[] = [];
  const issues: ImportIssue[] = [];
  const lines = tsv.replace(/\r\n?/g, "\n").split("\n");
  const nonblank = lines.findIndex((line) => line.trim());
  if (nonblank < 0) {
    return { rows, issues: [{ severity: "ERROR", code: "TEMPLATE_EMPTY", message: `Skenario ${label} masih kosong.` }] };
  }
  const header = lines[nonblank].split("\t").map(normalizeImportKey);
  const required = ["tanggal", "kelas", "jamke", "mata pelajaran", "guru1"];
  if (!required.every((name, col) => header[col] === name)) {
    return { rows, issues: [{ severity: "ERROR", code: "LEGACY_HEADER", message: `Skenario ${label}: header harus diawali Tanggal, kelas, jamke, mata pelajaran, guru1, dipisah TAB.` }] };
  }
  const seen = new Set<string>();
  for (let i = nonblank + 1; i < lines.length; i += 1) {
    if (!lines[i].trim()) continue;
    const cells = lines[i].split("\t").map((v) => v.trim());
    const sourceCell = `${label}:baris ${i + 1}`;
    const date = parseISO(cells[0] || "");
    const period = Number(cells[2]);
    if (!date || !cells[1] || !Number.isInteger(period) || period < 1 || period > 6 || !cells[3]) {
      issues.push({ severity: "ERROR", code: "LEGACY_ROW_INVALID", sourceCell,
        message: "Tanggal YYYY-MM-DD, kelas, JP 1–6, dan mata pelajaran wajib valid." });
      continue;
    }
    const teacherTokens = cells.slice(4, 10).filter(Boolean);
    if (!teacherTokens.length || teacherTokens.length > 6) {
      issues.push({ severity: "ERROR", code: "TEACHERS_REQUIRED", sourceCell, message: "Minimal guru1 diperlukan, maksimum enam guru." });
      continue;
    }
    const row: LegacyRotationTemplateRow = {
      rowNumber: i + 1, date: cells[0], isoDay: isoDayOf(date), className: cells[1], period,
      subject: cells[3], teacherTokens, specialNote: cells[10] || "", reason: cells[11] || "",
      incidentalType: cells[12] || "", room: cells[13] || "",
    };
    const slotKey = key(row);
    if (seen.has(slotKey)) {
      issues.push({ severity: "ERROR", code: "DUPLICATE_TEMPLATE_SLOT", sourceCell,
        message: `Skenario ${label}: kelas/hari/JP ${row.className} JP${period} muncul lebih dari sekali.` });
      continue;
    }
    seen.add(slotKey);
    rows.push(row);
  }
  if (!rows.length && !issues.length) issues.push({ severity: "ERROR", code: "NO_TEMPLATE_ROWS", message: `Skenario ${label}: tidak ada baris.` });
  return { rows, issues };
}

