import type { KalenderAkademikItem } from "./models";
import { isClassMatch } from "./class";
import { isDateInRange } from "./date";

/**
 * Checks if academic calendar event is active
 */
export function isAcademicCalendarActive(event: KalenderAkademikItem | undefined | null): boolean {
  if (!event) return false;
  const status = (event.status || "Aktif").trim().toLowerCase();
  return status !== "nonaktif" && status !== "tidak aktif" && status !== "inaktif";
}

/**
 * Checks if target class is covered by event scope
 * Rules:
 * - cakupan = "Semua" -> applies to all classes
 * - cakupan = "Kelas" -> applies ONLY if className matches event.kelas
 * - Do NOT treat empty cakupan as "Semua"
 * - If cakupan is empty but event.kelas is provided, safely fallback as "Kelas"
 * - If cakupan is empty and event.kelas is empty, return false
 */
export function isClassCoveredByEvent(event: KalenderAkademikItem, className?: string): boolean {
  if (!event) return false;
  const cakupan = (event.cakupan || "").trim().toLowerCase();
  const eventKelas = (event.kelas || "").trim();

  // 1. Cakupan Semua
  if (cakupan === "semua") {
    return true;
  }

  // 2. Cakupan Kelas atau Fallback jika cakupan kosong tetapi kolom kelas terisi
  if (cakupan === "kelas" || (!cakupan && eventKelas)) {
    if (!className) return false; // Event spesifik kelas tidak berlaku global tanpa target kelas
    if (!eventKelas) return false;
    return isClassMatch(eventKelas, className);
  }

  // 3. Cakupan Jenjang / Tingkat
  if (cakupan.includes("jenjang") || cakupan.includes("tingkat")) {
    if (!className) return false;
    if (eventKelas && isClassMatch(eventKelas, className)) return true;
    const lowerClass = className.toLowerCase();
    const eventScope = (cakupan + " " + eventKelas).toLowerCase();
    if (eventScope.includes("sd") && (lowerClass.includes("sd") || /^(0?1|0?2|0?3|0?4|0?5|0?6)\b/.test(lowerClass))) return true;
    if (eventScope.includes("smp") && (lowerClass.includes("smp") || /^(0?7|0?8|0?9)\b/.test(lowerClass))) return true;
    if (eventScope.includes("sma") && (lowerClass.includes("sma") || /^(10|11|12)\b/.test(lowerClass))) return true;
    return false;
  }

  // 4. Jika cakupan kosong dan kolom kelas kosong -> jangan anggap semua (return false)
  if (!cakupan && !eventKelas) {
    return false;
  }

  // 5. Fallback jika eventKelas terisi tapi cakupan lainnya
  if (eventKelas && className) {
    return isClassMatch(eventKelas, className);
  }

  return false;
}

/**
 * Checks if event covers entire day (both jp_mulai and jp_selesai empty/null)
 */
export function isWholeDayAcademicEvent(event: KalenderAkademikItem): boolean {
  const hasStart = event.jp_mulai !== undefined && event.jp_mulai !== null && !isNaN(Number(event.jp_mulai));
  const hasEnd = event.jp_selesai !== undefined && event.jp_selesai !== null && !isNaN(Number(event.jp_selesai));
  return !hasStart && !hasEnd;
}

/**
 * Checks if a specific jam_ke is covered by the event
 * Rules:
 * - jp_mulai kosong + jp_selesai kosong -> event berlaku sepanjang hari (semua JP)
 * - jp_mulai dan jp_selesai terisi -> event HANYA berlaku pada rentang JP tersebut (inclusive: jamKe >= jpMulai && jamKe <= jpSelesai)
 * - JP 0 adalah nilai valid. Jangan gunakan if (!jpMulai)
 * - Jika jamKe tidak disertakan dan event merupakan partial JP, return false (bukan event seluruh hari)
 * - Jika hanya salah satu yang terisi, return false (data tidak valid)
 */
export function isJpCoveredByEvent(event: KalenderAkademikItem, jamKe?: number): boolean {
  const hasStart = event.jp_mulai !== undefined && event.jp_mulai !== null && !isNaN(Number(event.jp_mulai));
  const hasEnd = event.jp_selesai !== undefined && event.jp_selesai !== null && !isNaN(Number(event.jp_selesai));

  // Keduanya kosong = seluruh hari terdampak (semua JP)
  if (!hasStart && !hasEnd) {
    return true;
  }

  // Jika hanya salah satu yang terisi, data tidak valid
  if (hasStart !== hasEnd) {
    return false;
  }

  // Jika jamKe tidak ditentukan, cek apakah event ini event partial (bukan full day)
  if (jamKe === undefined || jamKe === null) {
    return false;
  }

  const start = Number(event.jp_mulai);
  const end = Number(event.jp_selesai);
  const target = Number(jamKe);

  return target >= start && target <= end;
}

/**
 * Returns matching academic calendar event for a specific date, class, and JP
 */
export function getAcademicCalendarEvent(
  dateStr: string,
  className?: string,
  jamKe?: number,
  kalenderAkademik: KalenderAkademikItem[] = []
): KalenderAkademikItem | null {
  if (!dateStr || !kalenderAkademik || kalenderAkademik.length === 0) return null;

  for (const item of kalenderAkademik) {
    if (!isAcademicCalendarActive(item)) continue;
    if (!isDateInRange(dateStr, item.tanggal_mulai, item.tanggal_selesai)) continue;
    if (!isClassCoveredByEvent(item, className)) continue;
    if (!isJpCoveredByEvent(item, jamKe)) continue;

    return item;
  }

  return null;
}

/**
 * Returns all active academic calendar events matching a specific date and class
 */
export function getAcademicCalendarEventsForDate(
  dateStr: string,
  className?: string,
  kalenderAkademik: KalenderAkademikItem[] = []
): KalenderAkademikItem[] {
  if (!dateStr || !kalenderAkademik || kalenderAkademik.length === 0) return [];

  return kalenderAkademik.filter(item => {
    if (!isAcademicCalendarActive(item)) return false;
    if (!isDateInRange(dateStr, item.tanggal_mulai, item.tanggal_selesai)) return false;
    if (!isClassCoveredByEvent(item, className)) return false;
    return true;
  });
}



