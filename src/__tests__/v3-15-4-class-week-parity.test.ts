import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teacherWeekDays } from "../domain/schedule/teacherWeeklyView";
import { buildClassWeekMap } from "../domain/schedule/classWeek";
import type { ScheduleItem, LogIzinItem } from "../domain/models";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

const mondayMaster: ScheduleItem = {
  id: "master-1", kelas: "08 AE 1 I", hari: "Senin", jam_ke: 2,
  mulai: "08:40", selesai: "09:40", mapel: "Math",
  guru1: "GURU NORMAL", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
};
const mondayBadal: LogIzinItem = {
  id: "badal-next", tanggal: "2026-10-19", kelas: "08 AE 1 I", jam_ke: 2,
  mapel: "Math", guru_izin: "GURU NORMAL", guru_pengganti: "GURU BADAL", alasan: "Sakit",
};

test("V3.15.4 class and teacher use the same Monday-Friday default, including weekend", () => {
  for (const schoolToday of ["2026-10-17", "2026-10-18"]) {
    const days = teacherWeekDays(schoolToday);
    assert.deepEqual(days.map((day) => day.dateStr), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  }
  assert.equal(teacherWeekDays("2026-10-16")[0].dateStr, "2026-10-12");
  assert.equal(teacherWeekDays("2026-10-19")[0].dateStr, "2026-10-19");
  assert.equal(teacherWeekDays("2026-10-17", -1)[0].dateStr, "2026-10-12");
  assert.equal(teacherWeekDays("2026-10-17", 1)[0].dateStr, "2026-10-26");
});

test("V3.15.4 class dated view reads the SELECTED week's badal, not this week's", () => {
  const nextWeekStart = teacherWeekDays("2026-10-17")[0].dateStr;
  const active = buildClassWeekMap({ referenceDate: nextWeekStart, className: "08 AE 1 I", schedules: [mondayMaster], logs: [mondayBadal] });
  assert.equal(active.Senin[2].date, "2026-10-19");
  assert.equal(active.Senin[2].hasSubstitute, true);
  assert.deepEqual(active.Senin[2].items[0].effectiveTeachers, ["GURU BADAL"]);

  const previous = buildClassWeekMap({ referenceDate: teacherWeekDays("2026-10-17", -1)[0].dateStr, className: "08 AE 1 I", schedules: [mondayMaster], logs: [mondayBadal] });
  assert.equal(previous.Senin[2].date, "2026-10-12");
  assert.equal(previous.Senin[2].hasSubstitute, false);
  assert.deepEqual(previous.Senin[2].items[0].effectiveTeachers, ["GURU NORMAL"]);
});

test("V3.15.4 Jadwal Kelas matches teacher UI, defaults effective, and routes export/quick-edit through selected week", () => {
  const klass = source("../components/JadwalKelas.tsx");
  const teacher = source("../components/JadwalLengkap.tsx");
  assert.match(teacher, /teacherWeekDays\(schoolToday, weekOffset\)/);
  assert.match(klass, /teacherWeekDays\(referenceSchoolDay, weekOffset\)/);
  assert.match(klass, /useState<"MASTER" \| "THIS_WEEK">\("THIS_WEEK"\)/);
  assert.match(klass, /Jadwal Normal/);
  assert.match(klass, /Jadwal Insidental/);
  assert.match(klass, /Minggu sebelumnya/);
  assert.match(klass, /Minggu berikutnya/);
  assert.match(klass, /setWeekOffset\(0\)/);
  assert.match(klass, /Sabtu\/Minggu otomatis menampilkan minggu depan/);
  assert.match(klass, /referenceDate: effectiveWeekReference/);
  assert.match(klass, /date: cell\.date/);
  assert.match(klass, /`Insidental_\$\{effectiveWeekReference\}`/);
  assert.match(klass, /scheduleViewMode === "MASTER" \? "Normal"/);
  assert.doesNotMatch(klass, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
