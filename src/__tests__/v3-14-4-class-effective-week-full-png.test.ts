import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { compactSubjectLabel } from "../domain/schedule/displayLabels";
import { buildClassWeekMap } from "../domain/schedule/classWeek";
import type { ScheduleItem, LogIzinItem } from "../domain/models";

test("compacts dense subject labels only for presentation", () => {
  assert.equal(compactSubjectLabel("Arabic / Native Arabic"), "Arabic / Native");
  assert.equal(compactSubjectLabel("Bahasa Indonesia"), "B. Indonesia");
});

test("class this-week map applies concrete badal coverage", () => {
  const schedules: ScheduleItem[] = [{
    id: "s1", kelas: "08 AE 1 I", hari: "Rabu", jam_ke: 3, mulai: "10:00", selesai: "11:00",
    mapel: "Mathematics", guru1: "Teacher A", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
  }];
  const logs: LogIzinItem[] = [{
    id: "l1", tanggal: "2026-10-14", guru_izin: "Teacher A", alasan: "Outing", jam_ke: 3,
    kelas: "08 AE 1 I", mapel: "Mathematics", guru_pengganti: "Teacher B",
  }];
  const week = buildClassWeekMap({ referenceDate: "2026-10-14", className: "08 AE 1 I", schedules, logs });
  assert.equal(week.Rabu[3].hasSubstitute, true);
  assert.deepEqual(week.Rabu[3].items[0].effectiveTeachers, ["Teacher B"]);
});

test("Jadwal Kelas exposes master/effective-week modes and full-width PNG export", () => {
  const classPage = fs.readFileSync(new URL("../components/JadwalKelas.tsx", import.meta.url), "utf8");
  const exportHelper = fs.readFileSync(new URL("../infrastructure/browser/exportElementJpeg.ts", import.meta.url), "utf8");
  const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
  const dashboard = fs.readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");

  assert.match(classPage, /Jadwal Asli/);
  assert.match(classPage, /Minggu Ini/);
  assert.match(classPage, /buildClassWeekMap/);
  assert.match(classPage, /data-export-expand-scroll="true"/);
  assert.match(classPage, /Jadwal_Kelas_\$\{selectedClass\.replace/);
  assert.match(exportHelper, /measureExpandedExportWidth/);
  assert.match(exportHelper, /exportExpandScroll/);
  assert.match(app, /jadwalInsidental=\{jadwalInsidental\}/);
  assert.match(app, /schoolToday=\{schoolToday\}/);

  // Teacher PNG belongs to the existing Jadwal Lengkap flow in a later patch,
  // not to Dashboard Guru.
  assert.doesNotMatch(dashboard, /download-teacher-timetable-png-btn/);
  assert.doesNotMatch(dashboard, /Jadwal Mingguan Guru/);
});
