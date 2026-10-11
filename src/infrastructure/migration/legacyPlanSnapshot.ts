import type { ScheduleDataSnapshot } from "../repositories/scheduleRepository";
import type { LegacyMigrationPlan } from "./legacyMigration";
import { scheduleClassModeToLegacy } from "../../domain/schedule/classMode";

const DAY_NAMES: Record<number, string> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
  7: "Minggu",
};

function teacherSlots(names: string[]): [string, string, string, string, string, string] {
  const slots = Array.from({ length: 6 }, (_, index) => String(names[index] || "").trim());
  return slots as [string, string, string, string, string, string];
}

/**
 * Convert the already-normalized migration plan back into the legacy-compatible
 * domain shape consumed by Dashboard. This makes the live cutover comparison
 * independent from Postgres UUIDs and compares what the UI actually receives.
 */
export function legacyPlanToScheduleSnapshot(plan: LegacyMigrationPlan): ScheduleDataSnapshot {
  return {
    teachers: plan.teachers.map((row) => {
      const additionalTask = row.additionalTask || "";
      const notes = row.notes || "";
      const taskLower = additionalTask.toLocaleLowerCase("id-ID");
      return {
        nama: row.fullName,
        panggilan: row.shortName,
        gender: row.gender,
        whatsapp_e164: row.whatsappE164,
        mapel_utama: row.primarySubjectsText || "",
        rumpun: row.subjectCluster || "",
        jenjang: row.levelsText || "",
        tugas_tambahan: additionalTask,
        keterangan: notes,
        wali_kelas: taskLower.includes("wali") ? notes || null : null,
        pendamping_kelas: taskLower.includes("pendamping") ? notes || null : null,
        is_manajemen: taskLower.includes("manajemen"),
      };
    }),
    schedules: plan.schedules.map((row) => {
      const [guru1, guru2, guru3, guru4, guru5, guru6] = teacherSlots(row.teacherNames);
      return {
        id: row.legacyRowId,
        kelas: row.classCode,
        hari: DAY_NAMES[row.dayOfWeek] || "",
        jam_ke: row.period,
        mulai: row.startTime || "",
        selesai: row.endTime || "",
        mapel: row.subject,
        guru1,
        guru2,
        guru3,
        guru4,
        guru5,
        guru6,
        kelasgabung: scheduleClassModeToLegacy(row.classMode),
        ruangan: row.roomId || "",
        selainguru1_mengawas: row.otherTeachersSupervise ? "Ya" : "Tidak",
        keterangan_khusus: row.specialNote || "",
      };
    }),
    logs: plan.coverage.map((row) => ({
      id: row.legacyLogId,
      tanggal: row.scheduleDate,
      guru_izin: row.absentTeacherName,
      alasan: row.reasonSnapshot || "",
      jam_ke: row.period,
      kelas: row.classCode || "",
      mapel: row.subjectSnapshot,
      guru_pengganti: row.substituteTeacherName || "",
      tugas: row.taskText || undefined,
    })),
    jadwalInsidental: plan.incidentals.map((row) => {
      const [guru1, guru2, guru3, guru4, guru5, guru6] = teacherSlots(row.teacherNames);
      return {
        id: row.legacyRowId,
        tanggal: row.scheduleDate,
        kelas: row.classCode,
        jam_ke: row.period,
        mapel: row.overrideSubject || "",
        guru1,
        guru2,
        guru3,
        guru4,
        guru5,
        guru6,
        kelasgabung: row.overrideClassMode == null ? "" : scheduleClassModeToLegacy(row.overrideClassMode),
        ruangan: row.overrideRoomId || "",
        keterangan_khusus: row.overrideSpecialNote || "",
        alasan: row.reason || "",
        tipe_insidental: row.incidentalType || row.kind,
      };
    }),
    masterRuangan: plan.rooms.map((row) => ({
      id_ruangan: row.id,
      nama_ruangan: row.name,
      alias: row.aliases.join("|"),
      kapasitas: row.capacity ?? undefined,
      lokasi: row.location || undefined,
      jenis: row.roomType || undefined,
      status: row.status === "INACTIVE" ? "Nonaktif" : "Aktif",
    })),
    kalenderAkademik: plan.academicEvents.map((row) => ({
      id: row.legacyEventCode || row.legacyRowId,
      tanggal_mulai: row.dateStart,
      tanggal_selesai: row.dateEnd,
      nama_kegiatan: row.eventName,
      tipe: row.eventType,
      cakupan: row.scope === "CLASS" ? "Kelas" : "Semua",
      kelas: row.classCode || "",
      jp_mulai: row.periodStart,
      jp_selesai: row.periodEnd,
      status: row.status === "INACTIVE" ? "Nonaktif" : "Aktif",
    })),
  };
}
