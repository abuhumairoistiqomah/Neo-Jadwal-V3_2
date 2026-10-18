import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const teacher = fs.readFileSync(new URL("../components/JadwalLengkap.tsx", import.meta.url), "utf8");
const classPage = fs.readFileSync(new URL("../components/JadwalKelas.tsx", import.meta.url), "utf8");
const exporter = fs.readFileSync(new URL("../infrastructure/browser/exportElementJpeg.ts", import.meta.url), "utf8");
const dashboard = fs.readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");

test("V3.14.5 exports PNG from the existing Jadwal Lengkap teacher grid", () => {
  assert.match(teacher, /id="download-teacher-timetable-png-btn"/);
  assert.match(teacher, /onClick={handleDownloadTeacherPng}/);
  assert.match(teacher, /Unduh Jadwal Guru \(PNG\)/);
  assert.match(teacher, /downloadElementAsPng\(staging, `Jadwal_Guru_\$\{safeName\}_/);
  assert.match(teacher, /id="teacher-timetable-summary"/);
  assert.match(teacher, /id="teacher-timetable-legend"/);
  assert.match(teacher, /id="teacher-timetable-grid"/);
  assert.match(teacher, /grid\.cloneNode\(true\)/);
  assert.match(teacher, /gridClone\.style\.display = "block"/);
  assert.match(teacher, /gridClone\.setAttribute\("data-export-expand-scroll", "true"\)/);
  assert.match(teacher, /exportHost\.appendChild\(staging\)/);
  assert.match(teacher, /downloadElementAsPng\(staging/);
  assert.match(teacher, /exportHost\.remove\(\)/);
  assert.match(teacher, /JADWAL NORMAL \/ MASTER MINGGUAN/);
  assert.match(teacher, /JADWAL EFEKTIF/);
  assert.match(exporter, /image\/png/);
  // Avoid introducing a second, competing schedule grid in Dashboard Guru.
  assert.doesNotMatch(dashboard, /download-teacher-timetable-png-btn/);
});

test("V3.14.5 preserves the canonical teacher schedule and only compacts export text", () => {
  assert.match(teacher, /buildTeacherWeeklyView/);
  assert.match(teacher, /scheduleMode/);
  assert.match(teacher, /const totalJP = uniqueSlots\.size/);
  assert.match(teacher, /gridClone\.querySelectorAll<HTMLElement>\('\[data-teacher-export-subject="true"\]'\)/);
  assert.match(teacher, /compactSubjectLabel/);
  assert.match(teacher, /compactClassLabel/);
  assert.match(teacher, /gridClone\.querySelectorAll<HTMLElement>\('\[data-teacher-export-class="true"\]'\)/);
});

test("V3.14.5 removes the class PDF UI and handler but retains class PNG and view modes", () => {
  assert.doesNotMatch(classPage, /handlePrintPDF|print-timetable-pdf-btn|Cetak \/ Simpan PDF|window\.print\(\)/);
  assert.doesNotMatch(classPage, /\bPrinter\b/);
  assert.match(classPage, /id="download-timetable-png-btn"/);
  assert.match(classPage, /Unduh Jadwal Kelas \(PNG\)/);
  assert.match(classPage, /Jadwal Normal/);
  assert.match(classPage, /Jadwal Insidental/);
});
