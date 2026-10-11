/**
 * Calendar targets are *atomic* classes. Legacy `classes` also contains joined
 * labels for teaching sessions (`01 MQ AKHWAT & 02 MQ AKHWAT`). Those labels
 * must not become additional selectable classes in the Calendar editor.
 *
 * Keep the saved class IDs canonical: an academic event for an atomic class is
 * already recognized on joined schedule rows through isClassMatch.
 */
export interface CalendarClassIdentity {
  id: string;
  display_name: string;
  code?: string;
}

const normalize = (value: string) => String(value || "")
  .replace(/^kelas\s+/i, "")
  .trim().replace(/\s+/g, " ").toLocaleUpperCase("id-ID");

/** Only split on explicit join characters, not on punctuation within a class name. */
export function splitClassMembers(label: string): string[] {
  return String(label || "").split(/\s*[&+]\s*/g).map((part) => part.trim()).filter(Boolean);
}

export function atomicClassChoices<T extends CalendarClassIdentity>(rows: T[]): T[] {
  const unique = new Set<string>();
  return rows.filter((row) => {
    if (splitClassMembers(row.display_name).length !== 1) return false;
    const key = normalize(row.display_name);
    if (!key || unique.has(key)) return false;
    unique.add(key);
    return true;
  });
}

/**
 * Upgrade old calendar groups that targeted joined (legacy) class IDs. Never
 * invent an ID for an unmatched member: preserve its legacy target separately.
 */
export function expandCalendarClassIds<T extends CalendarClassIdentity>(
  selectedIds: string[], allClasses: T[],
): { classIds: string[]; unresolvedLegacyIds: string[] } {
  const atomic = atomicClassChoices(allClasses);
  const atomicByLabel = new Map(atomic.map((row) => [normalize(row.display_name), row.id]));
  const byId = new Map(allClasses.map((row) => [row.id, row]));
  const classIds = new Set<string>();
  const unresolvedLegacyIds = new Set<string>();

  for (const selectedId of selectedIds) {
    const row = byId.get(selectedId);
    if (!row) {
      unresolvedLegacyIds.add(selectedId);
      continue;
    }
    const parts = splitClassMembers(row.display_name);
    const targetIds = parts.map((part) => atomicByLabel.get(normalize(part)));
    if (parts.length > 0 && targetIds.every((id) => Boolean(id))) {
      targetIds.forEach((id) => classIds.add(id!));
    } else {
      unresolvedLegacyIds.add(selectedId);
    }
  }
  return { classIds: [...classIds], unresolvedLegacyIds: [...unresolvedLegacyIds] };
}
