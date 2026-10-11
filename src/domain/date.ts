/** Date/day helpers shared by all schedule consumers. */

export function normalizeDay(day: string): "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat" | string {
  if (!day) return "";
  const d = day.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (d === "senin" || d === "monday") return "Senin";
  if (d === "selasa" || d === "tuesday") return "Selasa";
  if (d === "rabu" || d === "wednesday") return "Rabu";
  if (d === "kamis" || d === "thursday") return "Kamis";
  if (d === "jumat" || d === "jum'at" || d === "friday") return "Jumat";
  return day.trim();
}

export function isSameDay(dayA: string, dayB: string): boolean {
  return normalizeDay(dayA) === normalizeDay(dayB);
}


export function getSchoolWeekDateStrings(selectedDateStr: string): { dateStr: string; dayName: string }[] {
  if (!selectedDateStr) return [];
  const parts = selectedDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return [];
  const [year, month, day] = parts;
  const dateObj = new Date(year, month - 1, day);
  if (isNaN(dateObj.getTime())) return [];

  const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(year, month - 1, day + distToMonday);
  const dayNames = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];

  const result: { dateStr: string; dayName: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    result.push({
      dateStr: `${yyyy}-${mm}-${dd}`,
      dayName: dayNames[i],
    });
  }
  return result;
}


/**
 * Normalizes date string into YYYY-MM-DD format
 */
export function normalizeDateString(dateVal: any): string {
  if (!dateVal) return "";
  if (dateVal instanceof Date) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, "0");
    const day = String(dateVal.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const str = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  const parts = str.split(/[-\/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    } else if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }
  }
  return str;
}

/**
 * Checks if target date falls within startDate and endDate inclusive
 */
export function isDateInRange(targetDate: string, startDate: string, endDate: string): boolean {
  const normTarget = normalizeDateString(targetDate);
  const normStart = normalizeDateString(startDate);
  const normEnd = normalizeDateString(endDate || startDate);

  if (!normTarget || !normStart) return false;
  return normTarget >= normStart && normTarget <= normEnd;
}


/**
 * Current school date in Asia/Jakarta. Using an explicit timezone keeps public
 * task-recovery queues stable even when an operator opens E-Jadwal abroad.
 */
export function getSchoolTodayISO(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : normalizeDateString(now);
}

/**
 * A missing-task recovery item is actionable only on the school date itself or
 * in the future. Historical coverage stays in the database for audit/statistics
 * but is removed from the teacher's actionable queue.
 */
export function isTaskRecoveryDateActive(value: string, today: string = getSchoolTodayISO()): boolean {
  const target = normalizeDateString(value);
  const schoolToday = normalizeDateString(today);
  if (!target || !schoolToday) return false;
  return target >= schoolToday;
}
