import type { LogIzinItem, ScheduleItem, Teacher } from '../models';
import type { EffectiveScheduleItem } from './effectiveSchedule';
import { teachingSessionSignature } from './teachingSession';
import { checkIsITBA, isAlQuranOrTahsin, isITBACoreSubject } from '../teacher';

/** V3.17.3: read-only duty projection. Neither master nor incidental data is mutated. */
export type DutyTransfer = {
  teacherName: string;
  kind: 'BADAL' | 'INCIDENTAL';
  className: string;
  subject: string;
  period: number;
  date: string;
  start?: string;
  end?: string;
  detail?: string;
  sessionKey?: string;
};
export type DisplacedTeacherStatus = {
  kind: 'TRANSFERRED_ASSISTANT' | 'PRIMARY_CONFLICT' | 'MULTIPLE_HIGH_PRIORITY';
  destination: DutyTransfer;
  destinations: DutyTransfer[];
};

const key = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
const teachersOf = (row: ScheduleItem) => [row.guru1,row.guru2,row.guru3,row.guru4,row.guru5,row.guru6].filter(Boolean);
const hasTeacher = (row: ScheduleItem, name: string) => teachersOf(row).some((s) => key(s) === key(name));

function clockMinutes(value?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
  if (!m) return null;
  const mins = Number(m[1])*60+Number(m[2]);
  return Number(m[1]) < 24 && Number(m[2]) < 60 ? mins : null;
}
/** JP is a fallback; real dated time overrides take precedence when both intervals exist. */
export function dutyOverlaps(a: Pick<DutyTransfer,'period'|'start'|'end'>, b: Pick<DutyTransfer,'period'|'start'|'end'>): boolean {
  const as = clockMinutes(a.start), ae = clockMinutes(a.end);
  const bs = clockMinutes(b.start), be = clockMinutes(b.end);
  if (as !== null && ae !== null && bs !== null && be !== null && as < ae && bs < be) {
    return as < be && bs < ae;
  }
  return Number(a.period) === Number(b.period);
}

export function isAssistingOnNonQuran(row: ScheduleItem, teacherName: string, teacher?: Teacher): boolean {
  if (!hasTeacher(row, teacherName) || isAlQuranOrTahsin(row.mapel)) return false;
  const isFirst = key(row.guru1) === key(teacherName);
  if (teacher && checkIsITBA(teacher)) {
    const sub = key(row.mapel);
    const isArabic = sub.includes('arabic') || sub.includes('bahasa arab') || sub.includes('b. arab') || sub.includes('b.arab');
    return isArabic ? !isFirst : !isITBACoreSubject(row.mapel, teacherName);
  }
  return !isFirst && ['yes','ya','iya'].includes(key(row.selainguru1_mengawas));
}

export function collectPriorityDuties(args: {
  date: string;
  effective: EffectiveScheduleItem[];
  logs: LogIzinItem[];
}): DutyTransfer[] {
  const { date, effective, logs } = args;
  const duties: DutyTransfer[] = [];
  for (const log of logs) {
    if (log.tanggal !== date || !key(log.guru_pengganti)) continue;
    const currentSlot = effective.find(s => s.kelas && key(s.kelas) === key(log.kelas) && Number(s.jam_ke) === Number(log.jam_ke));
    // Do not revive coverage superseded by an explicit dated teacher-team replacement.
    if (currentSlot?.teacherTeamReplaced && !currentSlot.scheduledTeachers.some(n=>key(n) === key(log.guru_izin))) continue;
    duties.push({teacherName: log.guru_pengganti, kind:'BADAL', className:log.kelas, subject:log.mapel,
      date, period:Number(log.jam_ke), start:currentSlot?.mulai, end:currentSlot?.selesai,
      sessionKey: currentSlot ? teachingSessionSignature(currentSlot) : `unmatched:${key(log.kelas)}:${log.jam_ke}:${key(log.mapel)}`});
  }
  for (const row of effective) {
    if (!row.isActive || row.source === 'MASTER') continue;
    // A room-only incidental inherits a teacher team; it is NOT another teacher assignment.
    if (!row.teacherTeamReplaced && row.source !== 'INCIDENTAL_ADDITIONAL') continue;
    for (const teacherName of row.scheduledTeachers) {
      duties.push({teacherName, kind:'INCIDENTAL', className:row.kelas, subject:row.mapel,
        date, period:Number(row.jam_ke), start:row.mulai, end:row.selesai, detail:row.incidentalReason,
        sessionKey:teachingSessionSignature(row)});
    }
  }
  const unique = new Map<string,DutyTransfer>();
  for (const duty of duties) {
    // Combined-class slots with same subject/teacher are one duty for this guard.
    const signature = [key(duty.teacherName),duty.kind,duty.sessionKey].join('|');
    const prior = unique.get(signature);
    if (prior) prior.className += prior.className.toLowerCase().includes(duty.className.toLowerCase()) ? '' : `, ${duty.className}`;
    else unique.set(signature, {...duty});
  }
  return [...unique.values()];
}

export function resolveDisplacedTeacher(args: {
  original: EffectiveScheduleItem;
  teacherName: string;
  teacher?: Teacher;
  priorityDuties: DutyTransfer[];
}): DisplacedTeacherStatus | null {
  const { original, teacherName, teacher, priorityDuties } = args;
  if (!original.isActive || !hasTeacher(original,teacherName)) return null;
  const conflicts = priorityDuties.filter(d => {
    if (key(d.teacherName) !== key(teacherName)) return false;
    if (!dutyOverlaps({period:Number(original.jam_ke),start:original.mulai,end:original.selesai}, d)) return false;
    // Same physical teaching session, including legitimately combined classes, remains valid.
    if (key(d.className).split(',').map(s=>s.trim()).includes(key(original.kelas))
      && key(d.subject) === key(original.mapel)) return false;
    return true;
  });
  if (!conflicts.length) return null;
  const destinations = [...conflicts].sort((a,b)=>Number(a.kind==='INCIDENTAL')-Number(b.kind==='INCIDENTAL'));
  const kind = destinations.length > 1 ? 'MULTIPLE_HIGH_PRIORITY'
    : isAssistingOnNonQuran(original,teacherName,teacher) ? 'TRANSFERRED_ASSISTANT' : 'PRIMARY_CONFLICT';
  return {kind, destination:destinations[0], destinations};
}
