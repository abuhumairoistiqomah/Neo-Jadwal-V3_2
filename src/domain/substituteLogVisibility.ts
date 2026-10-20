import type { LogIzinItem } from '../types';
import { getSchoolTodayISO, normalizeDateString } from './date';

/**
 * Presentation-only filter. In particular, do not alter the source collection:
 * edit, soft delete, analytics and broadcast history must remain available.
 * Unknown/invalid dates remain visible rather than silently disappearing.
 */
export function partitionSubstituteHistory<T extends Pick<LogIzinItem, 'tanggal'>>(
  records: readonly T[],
  schoolToday: string = getSchoolTodayISO(),
): {past: T[]; currentAndUpcoming: T[]} {
  const today = normalizeDateString(schoolToday);
  const past: T[] = [];
  const currentAndUpcoming: T[] = [];
  for (const record of records) {
    const date = normalizeDateString(record.tanggal);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (validDate && date < today) past.push(record);
    else currentAndUpcoming.push(record);
  }
  return {past, currentAndUpcoming};
}
