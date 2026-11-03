import assert from "node:assert/strict";
import test from "node:test";
import { buildInvalRecommendationDayIndex, isPendampingOfTargetClass } from "../domain/inval/recommendationPerformance";
import type { Teacher } from "../domain/models";
import type { EffectiveScheduleItem } from "../domain/schedule/effectiveSchedule";

const date = "2026-10-29";
const teachers: Teacher[] = [
  { nama: "KHORIHAH", mapel_utama: "Math", rumpun: "STEM", jenjang: "SD", tugas_tambahan: "", keterangan: "" },
  { nama: "UNZILA", mapel_utama: "Al-Qur'an", rumpun: "Agama", jenjang: "SD", tugas_tambahan: "", keterangan: "" },
];

function slot(override: Partial<EffectiveScheduleItem> = {}): EffectiveScheduleItem {
  return {
    id: "test-jp2", kelas: "01 INTER 3 I", hari: "Kamis", jam_ke: 2,
    mulai: "08:15", selesai: "09:00", mapel: "Math",
    guru1: "KHORIHAH", guru2: "UNZILA", guru3: "", guru4: "", guru5: "", guru6: "",
    selainguru1_mengawas: "Ya", kelasgabung: "Tidak", tanggal: date, source: "MASTER",
    scheduledTeachers: ["KHORIHAH", "UNZILA"], absentTeachers: ["KHORIHAH"],
    substituteTeachers: [], effectiveTeachers: ["UNZILA"], substitutions: [],
    logIds: [], academicEvent: null, isSuppressedByAcademicCalendar: false,
    isActive: true, ...override,
  };
}

test("HF2 companion badge lists exact classes on the selected JP only", () => {
  const index = buildInvalRecommendationDayIndex({
    teachers, effectiveSchedulesForDate: [
      slot(),
      slot({ id: "jp3", jam_ke: 3, kelas: "03 INTER 1 I" }),
      slot({ id: "jp4", jam_ke: 4, kelas: "05 INTER 1 I", isActive: false }),
    ],
    logs: [], date,
  });
  const classes = index.teacherStatsByName.get("unzila")?.pendampingClassesByPeriod;
  assert.deepEqual(classes?.get(2), ["01 INTER 3 I"]);
  assert.deepEqual(classes?.get(3), ["03 INTER 1 I"]);
  assert.equal(classes?.has(4), false, "A calendar-suppressed slot must not masquerade as a current companion duty");
});

test("HF2 target companion preference requires the same class, not only the same level", () => {
  assert.equal(isPendampingOfTargetClass(["01 INTER 3 I"], ["01 INTER 3 I"]), true);
  assert.equal(isPendampingOfTargetClass(["01 INTER 3 I"], ["1 INTER 3 I"]), true);
  assert.equal(isPendampingOfTargetClass(["01 INTER 3 I"], ["01 INTER 3 A"]), false);
  assert.equal(isPendampingOfTargetClass(["01 INTER 3 I"], ["03 INTER 1 I"]), false);
  assert.equal(isPendampingOfTargetClass(["01 INTER 3 I"], ["01 INTER 2 I", "01 INTER 3 I"]), true);
  assert.equal(isPendampingOfTargetClass([], ["01 INTER 3 I"]), false);
});

test("HF2 badge follows active companion role, not mere guru2 roster membership", () => {
  const index = buildInvalRecommendationDayIndex({
    teachers,
    effectiveSchedulesForDate: [slot({ selainguru1_mengawas: "Tidak" })],
    logs: [], date,
  });
  assert.deepEqual(index.teacherStatsByName.get("unzila")?.pendampingClassesByPeriod.get(2), undefined);
});
