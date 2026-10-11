/** Canonical recurring/incident schedule-class relationship semantics. */
export type ScheduleClassMode = "NORMAL" | "COMBINED" | "ALTERNATING";

export function parseScheduleClassMode(value: unknown): ScheduleClassMode {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("id-ID");
  if (["iya", "ya", "yes", "true", "1", "combined", "gabung", "kelas gabung"].includes(normalized)) {
    return "COMBINED";
  }
  if (["bergantian", "alternating", "alternate", "gantian", "kelas bergantian"].includes(normalized)) {
    return "ALTERNATING";
  }
  return "NORMAL";
}

export function optionalScheduleClassMode(value: unknown): ScheduleClassMode | null {
  const normalized = String(value ?? "").trim();
  return normalized ? parseScheduleClassMode(normalized) : null;
}

export function scheduleClassModeToLegacy(mode: ScheduleClassMode | null | undefined): string {
  if (mode === "COMBINED") return "Ya";
  if (mode === "ALTERNATING") return "Bergantian";
  return "Tidak";
}
