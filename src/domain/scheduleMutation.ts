import { normalizeImportKey } from "./scheduleImport";

export type ScheduleMutationMode = "PERMANENT" | "INCIDENTAL";

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function dayNameFromISODate(value: string): string {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return "";
  return DAY_NAMES[date.getDay()] || "";
}

export function dateMatchesScheduleDay(dateValue: string, scheduleDay: string): boolean {
  return normalizeImportKey(dayNameFromISODate(dateValue)) === normalizeImportKey(scheduleDay);
}

export function nextOccurrenceISO(scheduleDay: string, from = new Date()): string {
  const target = DAY_NAMES.findIndex((name) => normalizeImportKey(name) === normalizeImportKey(scheduleDay));
  if (target < 0) return "";
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const diff = (target - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function scheduleMutationModeLabel(mode: ScheduleMutationMode): string {
  return mode === "INCIDENTAL" ? "Hanya tanggal ini" : "Ubah jadwal tetap";
}
