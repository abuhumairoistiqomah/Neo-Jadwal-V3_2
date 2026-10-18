import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildTeacherLeaveSlots, buildPublicLeaveSubmission, splitHomeroomClasses } from "../domain/leaveRequest";
import { buildEffectiveScheduleForDate } from "../domain/schedule/effectiveSchedule";
import { selectOperationalTeacherSchedules } from "../domain/schedule/dashboardEffectiveDay";
import type { ScheduleItem, JadwalInsidentalItem, KalenderAkademikItem } from "../domain/models";

const date = "2026-10-12";
const make = (id: string, kelas: string, guru: string, mapel = "Math"): ScheduleItem => ({
  id, kelas, hari: "Senin", jam_ke: 1, mulai: "07:40", selesai: "08:40",
  mapel, guru1: guru, guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak",
});
const event = (name: string, tipe: string): KalenderAkademikItem => ({
  id: "event", tanggal_mulai: date, tanggal_selesai: date, nama_kegiatan: name, tipe,
  cakupan: "Semua", status: "Aktif", jp_mulai: 1, jp_selesai: 1,
});
const dated = (id: string, kelas: string): JadwalInsidentalItem => ({
  id, tanggal: date, kelas, jam_ke: 1, mapel: "Persiapan Ujian", guru1: "ISTIQOMAH",
  guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", replaceTeachers: true,
  kelasgabung: "Iya", ruangan: "LAB",
});

test("multi-class homeroom is still one JP0 leave period with two coverage classes", () => {
  assert.deepEqual(splitHomeroomClasses("01 MQ IKHWAN + 02 MQ IKHWAN"), ["01 MQ IKHWAN", "02 MQ IKHWAN"]);
  assert.deepEqual(splitHomeroomClasses("01 MQ IKHWAN dan 02 MQ IKHWAN"), ["01 MQ IKHWAN", "02 MQ IKHWAN"]);
  const slots = buildTeacherLeaveSlots({
    teacherName: "MAR’I, S.Pd.", teacher: { wali_kelas: "01 MQ IKHWAN + 02 MQ IKHWAN" } as any,
    scheduleDate: date, schedules: [make("m1", "01 MQ IKHWAN", "GURU LAIN")],
  });
  const homeroom = slots.find((row) => row.period === 0);
  assert.ok(homeroom);
  assert.equal(homeroom.periodType, "TEACHING");
  assert.deepEqual(homeroom.assignments.map((row) => row.classCode), ["01 MQ IKHWAN", "02 MQ IKHWAN"]);
  const payload = buildPublicLeaveSubmission({teacherName: "MAR’I, S.Pd.", scheduleDate: date, requestType: "PARTIAL", reason: "Izin", slots: [homeroom]});
  assert.deepEqual(payload.p_periods.map((row) => row.period), [0]);
  assert.deepEqual(payload.p_slots.map((row) => row.class_code), ["01 MQ IKHWAN", "02 MQ IKHWAN"]);
});

test("dated exam-prep replaces suppressed master rather than merging 04 INTER and 09 AE/MQ", () => {
  const rows = buildEffectiveScheduleForDate({
    date,
    schedules: [make("old", "04 INTER 3 A", "ISTIQOMAH", "Science"), make("ae", "09 AE 2 A", "GURU LAIN"), make("mq", "09 MQ AKHWAT", "GURU LAIN")],
    jadwalInsidental: [dated("i1", "09 AE 2 A"), dated("i2", "09 MQ AKHWAT")],
    kalenderAkademik: [event("Rumah Tahfidz 2", "Kegiatan")],
  });
  const teacherRows = selectOperationalTeacherSchedules(rows.filter((row) => row.scheduledTeachers.includes("ISTIQOMAH")));
  assert.deepEqual(teacherRows.map((row) => row.kelas).sort(), ["09 AE 2 A", "09 MQ AKHWAT"]);
  assert.ok(teacherRows.every((row) => row.isActive));
  assert.equal(rows.find((row) => row.kelas === "04 INTER 3 A")?.isSuppressedByAcademicCalendar, true);
});

test("official holidays and room-only edits still respect calendar closure", () => {
  const rows = buildEffectiveScheduleForDate({date, schedules:[make("m1", "09 AE 2 A", "GURU ASLI")], jadwalInsidental:[dated("i1","09 AE 2 A")], kalenderAkademik:[event("Libur Nasional", "Libur")]});
  assert.equal(rows[0].isActive, false);
  const roomOnly: JadwalInsidentalItem = {...dated("i2", "09 AE 2 A"), replaceTeachers:false, guru1:"", mapel:"", ruangan:"LAB"};
  const duringRT = buildEffectiveScheduleForDate({date, schedules:[make("m1", "09 AE 2 A", "GURU ASLI")], jadwalInsidental:[roomOnly], kalenderAkademik:[event("Rumah Tahfidz 2", "Kegiatan")]});
  assert.equal(duringRT[0].isActive,false);
});

test("combobox keeps an actual dropdown arrow and supports typing without magnifying glass", () => {
  const ui = readFileSync("src/components/ui/SearchableSelect.tsx", "utf8");
  assert.match(ui, /<ChevronDown/);
  assert.match(ui, /onChange=\{\(event\) => \{ setQuery\(event.target.value\)/);
  assert.doesNotMatch(ui, /<Search /);
});

test("Proses Badal opens the smart in-page picker and preserves approval navigation", () => {
  const ui = readFileSync("src/components/LeaveApprovalAdmin.tsx", "utf8");
  assert.match(ui, /setActiveWaitingSession\(session\)/);
  assert.match(ui, /<InputGuruPengganti/);
  assert.match(ui, /approvedWaitingSession=\{activeWaitingSession\}/);
  assert.doesNotMatch(ui, /href=\{buildBadalProcessingUrl\(session\)\}/);
});

test("JP0 SQL supports multi-class notes and all affected schedule surfaces share calendar precedence", () => {
  const sql = readFileSync("supabase/migrations/202610110053_v3_14_6_multi_class_homeroom_leave.sql", "utf8");
  assert.match(sql, /regexp_split_to_table/);
  assert.match(sql, /ejadwal_teacher_scheduled_for_leave_slot/);
  const dash = readFileSync("src/components/Dashboard.tsx", "utf8");
  const rooms = readFileSync("src/components/JadwalRuangan.tsx", "utf8");
  const klass = readFileSync("src/components/JadwalKelas.tsx", "utf8");
  assert.match(dash, /selectOperationalTeacherSchedules/);
  assert.match(rooms, /datedInstructionOverridesCalendar/);
  assert.match(klass, /activeItems.length === 0 && eventItem/);
});
