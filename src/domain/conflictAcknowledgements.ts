import type { ScheduleConflict } from "./scheduleConflicts";

/**
 * Per-browser view preferences, NOT a mutation to Supabase conflict history.
 * A hidden conflict comes back when its meaning changes; genuine fixed conflicts
 * disappear when no longer reported by detectScheduleConflicts.
 */
export const CONFLICT_HIDE_STORAGE_KEY = "ejadwal_conflict_hidden_v3_14_6";
export type HiddenConflictRecords = Record<string, string>;

export function conflictFingerprint(conflict: ScheduleConflict): string {
  return JSON.stringify([
    conflict.id, conflict.kind, conflict.severity, conflict.dayOrDate,
    conflict.period, conflict.title, conflict.detail, conflict.room || "",
    [...conflict.classes].sort(), [...conflict.teachers].sort(),
  ]);
}

export function isConflictHidden(conflict: ScheduleConflict, hidden: HiddenConflictRecords): boolean {
  return hidden[conflict.id] === conflictFingerprint(conflict);
}

export function updateHiddenConflict(
  hidden: HiddenConflictRecords, conflict: ScheduleConflict, hide: boolean,
): HiddenConflictRecords {
  const updated = { ...hidden };
  if (hide) updated[conflict.id] = conflictFingerprint(conflict);
  else delete updated[conflict.id];
  return updated;
}

export function readHiddenConflicts(): HiddenConflictRecords {
  try {
    if (typeof window === "undefined") return {};
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CONFLICT_HIDE_STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

export function writeHiddenConflicts(hidden: HiddenConflictRecords): void {
  try { if (typeof window !== "undefined") window.localStorage.setItem(CONFLICT_HIDE_STORAGE_KEY, JSON.stringify(hidden)); }
  catch { /* Private browsers/storage permissions must not break schedules. */ }
}
