import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AVAILABILITY_CUTOVER_SECTIONS } from "../domain/schedule/availabilityCutover";
import { compareScheduleDataSnapshotSections } from "../domain/schedule/snapshotParity";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";

function snapshot(): ScheduleDataSnapshot {
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
        id: "s1",
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
        ruangan: "",
        selainguru1_mengawas: "Tidak",
        keterangan_khusus: "",
      },
    ],
    logs: [],
    jadwalInsidental: [],
    masterRuangan: [],
    kalenderAkademik: [],
  };
}

describe("V3.9 Jam Kosong / Availability cutover parity", () => {
  it("compares exactly teacher master and recurring schedules", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    const result = compareScheduleDataSnapshotSections(expected, actual, [...AVAILABILITY_CUTOVER_SECTIONS]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.sections.map((section) => section.section), [...AVAILABILITY_CUTOVER_SECTIONS]);
  });

  it("detects a teacher-master mismatch because all three consumers render teacher metadata", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.teachers[0].mapel_utama = "Science";

    const result = compareScheduleDataSnapshotSections(expected, actual, [...AVAILABILITY_CUTOVER_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "teachers")?.ok, false);
  });

  it("detects a schedule-teacher assignment mismatch because it changes free/busy status", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.schedules[0].guru1 = "UST. BUDI";

    const result = compareScheduleDataSnapshotSections(expected, actual, [...AVAILABILITY_CUTOVER_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "schedules")?.ok, false);
  });

  it("intentionally ignores non-consumer sections in V3.9 legacy-semantics parity", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.logs.push({
      id: "log-1",
      tanggal: "2026-10-07",
      guru_izin: "UST. AHMAD",
      alasan: "Izin",
      jam_ke: 3,
      kelas: "06 INTER 1 I",
      mapel: "Mathematics",
      guru_pengganti: "UST. BUDI",
      tugas: "Latihan",
    });
    actual.jadwalInsidental.push({
      id: "inc-1",
      tanggal: "2026-10-07",
      kelas: "06 INTER 1 I",
      jam_ke: 3,
      mapel: "Science",
      guru1: "UST. BUDI",
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
    });
    actual.masterRuangan.push({ id_ruangan: "LAB", nama_ruangan: "Lab", alias: "", status: "Aktif" });
    actual.kalenderAkademik.push({
      id: "ev1",
      tanggal_mulai: "2026-10-07",
      tanggal_selesai: "2026-10-07",
      nama_kegiatan: "Libur",
      tipe: "Libur",
      cakupan: "Semua",
      kelas: "",
      jp_mulai: null,
      jp_selesai: null,
      status: "Aktif",
    });

    const result = compareScheduleDataSnapshotSections(expected, actual, [...AVAILABILITY_CUTOVER_SECTIONS]);
    assert.equal(result.ok, true);
  });

  it("normalizes harmless teacher-name casing and whitespace", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.teachers[0].nama = "  ust.   ahmad ";
    actual.schedules[0].guru1 = " ust. ahmad ";

    const result = compareScheduleDataSnapshotSections(expected, actual, [...AVAILABILITY_CUTOVER_SECTIONS]);
    assert.equal(result.ok, true);
  });
});
