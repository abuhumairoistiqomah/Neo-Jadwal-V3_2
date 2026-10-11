import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareScheduleDataSnapshotSections } from "../domain/schedule/snapshotParity";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";
import { JADWAL_RUANGAN_SECTIONS } from "../domain/schedule/jadwalRuanganCutover";

function snapshot(): ScheduleDataSnapshot {
  return {
    teachers: [],
    schedules: [
      {
        id: "s1",
        kelas: "06 INTER 1 I",
        hari: "Senin",
        jam_ke: 3,
        mulai: "10:00",
        selesai: "11:00",
        mapel: "Science",
        guru1: "UST A",
        guru2: "",
        guru3: "",
        guru4: "",
        guru5: "",
        guru6: "",
        kelasgabung: "Tidak",
        ruangan: "LABIPA",
        selainguru1_mengawas: "Tidak",
        keterangan_khusus: "",
      },
    ],
    logs: [],
    jadwalInsidental: [
      {
        id: "i1",
        tanggal: "2026-10-12",
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
        ruangan: "LABKOM",
        keterangan_khusus: "Pindah ruang",
        alasan: "Praktikum komputer",
        tipe_insidental: "Pindah Ruangan",
      },
    ],
    masterRuangan: [
      {
        id_ruangan: "LABIPA",
        nama_ruangan: "Laboratorium Sains",
        alias: "Ruang Laboratorium Science",
        status: "Aktif",
      },
      {
        id_ruangan: "LABKOM",
        nama_ruangan: "Laboratorium Komputer",
        alias: "Ruang Laboratorium Komputer",
        status: "Aktif",
      },
    ],
    kalenderAkademik: [
      {
        id: "EV1",
        tanggal_mulai: "2026-10-12",
        tanggal_selesai: "2026-10-12",
        nama_kegiatan: "Kegiatan Sekolah",
        tipe: "Kegiatan Selain KBM Normal",
        cakupan: "Kelas",
        kelas: "06 INTER 1 I",
        jp_mulai: 5,
        jp_selesai: 6,
        status: "Aktif",
      },
    ],
  };
}

describe("V3.8 Jadwal Ruangan cutover parity", () => {
  it("compares exactly the four room-schedule inputs", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    const result = compareScheduleDataSnapshotSections(expected, actual, [...JADWAL_RUANGAN_SECTIONS]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sections.map((section) => section.section), [...JADWAL_RUANGAN_SECTIONS]);
  });

  it("detects a room relocation mismatch in Jadwal_Insidental", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.jadwalInsidental[0].ruangan = "LABIPA";
    const result = compareScheduleDataSnapshotSections(expected, actual, [...JADWAL_RUANGAN_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "jadwalInsidental")?.ok, false);
  });

  it("detects a calendar JP-range mismatch because it changes room occupancy", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.kalenderAkademik[0].jp_mulai = 4;
    const result = compareScheduleDataSnapshotSections(expected, actual, [...JADWAL_RUANGAN_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "kalenderAkademik")?.ok, false);
  });

  it("detects a master room metadata mismatch", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.masterRuangan[0].nama_ruangan = "Nama Salah";
    const result = compareScheduleDataSnapshotSections(expected, actual, [...JADWAL_RUANGAN_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "masterRuangan")?.ok, false);
  });

  it("detects a recurring schedule room mismatch", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.schedules[0].ruangan = "LABKOM";
    const result = compareScheduleDataSnapshotSections(expected, actual, [...JADWAL_RUANGAN_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "schedules")?.ok, false);
  });
});
