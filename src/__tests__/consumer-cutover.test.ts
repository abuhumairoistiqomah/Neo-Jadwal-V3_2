import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLegacyMigrationPlan, sanitizeLegacyPayload } from "../infrastructure/migration/legacyMigration";
import { legacyPlanToScheduleSnapshot } from "../infrastructure/migration/legacyPlanSnapshot";
import { compareScheduleDataSnapshots } from "../domain/schedule/snapshotParity";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";

const payload = {
  Master_Guru: [
    {
      _row_id: "Master_Guru_1",
      nama: "UST. AHMAD",
      panggilan: "Ahmad",
      mapel_utama: "Mathematics",
      rumpun: "Math",
      jenjang: "SD",
      tugas_tambahan: "Wali Kelas",
      keterangan: "06 INTER 1 I",
    },
  ],
  Master_Ruangan: [
    {
      _row_id: "Master_Ruangan_1",
      id_ruangan: "LABKOM",
      nama_ruangan: "Laboratorium Komputer",
      alias: "Lab Komputer",
      status: "Aktif",
    },
  ],
  Jadwal: [
    {
      _row_id: "Jadwal_1",
      kelas: "06 INTER 1 I",
      hari: "Senin",
      jam_ke: 3,
      mulai: "10:00",
      selesai: "11:00",
      mapel: "Mathematics",
      guru1: "UST. AHMAD",
      ruangan: "LABKOM",
      kelasgabung: "Tidak",
    },
  ],
  Jadwal_Insidental: [
    {
      _row_id: "Jadwal_Insidental_1",
      tanggal: "2026-10-05",
      kelas: "06 INTER 1 I",
      jam_ke: 3,
      ruangan: "LABKOM",
      alasan: "Pindah ruang",
    },
  ],
  Kalender_Akademik: [
    {
      _row_id: "Kalender_Akademik_1",
      id: "EVT-1",
      tanggal_mulai: "2026-10-05",
      tanggal_selesai: "2026-10-05",
      nama_kegiatan: "Kegiatan",
      tipe: "Kegiatan Selain KBM Normal",
      cakupan: "Kelas",
      kelas: "06 INTER 1 I",
      jp_mulai: 3,
      jp_selesai: 3,
      status: "Aktif",
    },
  ],
  Log_Izin: [
    {
      _row_id: "Log_Izin_1",
      tanggal: "2026-10-05",
      jam_ke: 3,
      guru_izin: "UST. AHMAD",
      kelas: "06 INTER 1 I",
      mapel: "Mathematics",
      guru_pengganti: "",
      alasan: "Izin",
      tugas: "Kerjakan halaman 12",
    },
  ],
};

function snapshot(): ScheduleDataSnapshot {
  return legacyPlanToScheduleSnapshot(buildLegacyMigrationPlan(sanitizeLegacyPayload(payload)));
}

function cloneSnapshot(value: ScheduleDataSnapshot): ScheduleDataSnapshot {
  return structuredClone(value);
}

describe("V3.7 legacy plan → Dashboard snapshot", () => {
  it("preserves teacher metadata used by Dashboard Wali Kelas", () => {
    const result = snapshot();
    assert.equal(result.teachers[0]?.wali_kelas, "06 INTER 1 I");
  });

  it("preserves task text on historical coverage", () => {
    const result = snapshot();
    assert.equal(result.logs[0]?.tugas, "Kerjakan halaman 12");
  });

  it("maps the recurring schedule into the existing Dashboard contract", () => {
    const result = snapshot();
    assert.equal(result.schedules[0]?.hari, "Senin");
    assert.equal(result.schedules[0]?.guru1, "UST. AHMAD");
    assert.equal(result.schedules[0]?.ruangan, "LABKOM");
  });
});

describe("V3.7 consumer snapshot parity", () => {
  it("passes for identical consumer snapshots", () => {
    const expected = snapshot();
    const result = compareScheduleDataSnapshots(expected, cloneSnapshot(expected));
    assert.equal(result.ok, true);
  });

  it("ignores persistence IDs and compares consumer-visible fields", () => {
    const expected = snapshot();
    const actual = cloneSnapshot(expected);
    actual.schedules[0].id = "postgres-uuid";
    actual.logs[0].id = "coverage-uuid";
    actual.jadwalInsidental[0].id = "incidental-uuid";
    const result = compareScheduleDataSnapshots(expected, actual);
    assert.equal(result.ok, true);
  });

  it("detects a missing schedule row", () => {
    const expected = snapshot();
    const actual = cloneSnapshot(expected);
    actual.schedules = [];
    const result = compareScheduleDataSnapshots(expected, actual);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "schedules")?.ok, false);
  });

  it("detects a changed room without being fooled by equal row counts", () => {
    const expected = snapshot();
    const actual = cloneSnapshot(expected);
    actual.schedules[0].ruangan = "LABIPA";
    const result = compareScheduleDataSnapshots(expected, actual);
    assert.equal(result.ok, false);
    assert.ok(result.differences.some((difference) => difference.startsWith("schedules:")));
  });

  it("uses multiset comparison so duplicate historical logs remain meaningful", () => {
    const expected = snapshot();
    expected.logs.push(structuredClone(expected.logs[0]));
    const actual = cloneSnapshot(expected);
    actual.logs.pop();
    const result = compareScheduleDataSnapshots(expected, actual);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "logs")?.expectedCount, 2);
    assert.equal(result.sections.find((section) => section.section === "logs")?.actualCount, 1);
  });
});
