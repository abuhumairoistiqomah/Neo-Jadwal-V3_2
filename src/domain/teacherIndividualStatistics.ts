import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from './models';
import { buildEffectiveScheduleForDate } from './schedule/effectiveSchedule';

/** An unknown request type is deliberately NOT inferred from the number of JPs in a legacy log. */
export type LeaveScope = 'FULL_DAY' | 'PARTIAL' | 'UNKNOWN';
export type PatternMode = 'ALL' | LeaveScope;
export interface IndividualLeaveUnit {
  date: string;
  period: number;
  periodType: 'TEACHING' | 'FREE';
  reason: string;
  source: string;
  requestType?: LeaveScope;
}
export interface IndividualLeaveProfile {
  teacherId: string;
  teacherName: string;
  dateStart: string;
  dateEnd: string;
  units: IndividualLeaveUnit[];
}
export interface IndividualPeriodBucket {period: number; scheduled: number; absent: number;}
export interface IndividualDayBucket {
  weekday: number;
  scheduledJp: number;
  absentTeachingJp: number;
  byPeriod: IndividualPeriodBucket[];
}
export interface IndividualDateRow {
  date: string;
  scheduled: number;
  absent: number;
  scheduledPeriods: number[];
  absentPeriods: Array<{period: number; scope: LeaveScope}>;
  jpFreeAbsent: number;
  jp0Absent: boolean;
}
export type LeaveReasonCategory = 'SICK_KEYWORD' | 'OTHER' | 'UNSPECIFIED';
export interface IndividualLeaveReasonRecord {
  date: string;
  reason: string;
  category: LeaveReasonCategory;
  source: string;
  requestType: LeaveScope;
  teachingJp: number;
  homeroomJp: number;
  freeJp: number;
  totalJp: number;
}
export interface IndividualLeaveReasonSummary {
  reason: string;
  category: LeaveReasonCategory;
  dates: number;
  teachingJp: number;
  homeroomJp: number;
  freeJp: number;
  totalJp: number;
}
export interface IndividualTeacherStatistics {
  regularWeeklyJp: number;
  expectedTeachingJp: number;
  recordedTeachingLeaveJp: number;
  comparableTeachingLeaveJp: number;
  unmatchedHistoricalLeaveJp: number;
  freeLeaveJp: number;
  homeroomLeaveJp: number;
  totalLeaveJp: number;
  teachingLeavePct: number | null;
  // The operational denominator follows the school's nominal required presence
  // (Mon–Thu JP1–6, Fri JP1–3, plus JP0 if homeroom) excluding school-wide holidays.
  // It is an estimate, not a historical time-clock record.
  estimatedRequiredPresenceJp: number;
  comparableOperationalLeaveJp: number;
  operationalLeavePct: number | null;
  teachingByScope: Record<LeaveScope, number>;
  absentDatesByScope: Record<LeaveScope, number>;
  days: IndividualDayBucket[];
  daysByMode: Record<PatternMode, IndividualDayBucket[]>;
  // All recorded reasons, including school duties/family matters and unspecified legacy entries.
  // A single date with several absent periods appears once per reason/source/scope.
  leaveReasonRecords: IndividualLeaveReasonRecord[];
  leaveReasonSummary: IndividualLeaveReasonSummary[];
  sickRecords: Array<{date: string; reason: string; teachingJp: number; totalJp: number}>;
  chronological: IndividualDateRow[];
  reviewSlots: Array<{weekday: number; period: number; absent: number; scheduled: number; percent: number}>;
}

const teacherKey = (value: string) => String(value || '').trim().toLocaleLowerCase('id-ID');
const makeKey = (date: string, period: number) => `${date}|${period}`;
const weekdayFromISO = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // Mon = 1
};
const isoDateAdd = (iso: string, days: number) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
export const isSicknessReason = (reason: string): boolean =>
  /\b(sakit|demam|flu|berobat|dokter|rawat|hospital|medical|illness)\b/i.test(reason || '');
export const classifyLeaveReason = (reason: string): LeaveReasonCategory => {
  const value = String(reason || '').trim();
  if (!value || /^tanpa alasan$/i.test(value)) return 'UNSPECIFIED';
  return isSicknessReason(value) ? 'SICK_KEYWORD' : 'OTHER';
};
const scopeOf = (unit: IndividualLeaveUnit): LeaveScope =>
  unit.requestType === 'FULL_DAY' || unit.requestType === 'PARTIAL' ? unit.requestType : 'UNKNOWN';
const emptyDay = (weekday: number): IndividualDayBucket => ({
  weekday, scheduledJp: 0, absentTeachingJp: 0,
  byPeriod: Array.from({length: 6}, (_, p) => ({period: p + 1, scheduled: 0, absent: 0})),
});
const makeDays = () => Array.from({length: 5}, (_, i) => emptyDay(i + 1));
const blankScopes = (): Record<LeaveScope, number> => ({FULL_DAY: 0, PARTIAL: 0, UNKNOWN: 0});
const norm = (text: unknown) => String(text || '').trim().toLowerCase();

function isSchoolHoliday(date: string, period: number, academicEvents: KalenderAkademikItem[]): boolean {
  return academicEvents.some(ev => {
    if (ev.tanggal_mulai > date || ev.tanggal_selesai < date) return false;
    if (['nonaktif', 'inactive', 'cancelled'].includes(norm(ev.status))) return false;
    if (!['semua', 'all', 'seluruh'].includes(norm(ev.cakupan))) return false;
    if (!norm(ev.tipe).includes('libur')) return false;
    return (ev.jp_mulai == null || period >= Number(ev.jp_mulai)) &&
      (ev.jp_selesai == null || period <= Number(ev.jp_selesai));
  });
}

export function buildIndividualTeacherStatistics(input: {
  profile: IndividualLeaveProfile;
  teacherName: string;
  schedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  academicEvents?: KalenderAkademikItem[];
  hasHomeroomDuty?: boolean;
}): IndividualTeacherStatistics {
  const { profile, teacherName, schedules } = input;
  const start = profile.dateStart;
  const end = profile.dateEnd;
  const events = input.academicEvents || [];
  const masterSlots = new Set(schedules.filter(row =>
    Number(row.jam_ke) >= 1 && [row.guru1,row.guru2,row.guru3,row.guru4,row.guru5,row.guru6]
      .some(name => teacherKey(name) === teacherKey(teacherName))
  ).map(row => `${row.hari.toLocaleLowerCase('id-ID')}|${row.jam_ke}`));

  const expected = new Set<string>();
  const required = new Set<string>();
  const chronology = new Map<string, IndividualDateRow>();
  for (let date = start; date <= end; date = isoDateAdd(date, 1)) {
    const weekday = weekdayFromISO(date);
    if (weekday < 1 || weekday > 5) continue;
    const maxPeriod = weekday === 5 ? 3 : 6;
    for (let period = 1; period <= maxPeriod; period++) {
      if (!isSchoolHoliday(date, period, events)) required.add(makeKey(date, period));
    }
    if (input.hasHomeroomDuty && !isSchoolHoliday(date, 0, events)) required.add(makeKey(date, 0));
    const rows = buildEffectiveScheduleForDate({
      date, schedules, jadwalInsidental: input.incidentals || [], logs: input.logs || [], kalenderAkademik: events,
    });
    const daily = new Set<number>();
    rows.forEach(row => {
      const period = Number(row.jam_ke);
      if (period < 1 || period > 6 || !row.isActive) return;
      if (row.scheduledTeachers.some(name => teacherKey(name) === teacherKey(teacherName))) {
        expected.add(makeKey(date, period));
        daily.add(period);
      }
    });
    chronology.set(date, {
      date, scheduled: daily.size, absent: 0, scheduledPeriods: [...daily].sort((a,b)=>a-b),
      absentPeriods: [], jpFreeAbsent: 0, jp0Absent: false,
    });
  }

  // Deduplicate by date+JP (a combined class remains one JP, even if there are
  // multiple legacy coverage rows). Prioritize an approved teaching unit.
  const uniqueUnits = new Map<string, IndividualLeaveUnit>();
  profile.units.forEach(unit => {
    if (unit.date < start || unit.date > end) return;
    const key = makeKey(unit.date, unit.period);
    const old = uniqueUnits.get(key);
    if (!old || (old.periodType === 'FREE' && unit.periodType === 'TEACHING') ||
      (scopeOf(old) === 'UNKNOWN' && scopeOf(unit) !== 'UNKNOWN')) uniqueUnits.set(key, unit);
  });
  const units = [...uniqueUnits.values()];
  const teaching = units.filter(unit => unit.periodType === 'TEACHING' && unit.period >= 1);
  const comparable = teaching.filter(unit => expected.has(makeKey(unit.date, unit.period)));
  const free = units.filter(unit => unit.periodType === 'FREE');
  const homeroom = units.filter(unit => unit.periodType === 'TEACHING' && unit.period === 0);
  const eligibleOperational = units.filter(unit => required.has(makeKey(unit.date, unit.period)));
  const byMode: Record<PatternMode, IndividualDayBucket[]> = {
    ALL: makeDays(), FULL_DAY: makeDays(), PARTIAL: makeDays(), UNKNOWN: makeDays(),
  };
  expected.forEach(key => {
    const [date, periodText] = key.split('|'); const period = Number(periodText);
    const weekday = weekdayFromISO(date) - 1;
    if (weekday < 0 || weekday >= 5 || period < 1 || period > 6) return;
    (Object.keys(byMode) as PatternMode[]).forEach(mode => {
      byMode[mode][weekday].scheduledJp++;
      byMode[mode][weekday].byPeriod[period-1].scheduled++;
    });
  });
  const teachingByScope = blankScopes();
  const absentDates = {FULL_DAY: new Set<string>(), PARTIAL: new Set<string>(), UNKNOWN: new Set<string>()};
  teaching.forEach(unit => {
    const scope = scopeOf(unit);
    teachingByScope[scope]++;
    absentDates[scope].add(unit.date);
  });
  comparable.forEach(unit => {
    const scope = scopeOf(unit);
    const weekday = weekdayFromISO(unit.date) - 1;
    if (weekday < 0 || weekday >= 5 || unit.period < 1 || unit.period > 6) return;
    for (const mode of ['ALL',scope] as PatternMode[]) {
      byMode[mode][weekday].absentTeachingJp++;
      byMode[mode][weekday].byPeriod[unit.period-1].absent++;
    }
    const row = chronology.get(unit.date);
    if (row) {
      row.absent++;
      row.absentPeriods.push({period: unit.period, scope});
    }
  });
  free.forEach(unit => { const row = chronology.get(unit.date); if (row) row.jpFreeAbsent++; });
  homeroom.forEach(unit => { const row = chronology.get(unit.date); if (row) row.jp0Absent = true; });

  // Preserve all reasons exactly as recorded. Classification is a *search aid*,
  // not a verdict on why someone was absent (including documented school duties).
  const reasonsByDate = new Map<string, IndividualLeaveReasonRecord>();
  units.forEach(unit => {
    const reason = String(unit.reason || '').trim() || 'Tanpa alasan';
    const source = String(unit.source || '').trim() || 'UNKNOWN';
    const requestType = scopeOf(unit);
    const key = `${unit.date}|${reason.toLocaleLowerCase('id-ID')}|${source}|${requestType}`;
    const found = reasonsByDate.get(key) || {
      date:unit.date, reason, category:classifyLeaveReason(reason), source, requestType,
      teachingJp:0, homeroomJp:0, freeJp:0, totalJp:0,
    };
    found.totalJp++;
    if (unit.periodType === 'FREE') found.freeJp++;
    else if (unit.period === 0) found.homeroomJp++;
    else found.teachingJp++;
    reasonsByDate.set(key, found);
  });
  const leaveReasonRecords = [...reasonsByDate.values()].sort((a,b) =>
    b.date.localeCompare(a.date) || a.reason.localeCompare(b.reason,'id-ID'));
  const reasonsByText = new Map<string, IndividualLeaveReasonSummary & {dateSet: Set<string>}>();
  leaveReasonRecords.forEach(record => {
    const key = record.reason.replace(/\s+/g,' ').trim().toLocaleLowerCase('id-ID');
    const found = reasonsByText.get(key) || {
      reason: record.reason.replace(/\s+/g,' ').trim(), category: record.category, dates: 0,
      teachingJp:0, homeroomJp:0, freeJp:0, totalJp:0, dateSet:new Set<string>(),
    };
    found.dateSet.add(record.date);
    found.dates = found.dateSet.size;
    found.teachingJp += record.teachingJp;
    found.homeroomJp += record.homeroomJp;
    found.freeJp += record.freeJp;
    found.totalJp += record.totalJp;
    reasonsByText.set(key,found);
  });
  const leaveReasonSummary: IndividualLeaveReasonSummary[] = [...reasonsByText.values()]
    .map(({dateSet: _dates, ...summary}) => summary)
    .sort((a,b) => b.dates-a.dates || b.totalJp-a.totalJp || a.reason.localeCompare(b.reason,'id-ID'));
  const sick = new Map<string, {date:string; reason:string; teachingJp:number; totalJp:number}>();
  units.filter(unit => isSicknessReason(unit.reason)).forEach(unit => {
    const reason = String(unit.reason || 'Sakit').trim();
    const key = `${unit.date}|${reason}`;
    const found = sick.get(key) || {date:unit.date,reason,teachingJp:0,totalJp:0};
    found.totalJp++;
    if (unit.periodType === 'TEACHING' && unit.period > 0) found.teachingJp++;
    sick.set(key,found);
  });
  const expectedTeachingJp = expected.size;
  const slots = byMode.ALL.flatMap(day => day.byPeriod
    .filter(cell => cell.scheduled >= 5 && cell.absent >= 2)
    .map(cell => ({weekday: day.weekday, period: cell.period, absent: cell.absent,
      scheduled: cell.scheduled, percent: Math.round(cell.absent/cell.scheduled*1000)/10})));
  slots.sort((a,b) => b.percent-a.percent || b.absent-a.absent);
  const requiredJp = required.size;
  return {
    regularWeeklyJp: masterSlots.size, expectedTeachingJp,
    recordedTeachingLeaveJp: teaching.length, comparableTeachingLeaveJp: comparable.length,
    unmatchedHistoricalLeaveJp: teaching.length-comparable.length,
    freeLeaveJp: free.length, homeroomLeaveJp: homeroom.length, totalLeaveJp: units.length,
    teachingLeavePct: expectedTeachingJp ? Math.round(comparable.length/expectedTeachingJp*1000)/10 : null,
    estimatedRequiredPresenceJp: requiredJp, comparableOperationalLeaveJp: eligibleOperational.length,
    operationalLeavePct: requiredJp ? Math.round(eligibleOperational.length/requiredJp*1000)/10 : null,
    teachingByScope, absentDatesByScope: {
      FULL_DAY: absentDates.FULL_DAY.size, PARTIAL: absentDates.PARTIAL.size, UNKNOWN: absentDates.UNKNOWN.size,
    },
    days: byMode.ALL, daysByMode: byMode,
    leaveReasonRecords, leaveReasonSummary,
    sickRecords:[...sick.values()].sort((a,b)=>b.date.localeCompare(a.date)),
    chronological:[...chronology.values()].filter(row=>row.scheduled>0 || row.absent>0 || row.jpFreeAbsent>0 || row.jp0Absent).sort((a,b)=>a.date.localeCompare(b.date)),
    reviewSlots: slots,
  };
}
