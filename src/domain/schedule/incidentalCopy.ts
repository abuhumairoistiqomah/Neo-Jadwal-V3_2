import type { JadwalInsidentalItem, ScheduleItem, LogIzinItem } from "../models";
import { isClassMatch } from "../class";
import { dayNameFromISODate } from "../scheduleMutation";

type CopyTargetStatus = "READY_EXISTING_MASTER" | "READY_EMPTY_SLOT" | "WILL_REPLACE_INCIDENTAL" | "BLOCKED_EXISTS" | "BLOCKED_NO_TEACHER" | "BLOCKED_SOURCE" | "BLOCKED_BADAL";
export interface IncidentalCopyPreviewRow {
  className: string;
  period: number;
  subject: string;
  status: CopyTargetStatus;
  explanation: string;
}

/** Advisory only. PostgreSQL repeats every check under a transaction lock. */
export function previewIncidentalCopy(input: {
  date: string;
  sourceClass: string;
  periods: number[];
  targetClasses: string[];
  incidentals: JadwalInsidentalItem[];
  schedules: ScheduleItem[];
  logs?: LogIzinItem[];
  overwriteExisting: boolean;
  copyTeamToEmpty?: boolean; // deprecated RC1.5 compatibility
  copySourceTeam?: boolean;
}): IncidentalCopyPreviewRow[] {
  const day = dayNameFromISODate(input.date);
  const copySourceTeam = input.copySourceTeam ?? input.copyTeamToEmpty ?? false;
  const rows: IncidentalCopyPreviewRow[] = [];
  for (const className of input.targetClasses) {
    for (const period of input.periods) {
      const source = input.incidentals.find(row => row.tanggal === input.date
        && isClassMatch(row.kelas, input.sourceClass) && Number(row.jam_ke) === period);
      const dest = input.incidentals.find(row => row.tanggal === input.date
        && isClassMatch(row.kelas, className) && Number(row.jam_ke) === period);
      const hasMaster = input.schedules.some(row => row.hari === day
        && isClassMatch(row.kelas, className) && Number(row.jam_ke) === period);
      const sourceMaster = input.schedules.find(row => row.hari === day
        && isClassMatch(row.kelas, input.sourceClass) && Number(row.jam_ke) === period);
      const sourceTeacherRows = source?.replaceTeachers
        ? [source.guru1, source.guru2, source.guru3, source.guru4, source.guru5, source.guru6]
        : [sourceMaster?.guru1, sourceMaster?.guru2, sourceMaster?.guru3,
          sourceMaster?.guru4, sourceMaster?.guru5, sourceMaster?.guru6];
      // Legacy inputs without replaceTeachers may still have an explicit team.
      const hasSourceTeacher = sourceTeacherRows.some(Boolean)
        || Boolean(source && [source.guru1, source.guru2, source.guru3,
          source.guru4, source.guru5, source.guru6].some(Boolean));
      const hasBadal = (input.logs || []).some(log => log.tanggal === input.date
        && Number(log.jam_ke) === period && isClassMatch(log.kelas, className)
        && log.coverage_status !== "CANCELLED");
      let status: CopyTargetStatus;
      let explanation: string;
      if (!source || !source.mapel?.trim()) {
        status = "BLOCKED_SOURCE"; explanation = "Mapel insidental sumber tidak ditemukan";
      } else if (hasBadal) {
        status = "BLOCKED_BADAL"; explanation = "Ada izin/badal pada slot tujuan; jangan ubah mapel lewat salin jadwal";
      } else if (copySourceTeam && !hasSourceTeacher) {
        status = "BLOCKED_NO_TEACHER";
        explanation = "Tim guru sumber tidak ditemukan — tentukan guru pada jadwal sumber sebelum menyalin";
      } else if (dest) {
        status = input.overwriteExisting ? "WILL_REPLACE_INCIDENTAL" : "BLOCKED_EXISTS";
        explanation = input.overwriteExisting
          ? (copySourceTeam ? "Mapel dan tim guru sumber akan menggantikan insidental tujuan; ruangan tetap" : "Mapel diganti; tim guru/ruangan tujuan tetap")
          : "Tujuan sudah punya insidental — aktifkan opsi perbarui";
      } else if (hasMaster) {
        status = "READY_EXISTING_MASTER";
        explanation = copySourceTeam ? "Mapel dan tim guru sumber disalin; ruangan master tujuan tetap" : "Guru/ruangan diwarisi dari master tujuan";
      } else if (copySourceTeam && hasSourceTeacher) {
        status = "READY_EMPTY_SLOT"; explanation = "Sesi baru: mapel dan tim guru sumber disalin, tanpa ruangan";
      } else {
        status = "BLOCKED_NO_TEACHER";
        explanation = "JP kosong — aktifkan salin tim guru sumber untuk membuat sesi tambahan";
      }
      rows.push({ className, period, subject: source?.mapel || "", status, explanation });
    }
  }
  return rows;
}
