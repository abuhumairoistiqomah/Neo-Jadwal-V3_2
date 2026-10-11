import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFormAssignmentsByTeacher,
  buildInvalRecommendationDayIndex,
  buildRecommendationDependencyKey,
} from "../domain/inval/recommendationPerformance";
import type { EffectiveScheduleItem } from "../domain/schedule/effectiveSchedule";
import type { LogIzinItem, Teacher } from "../domain/models";

const teachers: Teacher[] = [
  {
    nama: "Guru A",
    mapel_utama: "Math",
    rumpun: "STEM",
    jenjang: "SD",
    tugas_tambahan: "",
    keterangan: "",
  },
  {
    nama: "Guru B",
    mapel_utama: "Science",
    rumpun: "STEM",
    jenjang: "SD",
    tugas_tambahan: "",
    keterangan: "",
  },
];

function slot(overrides: Partial<EffectiveScheduleItem>): EffectiveScheduleItem {
  return {
    id: "s1",
    kelas: "03 INTER 1 I",
    hari: "Senin",
    jam_ke: 2,
    mulai: "08:40",
    selesai: "09:40",
    mapel: "Math",
    guru1: "Guru A",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak",
    tanggal: "2026-10-05",
    source: "MASTER",
    scheduledTeachers: ["Guru A"],
    absentTeachers: [],
    substituteTeachers: [],
    effectiveTeachers: ["Guru A"],
    substitutions: [],
    logIds: [],
    academicEvent: null,
    isSuppressedByAcademicCalendar: false,
    isActive: true,
    ...overrides,
  };
}

test("V3.11.1 recommendation key ignores task typing", () => {
  const base = [{
    jam_ke: 2,
    kelas: "03 INTER 1 I",
    mapel: "Math",
    selectedPengganti: "Guru B",
    tugas: "Baca halaman 1",
    constraintOverrideIds: [],
  }];
  const editedTask = [{ ...base[0], tugas: "Baca halaman 1-5" }];

  assert.equal(
    buildRecommendationDependencyKey(base),
    buildRecommendationDependencyKey(editedTask),
  );
});

test("V3.11.1 recommendation key changes when substitute assignment changes", () => {
  const base = [{
    jam_ke: 2,
    kelas: "03 INTER 1 I",
    mapel: "Math",
    selectedPengganti: "Guru B",
    tugas: "",
    constraintOverrideIds: [],
  }];
  const changed = [{ ...base[0], selectedPengganti: "Guru A" }];

  assert.notEqual(
    buildRecommendationDependencyKey(base),
    buildRecommendationDependencyKey(changed),
  );
});

test("V3.11.1 builds current-form assignment index once", () => {
  const result = buildFormAssignmentsByTeacher([
    { jam_ke: 2, kelas: "A", mapel: "Math", selectedPengganti: " Guru B ", constraintOverrideIds: [] },
    { jam_ke: 4, kelas: "B", mapel: "Science", selectedPengganti: "Guru B", constraintOverrideIds: [] },
    { jam_ke: 5, kelas: "C", mapel: "English", selectedPengganti: "", constraintOverrideIds: [] },
  ]);

  assert.deepEqual(result.get("guru b"), [
    { rowIndex: 0, jamKe: 2 },
    { rowIndex: 1, jamKe: 4 },
  ]);
});

test("V3.11.1 day index precomputes busy teachers and saved badal", () => {
  const logs: LogIzinItem[] = [{
    id: "l1",
    tanggal: "2026-10-05",
    guru_izin: "Guru X",
    alasan: "Izin",
    jam_ke: 3,
    kelas: "03 INTER 2 A",
    mapel: "Science",
    guru_pengganti: "Guru B",
  }];
  const index = buildInvalRecommendationDayIndex({
    teachers,
    effectiveSchedulesForDate: [slot({})],
    logs,
    date: "2026-10-05",
  });

  assert.equal(index.teacherStatsByName.get("guru a")?.busyPeriods.has(2), true);
  assert.equal(index.savedSubstituteJamKeByTeacher.get("guru b")?.has(3), true);
  assert.equal(index.savedSubstituteTeachersByPeriod.get(3)?.has("guru b"), true);
  assert.equal(index.absentJamKeByTeacher.get("guru x")?.has(3), true);
  assert.equal(index.absentJamKeByTeacher.get("guru x")?.has(4), false);
});

test("V3.11.1 academic-calendar-suppressed slots are not busy", () => {
  const index = buildInvalRecommendationDayIndex({
    teachers,
    effectiveSchedulesForDate: [slot({ isActive: false, isSuppressedByAcademicCalendar: true })],
    logs: [],
    date: "2026-10-05",
  });

  assert.equal(index.teacherStatsByName.get("guru a")?.busyPeriods.has(2), false);
  assert.equal(index.teacherStatsByName.get("guru a")?.regularTeachingJamKe.has(2), true);
});
