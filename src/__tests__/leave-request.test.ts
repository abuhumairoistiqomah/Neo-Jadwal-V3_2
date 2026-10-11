import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublicLeaveSubmission,
  buildTeacherLeaveSlots,
} from "../domain/leaveRequest";
import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  ScheduleItem,
} from "../domain/models";

const master: ScheduleItem[] = [
  {
    id: "m1",
    kelas: "06 INTER 1 I",
    hari: "Senin",
    jam_ke: 2,
    mulai: "08:40",
    selesai: "09:40",
    mapel: "Mathematics",
    guru1: "Mr Is",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak",
  },
  {
    id: "m2",
    kelas: "06 INTER 2 A",
    hari: "Senin",
    jam_ke: 4,
    mulai: "11:00",
    selesai: "12:00",
    mapel: "Science",
    guru1: "Mr Is",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak",
  },
];

const date = "2026-10-12"; // Monday

describe("V3.12 leave slot derivation", () => {
  it("derives only the selected teacher's active assignments", () => {
    const slots = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      scheduleDate: date,
      schedules: master,
    });
    assert.deepEqual(slots.map((slot) => [slot.period, slot.classCode]), [
      [0, "JAM KOSONG"],
      [2, "06 INTER 1 I"],
      [4, "06 INTER 2 A"],
    ]);
  });

  it("uses incidental teacher inheritance/override from the canonical engine", () => {
    const incidentals: JadwalInsidentalItem[] = [{
      id: "i1",
      tanggal: date,
      kelas: "06 INTER 1 I",
      jam_ke: 2,
      mapel: "Physics",
      guru1: "",
      guru2: "",
      guru3: "",
      guru4: "",
      guru5: "",
      guru6: "",
      ruangan: "",
    }];
    const slots = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      scheduleDate: date,
      schedules: master,
      jadwalInsidental: incidentals,
    });
    const jp2 = slots.find((slot) => slot.period === 2);
    assert.equal(jp2?.subject, "Physics");
    assert.equal(jp2?.source, "INCIDENTAL_OVERRIDE");
  });

  it("does not offer a slot already recorded as leave/badal", () => {
    const logs: LogIzinItem[] = [{
      id: "l1",
      tanggal: date,
      guru_izin: "Mr Is",
      alasan: "Sakit",
      jam_ke: 2,
      kelas: "06 INTER 1 I",
      mapel: "Mathematics",
      guru_pengganti: "Guru B",
    }];
    const slots = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      scheduleDate: date,
      schedules: master,
      logs,
    });
    assert.deepEqual(slots.map((slot) => slot.period), [0, 4]);
  });

  it("does not offer a slot suppressed by Kalender Akademik", () => {
    const calendar: KalenderAkademikItem[] = [{
      id: "cal1",
      tanggal_mulai: date,
      tanggal_selesai: date,
      nama_kegiatan: "Kegiatan Kelas",
      tipe: "Kegiatan Selain KBM Normal",
      cakupan: "Kelas",
      kelas: "06 INTER 2 A",
      jp_mulai: 4,
      jp_selesai: 4,
      status: "Aktif",
    }];
    const slots = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      scheduleDate: date,
      schedules: master,
      kalenderAkademik: calendar,
    });
    assert.deepEqual(slots.map((slot) => slot.period), [0, 2]);
  });
});

describe("V3.12 public submission payload", () => {
  const slots = buildTeacherLeaveSlots({
    teacherName: "Mr Is",
    scheduleDate: date,
    schedules: master,
  });

  it("sends only teacher/date/reason and selected schedule identities", () => {
    const payload = buildPublicLeaveSubmission({
      teacherName: " Mr Is ",
      scheduleDate: date,
      requestType: "PARTIAL",
      reason: " Keperluan keluarga ",
      detail: " Pulang lebih awal ",
      slots: [slots.find((slot) => slot.period === 2)!],
    });
    assert.equal(payload.p_teacher_name, "Mr Is");
    assert.equal(payload.p_reason, "Keperluan keluarga");
    assert.equal(payload.p_request_type, "PARTIAL");
    assert.deepEqual(payload.p_slots, [{
      class_code: "06 INTER 1 I",
      period: 2,
      subject: "Mathematics",
    }]);
  });

  it("rejects an empty JP selection", () => {
    assert.throws(() => buildPublicLeaveSubmission({
      teacherName: "Mr Is",
      scheduleDate: date,
      requestType: "FULL_DAY",
      reason: "Sakit",
      slots: [],
    }), /minimal satu JP/i);
  });
});

describe("V3.12 database security contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(
    resolve(here, "../../supabase/migrations/202610070016_v3_12_public_leave_submission.sql"),
    "utf8",
  );

  it("allows anonymous execution only through the public submission RPC", () => {
    assert.match(sql, /grant execute on function public\.ejadwal_submit_public_leave_request[\s\S]*to anon/i);
    assert.match(sql, /revoke all privileges on table public\.leave_requests from anon/i);
    assert.match(sql, /revoke all privileges on table public\.leave_request_slots from anon/i);
  });

  it("revalidates schedule ownership and academic-calendar suppression server-side", () => {
    assert.match(sql, /ejadwal_teacher_scheduled_for_leave_slot/i);
    assert.match(sql, /ACADEMIC_EVENT_SUPPRESSES_SLOT/i);
    assert.match(sql, /TEACHER_NOT_SCHEDULED_FOR_SLOT/i);
    assert.match(sql, /SLOT_ALREADY_HAS_ACTIVE_COVERAGE/i);
  });
});

describe("V3.12.1 period-based attendance leave", () => {
  const schoolDay: ScheduleItem[] = [
    ...master,
    {
      id: "other-1", kelas: "01 INTER 1 I", hari: "Senin", jam_ke: 1,
      mulai: "07:30", selesai: "08:15", mapel: "English", guru1: "Other Teacher",
      guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
    },
    {
      id: "other-3", kelas: "01 INTER 1 I", hari: "Senin", jam_ke: 3,
      mulai: "09:00", selesai: "09:45", mapel: "English", guru1: "Other Teacher",
      guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
    },
    {
      id: "other-5", kelas: "01 INTER 1 I", hari: "Senin", jam_ke: 5,
      mulai: "11:00", selesai: "11:45", mapel: "English", guru1: "Other Teacher",
      guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
    },
    {
      id: "other-6", kelas: "01 INTER 1 I", hari: "Senin", jam_ke: 6,
      mulai: "11:45", selesai: "12:30", mapel: "English", guru1: "Other Teacher",
      guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
    },
  ];

  it("includes free JPs as statistics-only leave periods", () => {
    const periods = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      scheduleDate: date,
      schedules: schoolDay,
    });
    assert.deepEqual(periods.map((item) => [item.period, item.periodType]), [
      [0, "FREE"], [1, "FREE"], [2, "TEACHING"], [3, "FREE"], [4, "TEACHING"], [5, "FREE"], [6, "FREE"],
    ]);
    assert.equal(periods.find((item) => item.period === 1)?.assignments.length, 0);
  });

  it("serializes FREE periods separately from teaching coverage slots", () => {
    const periods = buildTeacherLeaveSlots({ teacherName: "Mr Is", scheduleDate: date, schedules: schoolDay });
    const selected = periods.filter((item) => item.period === 1 || item.period === 2);
    const payload = buildPublicLeaveSubmission({
      teacherName: "Mr Is", scheduleDate: date, requestType: "PARTIAL", reason: "Keperluan", slots: selected,
    });
    assert.deepEqual(payload.p_periods, [
      { period: 1, period_type: "FREE" },
      { period: 2, period_type: "TEACHING" },
    ]);
    assert.deepEqual(payload.p_slots, [{ class_code: "06 INTER 1 I", period: 2, subject: "Mathematics" }]);
  });

  it("ships a database migration that stores FREE/TEACHING period facts without public table writes", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(
      resolve(here, "../../supabase/migrations/202610080018_v3_12_1_period_leave_and_inferred_sessions.sql"),
      "utf8",
    );
    assert.match(sql, /create table if not exists public\.leave_request_periods/i);
    assert.match(sql, /period_type in \('TEACHING', 'FREE'\)/i);
    assert.match(sql, /FREE_PERIOD_HAS_TEACHING/i);
    assert.match(sql, /revoke all privileges on table public\.leave_request_periods from anon/i);
    assert.match(sql, /grant execute on function public\.ejadwal_submit_public_leave_request_v2[\s\S]*to anon/i);
  });
});


describe("V3.13.1 JP-0 Homeroom leave + badal", () => {
  const schoolDay: ScheduleItem[] = [
    ...master,
    {
      id: "other-1", kelas: "01 INTER 1 I", hari: "Senin", jam_ke: 1,
      mulai: "07:40", selesai: "08:40", mapel: "English", guru1: "Other Teacher",
      guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
    },
  ];

  it("puts JP-0 first and marks a wali kelas homeroom session as TEACHING", () => {
    const periods = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      teacher: {
        nama: "Mr Is",
        mapel_utama: "Math",
        rumpun: "",
        jenjang: "",
        tugas_tambahan: "Wali Kelas",
        keterangan: "06 INTER 1 I",
        wali_kelas: "06 INTER 1 I",
      },
      scheduleDate: date,
      schedules: schoolDay,
    });
    assert.equal(periods[0]?.period, 0);
    assert.equal(periods[0]?.periodType, "TEACHING");
    assert.equal(periods[0]?.classCode, "06 INTER 1 I");
    assert.match(periods[0]?.subject || "", /Homeroom/i);
    assert.deepEqual(periods[0]?.assignments.map((item) => item.classCode), ["06 INTER 1 I"]);
  });

  it("still records JP-0 as FREE/statistics for teachers without homeroom duty", () => {
    const periods = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      teacher: {
        nama: "Mr Is",
        mapel_utama: "Math",
        rumpun: "",
        jenjang: "",
        tugas_tambahan: "",
        keterangan: "",
      },
      scheduleDate: date,
      schedules: schoolDay,
    });
    assert.equal(periods[0]?.period, 0);
    assert.equal(periods[0]?.periodType, "FREE");
    assert.equal(periods[0]?.assignments.length, 0);
  });

  it("serializes JP-0 coverage but never manufactures a lesson-material task for Homeroom", () => {
    const periods = buildTeacherLeaveSlots({
      teacherName: "Mr Is",
      teacher: {
        nama: "Mr Is",
        mapel_utama: "Math",
        rumpun: "",
        jenjang: "",
        tugas_tambahan: "Wali Kelas",
        keterangan: "06 INTER 1 I",
        wali_kelas: "06 INTER 1 I",
      },
      scheduleDate: date,
      schedules: schoolDay,
    });
    const jp0 = periods.find((item) => item.period === 0)!;
    const payload = buildPublicLeaveSubmission({
      teacherName: "Mr Is",
      scheduleDate: date,
      requestType: "PARTIAL",
      reason: "Sakit",
      slots: [jp0],
    });
    assert.deepEqual(payload.p_periods, [{ period: 0, period_type: "TEACHING" }]);
    assert.deepEqual(payload.p_slots, [{
      class_code: "06 INTER 1 I",
      period: 0,
      subject: "Homeroom Session (Wali Kelas)",
    }]);
    assert.deepEqual(payload.p_tasks, []);
  });
});
