import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getClassGender, getGenderPreference } from "../domain/classGender";
import { evaluateSubstituteCandidatePolicy } from "../domain/inval/candidatePolicy";
import { INVAL_CUTOVER_SECTIONS } from "../domain/inval/invalCutover";
import { compareScheduleDataSnapshotSections } from "../domain/schedule/snapshotParity";
import type { SubstituteConstraint } from "../domain/substituteAvailability";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";
import { mapTeacherRows } from "../infrastructure/repositories/supabaseScheduleMappers";

function snapshot(): ScheduleDataSnapshot {
  return {
    teachers: [
      {
        id: "teacher-a",
        nama: "UST. AHMAD",
        panggilan: "Ahmad",
        gender: "IKHWAN",
        whatsapp_e164: "+628123456789",
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
        jam_ke: 5,
        mulai: "13:00",
        selesai: "14:00",
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

const weeklySoft: SubstituteConstraint = {
  id: "soft-1",
  teacherId: "teacher-a",
  kind: "WEEKLY",
  dayOfWeek: 1,
  specificDate: null,
  periodStart: 5,
  periodEnd: 6,
  validFrom: null,
  validUntil: null,
  reason: "Kuliah",
  overrideAllowed: true,
  isActive: true,
};

describe("V3.10 Input Inval cutover — parity gate", () => {
  it("compares all six legacy data sections consumed by Input Inval", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    const result = compareScheduleDataSnapshotSections(expected, actual, [...INVAL_CUTOVER_SECTIONS]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.sections.map((section) => section.section), [...INVAL_CUTOVER_SECTIONS]);
  });

  it("detects Log Izin mismatch because badal and weekly load depend on it", () => {
    const expected = snapshot();
    const actual = structuredClone(expected);
    actual.logs.push({
      id: "log-1",
      tanggal: "2026-10-05",
      guru_izin: "UST. AHMAD",
      alasan: "Izin",
      jam_ke: 5,
      kelas: "06 INTER 1 I",
      mapel: "Mathematics",
      guru_pengganti: "UST. BUDI",
    });
    const result = compareScheduleDataSnapshotSections(expected, actual, [...INVAL_CUTOVER_SECTIONS]);
    assert.equal(result.ok, false);
    assert.equal(result.sections.find((section) => section.section === "logs")?.ok, false);
  });
});

describe("V3.10 Input Inval cutover — explicit gender preference", () => {
  it("parses MQ and terminal I/A class gender without arbitrary substring matching", () => {
    assert.equal(getClassGender("09 MQ IKHWAN"), "IKHWAN");
    assert.equal(getClassGender("09 MQ AKHWAT"), "AKHWAT");
    assert.equal(getClassGender("06 INTER 1 I"), "IKHWAN");
    assert.equal(getClassGender("06 INTER 2 A"), "AKHWAT");
    assert.equal(getClassGender("06 INTER 2"), "UNKNOWN");
  });

  it("treats same gender as preference and different gender as mismatch, not a hard ban", () => {
    assert.equal(getGenderPreference("06 INTER 1 I", "IKHWAN"), "MATCH");
    assert.equal(getGenderPreference("06 INTER 1 I", "AKHWAT"), "MISMATCH");
    assert.equal(getGenderPreference("06 INTER 1 I", ""), "UNKNOWN");
  });
});

describe("V3.10 Input Inval cutover — soft constraints", () => {
  it("returns SOFT_BLOCKED with explicit override requirement for matching recurring rule", () => {
    const teacher = snapshot().teachers[0];
    const result = evaluateSubstituteCandidatePolicy({
      teacher,
      className: "06 INTER 1 I",
      date: "2026-10-05",
      period: 5,
      constraints: [weeklySoft],
    });
    assert.equal(result.genderPreference, "MATCH");
    assert.equal(result.constraintStatus, "SOFT_BLOCKED");
    assert.equal(result.requiresConstraintOverride, true);
    assert.deepEqual(result.constraintReasons, ["Kuliah"]);
  });

  it("keeps the candidate available outside the soft-ban JP range", () => {
    const result = evaluateSubstituteCandidatePolicy({
      teacher: snapshot().teachers[0],
      className: "06 INTER 1 I",
      date: "2026-10-05",
      period: 4,
      constraints: [weeklySoft],
    });
    assert.equal(result.constraintStatus, "AVAILABLE");
    assert.equal(result.requiresConstraintOverride, false);
  });
});

describe("V3.10 Input Inval cutover — teacher identity metadata", () => {
  it("preserves Supabase teacher UUID, gender, and WhatsApp for policy/communication layers", () => {
    const result = mapTeacherRows([
      {
        id: "teacher-a",
        full_name: "UST. AHMAD",
        short_name: "Ahmad",
        gender: "IKHWAN",
        whatsapp_e164: "+628123456789",
      },
    ]);
    assert.equal(result[0]?.id, "teacher-a");
    assert.equal(result[0]?.gender, "IKHWAN");
    assert.equal(result[0]?.whatsapp_e164, "+628123456789");
  });

  it("normalizes unknown database gender instead of guessing from teacher names", () => {
    const result = mapTeacherRows([
      {
        id: "teacher-b",
        full_name: "Teacher B",
        gender: "",
      },
    ]);
    assert.equal(result[0]?.gender, "UNKNOWN");
  });
});
