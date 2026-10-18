/** Limit the existing Input Inval smart picker to real unmet official-duty coverage. */
export interface OfficialDutyScopeSlot { period: number; className: string }
export interface OfficialDutyInvalRow {
  jam_ke: number;
  kelas: string;
  recommendationClassLabel?: string;
  isCombinedGroup?: boolean;
  targetSlots: Array<{ kelas: string; mapel: string }>;
}

function norm(value: string): string { return value.trim().toLocaleLowerCase("id-ID"); }
export function officialDutyKey(period: number, className: string): string {
  return `${period}|${norm(className)}`;
}
export function scopeInvalRowsToOfficialDuty<T extends OfficialDutyInvalRow>(
  rows: T[], allowed: ReadonlyArray<OfficialDutyScopeSlot>,
): T[] {
  const keys = new Set(allowed.map((slot) => officialDutyKey(slot.period, slot.className)));
  return rows.flatMap((row) => {
    const slots = row.targetSlots.filter((target) => keys.has(officialDutyKey(row.jam_ke, target.kelas)));
    if (!slots.length) return [];
    return [{ ...row, targetSlots: slots,
      kelas: slots.map((slot) => slot.kelas).join(" & "),
      recommendationClassLabel: slots[0].kelas,
      isCombinedGroup: slots.length > 1,
    } as T];
  });
}
export function coversExactlyOfficialDutySlots(
  rows: ReadonlyArray<OfficialDutyInvalRow>, allowed: ReadonlyArray<OfficialDutyScopeSlot>,
): boolean {
  if (!allowed.length) return false;
  const expected = new Set(allowed.map((slot) => officialDutyKey(slot.period, slot.className)));
  if (expected.size !== allowed.length) return false;
  const found = new Set<string>();
  for (const row of rows) for (const slot of row.targetSlots) {
    const key = officialDutyKey(row.jam_ke, slot.kelas);
    if (!expected.has(key) || found.has(key)) return false;
    found.add(key);
  }
  return found.size === expected.size;
}
