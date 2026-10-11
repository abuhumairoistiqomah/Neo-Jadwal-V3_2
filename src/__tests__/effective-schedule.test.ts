import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEffectiveScheduleForDate,
  getActiveEffectiveSchedules,
} from "../domain/schedule/effectiveSchedule.ts";
import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  ScheduleItem,
} from "../domain/models.ts";

const mondayMaster: ScheduleItem = {
  id: "M-1",
  kelas: "06 INTER 1 I",
  hari: "Senin",
  jam_ke: 3,
  mulai: "09:00",
  selesai: "09:45",
  mapel: "Science",
  guru1: "Ustadz Ahmad",
  guru2: "Ustadz Bilal",
  guru3: "",
  guru4: "",
  guru5: "",
  guru6: "",
  kelasgabung: "Tidak",
  ruangan: "LABIPA",
  keterangan_khusus: "Master note",
};

const mondaySecondSlot: ScheduleItem = {
  ...mondayMaster,
  id: "M-2",
  kelas: "06 INTER 2 A",
  jam_ke: 4,
  mapel: "Math",
  guru1: "Ustadzah Hana",
  guru2: "",
  ruangan: "LABKOM",
};

function makeIncidental(overrides: Partial<JadwalInsidentalItem> = {}): JadwalInsidentalItem {
  return {
    id: "I-1",
    tanggal: "2026-09-21",
    kelas: "06 INTER 1 I",
    jam_ke: 3,
    mapel: "",
    guru1: "",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "",
    ruangan: "",
    keterangan_khusus: "",
    alasan: "",
    tipe_insidental: "",
    ...overrides,
  };
}

function makeLog(overrides: Partial<LogIzinItem> = {}): LogIzinItem {
  return {
    id: "L-1",
    tanggal: "2026-09-21",
    guru_izin: "Ustadz Ahmad",
    alasan: "Sakit",
    jam_ke: 3,
    kelas: "06 INTER 1 I",
    mapel: "Science",
    guru_pengganti: "",
    tugas: "Kerjakan halaman 10",
    ...overrides,
  };
}

const partialCalendar: KalenderAkademikItem = {
  id: "CAL-1",
  tanggal_mulai: "2026-09-21",
  tanggal_selesai: "2026-09-21",
  nama_kegiatan: "Kegiatan Kelas",
  tipe: "Kegiatan Selain KBM Normal",
  cakupan: "Kelas",
  kelas: "06 INTER 1 I",
  jp_mulai: 3,
  jp_selesai: 3,
  status: "Aktif",
};

describe("V3.3 canonical effective schedule — master baseline", () => {
  it("selects only master rows belonging to the real weekday of the date", () => {
    const tuesday = { ...mondayMaster, id: "T-1", hari: "Selasa" };
    const result = buildEffectiveScheduleForDate({
      date: "2026-09-21", // Monday
      schedules: [mondayMaster, tuesday],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].id, "M-1");
    assert.equal(result[0].source, "MASTER");
    assert.equal(result[0].tanggal, "2026-09-21");
  });

  it("keeps scheduled and effective teachers equal when there is no izin", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
    });

    assert.deepEqual(result.scheduledTeachers, ["Ustadz Ahmad", "Ustadz Bilal"]);
    assert.deepEqual(result.effectiveTeachers, ["Ustadz Ahmad", "Ustadz Bilal"]);
    assert.deepEqual(result.absentTeachers, []);
    assert.equal(result.isActive, true);
  });

  it("normalizes ISO-like date input before evaluating the weekday", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21T00:00:00.000Z",
      schedules: [mondayMaster],
    });
    assert.equal(result.tanggal, "2026-09-21");
  });
});

describe("V3.3 canonical effective schedule — incidental inheritance", () => {
  it("matches overrides by date + class + JP even when mapel changes", () => {
    const incidental = makeIncidental({ mapel: "Physics" });
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [incidental],
    });

    assert.equal(result.source, "INCIDENTAL_OVERRIDE");
    assert.equal(result.masterId, "M-1");
    assert.equal(result.incidentalId, "I-1");
    assert.equal(result.mapel, "Physics");
  });

  it("inherits every blank teacher field from master, including guru2-guru6", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [makeIncidental()],
    });

    assert.equal(result.guru1, "Ustadz Ahmad");
    assert.equal(result.guru2, "Ustadz Bilal");
    assert.equal(result.guru3, "");
    assert.deepEqual(result.scheduledTeachers, ["Ustadz Ahmad", "Ustadz Bilal"]);
  });

  it("inherits mapel, room, combined-class flag, and note when incidental fields are blank", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [makeIncidental()],
    });

    assert.equal(result.mapel, "Science");
    assert.equal(result.ruangan, "LABIPA");
    assert.equal(result.kelasgabung, "Tidak");
    assert.equal(result.keterangan_khusus, "Master note");
  });

  it("allows a room-only incidental without erasing teachers or mapel", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [
        makeIncidental({
          ruangan: "LABKOM",
          alasan: "Lab IPA dipakai ujian",
          tipe_insidental: "Relokasi Ruangan",
        }),
      ],
    });

    assert.equal(result.ruangan, "LABKOM");
    assert.equal(result.mapel, "Science");
    assert.deepEqual(result.scheduledTeachers, ["Ustadz Ahmad", "Ustadz Bilal"]);
    assert.equal(result.incidentalType, "Relokasi Ruangan");
  });

  it("overrides only explicitly populated incidental teacher fields", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [makeIncidental({ guru1: "Ustadz Karim" })],
    });

    assert.equal(result.guru1, "Ustadz Karim");
    assert.equal(result.guru2, "Ustadz Bilal");
    assert.deepEqual(result.scheduledTeachers, ["Ustadz Karim", "Ustadz Bilal"]);
  });

  it("ignores incidentals from a different date", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [makeIncidental({ tanggal: "2026-09-22", mapel: "Physics" })],
    });

    assert.equal(result.source, "MASTER");
    assert.equal(result.mapel, "Science");
  });
});

describe("V3.3 canonical effective schedule — standalone incidentals", () => {
  it("adds an unmatched incidental as an additional schedule row", () => {
    const result = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [
        makeIncidental({
          id: "I-ADD",
          kelas: "09 AE 1 I",
          jam_ke: 5,
          mapel: "Native Arabic",
          guru1: "Syaikh Manshur",
          ruangan: "RSG",
        }),
      ],
    });

    assert.equal(result.length, 2);
    const additional = result.find((item) => item.incidentalId === "I-ADD");
    assert.ok(additional);
    assert.equal(additional.source, "INCIDENTAL_ADDITIONAL");
    assert.equal(additional.mapel, "Native Arabic");
    assert.deepEqual(additional.scheduledTeachers, ["Syaikh Manshur"]);
    assert.equal(additional.ruangan, "RSG");
  });

  it("uses the shared JP time map for an additional incidental", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [],
      jadwalInsidental: [makeIncidental({ kelas: "09 AE 1 I", jam_ke: 5 })],
    });

    assert.equal(result.mulai, "11:00");
    assert.equal(result.selesai, "11:45");
  });
});

describe("V3.3 canonical effective schedule — izin and badal", () => {
  it("removes an absent scheduled teacher when no substitute exists", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      logs: [makeLog()],
    });

    assert.deepEqual(result.absentTeachers, ["Ustadz Ahmad"]);
    assert.deepEqual(result.substituteTeachers, []);
    assert.deepEqual(result.effectiveTeachers, ["Ustadz Bilal"]);
    assert.equal(result.substitutions[0].task, "Kerjakan halaman 10");
  });

  it("replaces the absent teacher with guru_pengganti while preserving team teachers", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      logs: [makeLog({ guru_pengganti: "Ustadz Karim" })],
    });

    assert.deepEqual(result.effectiveTeachers, ["Ustadz Bilal", "Ustadz Karim"]);
    assert.deepEqual(result.substituteTeachers, ["Ustadz Karim"]);
    assert.equal(result.substitutions[0].absentTeacher, "Ustadz Ahmad");
    assert.equal(result.substitutions[0].substituteTeacher, "Ustadz Karim");
  });

  it("does not apply a log from another class or JP", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      logs: [
        makeLog({ id: "L-OTHER-CLASS", kelas: "06 INTER 2 A" }),
        makeLog({ id: "L-OTHER-JP", jam_ke: 4 }),
      ],
    });

    assert.deepEqual(result.absentTeachers, []);
    assert.deepEqual(result.effectiveTeachers, ["Ustadz Ahmad", "Ustadz Bilal"]);
  });

  it("deduplicates a substitute who is already one of the scheduled teachers", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      logs: [makeLog({ guru_pengganti: "Ustadz Bilal" })],
    });

    assert.deepEqual(result.effectiveTeachers, ["Ustadz Bilal"]);
  });
});

describe("V3.3 canonical effective schedule — academic calendar final gate", () => {
  it("applies Kalender Akademik after incidental and badal without deleting the row", () => {
    const [result] = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster],
      jadwalInsidental: [makeIncidental({ ruangan: "LABKOM" })],
      logs: [makeLog({ guru_pengganti: "Ustadz Karim" })],
      kalenderAkademik: [partialCalendar],
    });

    assert.equal(result.source, "INCIDENTAL_OVERRIDE");
    assert.equal(result.ruangan, "LABKOM");
    assert.deepEqual(result.effectiveTeachers, ["Ustadz Bilal", "Ustadz Karim"]);
    assert.equal(result.academicEvent?.id, "CAL-1");
    assert.equal(result.isSuppressedByAcademicCalendar, true);
    assert.equal(result.isActive, false);
  });

  it("suppresses only the covered class/JP and leaves other slots active", () => {
    const result = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster, mondaySecondSlot],
      kalenderAkademik: [partialCalendar],
    });

    const classOne = result.find((item) => item.id === "M-1");
    const classTwo = result.find((item) => item.id === "M-2");
    assert.equal(classOne?.isActive, false);
    assert.equal(classTwo?.isActive, true);
  });

  it("supports full-day events and JP 0 as a real schedule slot", () => {
    const jpZero: ScheduleItem = {
      ...mondayMaster,
      id: "M-JP0",
      jam_ke: 0,
    };
    const fullDay: KalenderAkademikItem = {
      id: "CAL-FULL",
      tanggal_mulai: "2026-09-21",
      tanggal_selesai: "2026-09-21",
      nama_kegiatan: "Libur",
      tipe: "Libur",
      cakupan: "Semua",
      status: "Aktif",
    };

    const result = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [jpZero],
      kalenderAkademik: [fullDay],
    });

    assert.equal(result[0].jam_ke, 0);
    assert.equal(result[0].isActive, false);
  });

  it("provides a helper that returns only active KBM rows", () => {
    const result = buildEffectiveScheduleForDate({
      date: "2026-09-21",
      schedules: [mondayMaster, mondaySecondSlot],
      kalenderAkademik: [partialCalendar],
    });

    const active = getActiveEffectiveSchedules(result);
    assert.deepEqual(active.map((item) => item.id), ["M-2"]);
  });
});
