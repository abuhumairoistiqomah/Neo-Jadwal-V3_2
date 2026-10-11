import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareScheduleDataSnapshotSections } from "../domain/schedule/snapshotParity";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";

function baseSnapshot(): ScheduleDataSnapshot {
  return {
    teachers: [
      {
        nama: "UST. AHMAD",
        panggilan: "Ahmad",
        mapel_utama: "Mathematics",
        rumpun: "Math",
        jenjang: "SD",
        tugas_tambahan: "",
        keterangan: "",
        wali_kelas: "",
        pendamping_kelas: "",
        is_manajemen: false,
      },
    ],
    schedules: [
      {
        id: "legacy-1",
        kelas: "06 INTER 1 I",
        hari: "Senin",
        jam_ke: 3,
        mulai: "10:00",
        selesai: "11:00",
        mapel: "Mathematics",
        guru1: "UST. AHMAD",
        guru2: "",
        guru3: "",
        guru4: "",
        guru5: "",
        guru6: "",
        kelasgabung: "Tidak",
        ruangan: "LABKOM",
        selainguru1_mengawas: "",
        keterangan_khusus: "",
      },
    ],
    logs: [],
    jadwalInsidental: [],
    masterRuangan: [
      {
        id_ruangan: "LABKOM",
        nama_ruangan: "Laboratorium Komputer",
        alias: "Lab Komputer",
        kapasitas: 25,
        lokasi: "Lantai 3 Gedung A",
        jenis: "Laboratorium",
        status: "Aktif",
      },
    ],
    kalenderAkademik: [],
  };
}

const sections = ["teachers", "schedules", "masterRuangan", "logs"] as const;

describe("V3.7.2 Jadwal Kelas cutover parity", () => {
  it("passes when the four Jadwal Kelas consumer sections match", () => {
    const expected = baseSnapshot();
    const actual = structuredClone(expected);

    const result = compareScheduleDataSnapshotSections(expected, actual, [...sections]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sections.map((section) => section.section), [...sections]);
  });

  it("detects a Log Izin mismatch because badal colors consume current-week coverage", () => {
    const expected = baseSnapshot();
    const actual = structuredClone(expected);
    actual.logs.push({
      id: "extra-log",
      tanggal: "2026-10-07",
      guru_izin: "UST. AHMAD",
      alasan: "Izin",
      jam_ke: 3,
      kelas: "06 INTER 1 I",
      mapel: "Mathematics",
      guru_pengganti: "UST. BADAL",
      tugas: "",
    });

    const result = compareScheduleDataSnapshotSections(expected, actual, [...sections]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "logs")?.ok, false);
  });

  it("detects a missing recurring schedule", () => {
    const expected = baseSnapshot();
    const actual = structuredClone(expected);
    actual.schedules = [];

    const result = compareScheduleDataSnapshotSections(expected, actual, [...sections]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "schedules")?.ok, false);
  });

  it("detects a room master mismatch used for display names", () => {
    const expected = baseSnapshot();
    const actual = structuredClone(expected);
    actual.masterRuangan[0].nama_ruangan = "Nama Salah";

    const result = compareScheduleDataSnapshotSections(expected, actual, [...sections]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "masterRuangan")?.ok, false);
  });

  it("normalizes harmless whitespace and casing in parity comparison", () => {
    const expected = baseSnapshot();
    const actual = structuredClone(expected);
    actual.teachers[0].nama = "  ust.   ahmad ";
    actual.schedules[0].guru1 = "ust. ahmad";

    const result = compareScheduleDataSnapshotSections(expected, actual, [...sections]);
    assert.equal(result.ok, true);
  });
});
