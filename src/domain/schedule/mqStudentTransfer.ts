import type { EffectiveScheduleItem } from './effectiveSchedule';
import type { LogIzinItem } from '../models';

export interface MqTransferRecord {
  id: string;
  coverage_slot_id: string;
  schedule_date: string;
  period: number;
  receiving_class_name: string;
  source_class_name: string;
  receiving_teacher_name: string;
}

export type MqRegularGroup = {
  jam_ke: number;
  mapel: string;
  mulai: string;
  selesai: string;
  items: EffectiveScheduleItem[];
};

export type MqBadalGroup = {
  jam_ke: number;
  mapel: string;
  kelas: string;
  mulai: string;
  selesai: string;
  coverageIds: string[];
};

const key = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
const isMq = (className: string) => /\bMQ\b/i.test(className);

/** The SAME clock/subject and a concrete receiver class are essential.
 * Sharing a teacher/JP or merely having the word Al-Qur'an is insufficient. */
export function eligibleMqReceivingClasses(badal: MqBadalGroup, regular: MqRegularGroup[], receivingTeacher?: string): string[] {
  if (!isMq(badal.kelas) || !key(badal.mapel)) return [];
  return [...new Set(regular.flatMap(group => {
    if (Number(group.jam_ke) !== Number(badal.jam_ke) || key(group.mapel) !== key(badal.mapel)) return [];
    if (badal.mulai && group.mulai && badal.mulai !== group.mulai) return [];
    if (badal.selesai && group.selesai && badal.selesai !== group.selesai) return [];
    return group.items.filter(item => item.isActive && isMq(item.kelas) &&
      (!receivingTeacher || item.effectiveTeachers.some(name => key(name) === key(receivingTeacher))) &&
      key(item.kelas) !== key(badal.kelas)).map(item => item.kelas);
  }))];
}

/** A confirmed delegation applies ONLY to its original dated JP.
 * The same receiving MQ class can have lessons in several other periods;
 * sharing the class name must never extend the transfer to those lessons.
 */
export function mqTransfersForRegularGroup(
  transfers: MqTransferRecord[],
  regular: { jam_ke: number; items: ReadonlyArray<Pick<EffectiveScheduleItem, 'kelas'>> }
): MqTransferRecord[] {
  return transfers.filter(record =>
    Number(record.period) === Number(regular.jam_ke) &&
    regular.items.some(row => key(row.kelas) === key(record.receiving_class_name))
  );
}

/** Ignore an acknowledgement if the original assigned coverage is gone or
 * its recipient/subject/date/period has changed. Stale records cannot hide a
 * genuine double-booking. */
export function activeMqTransferMatches(args: {
  records: MqTransferRecord[];
  logs: LogIzinItem[];
  teacherName: string;
  date: string;
  regular: MqRegularGroup[];
  badalGroups: MqBadalGroup[];
}): MqTransferRecord[] {
  return args.records.filter(record => {
    if (record.schedule_date !== args.date || key(record.receiving_teacher_name) !== key(args.teacherName)) return false;
    const coverage = args.logs.find(log => log.id === record.coverage_slot_id && log.tanggal === args.date &&
      Number(log.jam_ke) === Number(record.period) && key(log.guru_pengganti) === key(args.teacherName) &&
      key(log.kelas) === key(record.source_class_name));
    if (!coverage || !isMq(coverage.kelas)) return false;
    const matchingBadal = args.badalGroups.find(group =>
      group.coverageIds.includes(coverage.id) && Number(group.jam_ke) === Number(record.period) &&
      key(group.mapel) === key(coverage.mapel));
    if (!matchingBadal) return false;
    return eligibleMqReceivingClasses(matchingBadal, args.regular, args.teacherName)
      .some(name => key(name) === key(record.receiving_class_name));
  });
}
