import { isCombinedClassValue } from "./class";
import { normalizeImportKey } from "./scheduleImport";

export interface RoomUsageLike {
  mapel?: string;
  guru?: string;
  kelasgabung?: string;
}

/** Canonical room occupancy: same subject and same set of teachers implies
 * one combined teaching session, even when only one class has the combined
 * flag. Different teachers or different subjects remain a real collision.
 */
export function classifyRoomOccupancy(items: RoomUsageLike[]): { conflict: boolean; combined: boolean } {
  if (items.length < 2) return { conflict: false, combined: false };
  const firstSubject = normalizeImportKey(items[0].mapel);
  const sameSubject = Boolean(firstSubject) && items.every((item) => normalizeImportKey(item.mapel) === firstSubject);
  const allExplicitlyCombined = items.every((item) => isCombinedClassValue(item.kelasgabung));
  const teachers = (item: RoomUsageLike) => String(item.guru || "")
    .split(",").map(normalizeImportKey).filter(Boolean).sort().join("|");
  const firstTeachers = teachers(items[0]);
  const sameTeachers = Boolean(firstTeachers) && items.every((item) => teachers(item) === firstTeachers);
  const combined = sameSubject && (allExplicitlyCombined || sameTeachers);
  return { conflict: !combined, combined };
}
