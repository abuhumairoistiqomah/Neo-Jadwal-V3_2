import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";
import { buildEffectiveScheduleForDate } from "../domain/schedule/effectiveSchedule";
import { detectScheduleConflicts } from "../domain/scheduleConflicts";
import { mapIncidentalRows } from "../infrastructure/repositories/supabaseScheduleMappers";

const source = (path: string) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const master = (kelas: string, mapel: string, guru: string, ruangan: string): ScheduleItem => ({
  id: kelas, kelas, hari: "Senin", jam_ke: 1, mulai: "07:40", selesai: "08:40",
  mapel, guru1: guru, guru2: "Guru Pendamping", guru3: "", guru4: "", guru5: "", guru6: "",
  kelasgabung: "Tidak", ruangan,
});
const incident = (kelas: string, mapel: string, guru: string, ruangan: string): JadwalInsidentalItem => ({
  id: `inc-${kelas}`, tanggal: "2026-10-12", kelas, jam_ke: 1, kind: "OVERRIDE",
  mapel, guru1: guru, guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  replaceTeachers: true, kelasgabung: "Tidak", ruangan,
});

test("RC3: dated incidental overrides class+date+JP independent of original subject", () => {
  const schedules = [master("12 AE 3 A", "Mathematics", "Guru Math", "Kelas A"),
    master("12 MQ AKHWAT", "Al-Qur'an", "Guru Quran", "Kelas B")];
  const rows = buildEffectiveScheduleForDate({ date: "2026-10-12", schedules,
    jadwalInsidental: [incident("12 AE 3 A", "Gladi Resik TKA", "Pengawas A", "RSG")] });
  assert.equal(rows.length, 2);
  const a = rows.find((row) => row.kelas === "12 AE 3 A")!;
  assert.equal(a.mapel, "Gladi Resik TKA");
  assert.equal(a.source, "INCIDENTAL_OVERRIDE");
  assert.deepEqual(a.scheduledTeachers, ["Pengawas A"]);
  assert.equal(a.guru2, ""); // Do not incorrectly inherit the old subject's teacher!
  assert.equal(schedules[0].mapel, "Mathematics"); // master is untouched
});

test("RC3: two distinct dated classes can share an occupied room, and remain visibly conflicting", () => {
  const schedules = [master("12 AE 3 A", "Mathematics", "Guru Math", "Kelas A"),
    master("12 MQ AKHWAT", "Al-Qur'an", "Guru Quran", "Kelas B")];
  const incidentals = [incident("12 AE 3 A", "Gladi Resik TKA", "Pengawas A", "RSG"),
    incident("12 MQ AKHWAT", "Latihan Khusus", "Pengawas B", "RSG")];
  const conflicts = detectScheduleConflicts(schedules, incidentals);
  const room = conflicts.find((item) => item.dayOrDate === "2026-10-12" && item.room === "RSG");
  assert.ok(room, "An occupied room must still be visible in Conflict Center");
  assert.equal(room.severity, "BLOCKER"); // operational urgency, NOT a database write blocker
  assert.deepEqual(new Set(room.classes), new Set(["12 AE 3 A", "12 MQ AKHWAT"]));
});

test("RC3: room-only dated override inherits original teacher assignments", () => {
  const [result] = buildEffectiveScheduleForDate({
    date: "2026-10-12",
    schedules: [master("12 AE 3 A", "Mathematics", "Guru Math", "Kelas A")],
    jadwalInsidental: [{ ...incident("12 AE 3 A", "", "", "RSG"), replaceTeachers: false }],
  });
  assert.deepEqual(result.scheduledTeachers, ["Guru Math", "Guru Pendamping"]);
  assert.equal(result.ruangan, "RSG");
});

test("RC3: Supabase teacher override rows replace the complete previous team", () => {
  const mapped = mapIncidentalRows({
    classes: [{ id: "class-a", code: "A", display_name: "12 AE 3 A" }],
    teachers: [{ id: "teacher-a", full_name: "Pengawas A" }],
    scheduleIncidentals: [{ id: "i", class_id: "class-a", schedule_date: "2026-10-12", period: 1,
      kind: "OVERRIDE", override_subject: "Gladi Resik", override_room_id: "RSG" }],
    incidentalTeacherOverrides: [{ incidental_id: "i", position: 1, action: "SET", teacher_id: "teacher-a" }],
  });
  assert.equal(mapped[0].replaceTeachers, true);
  const [row] = buildEffectiveScheduleForDate({ date: "2026-10-12",
    schedules: [master("12 AE 3 A", "Mathematics", "Guru Math", "Kelas A")],
    jadwalInsidental: mapped });
  assert.deepEqual(row.scheduledTeachers, ["Pengawas A"]);
});

test("RC3: additive SQL migration records conflicts but does not throw ROOM_SLOT_CONFLICT", () => {
  const sql = source("../../supabase/migrations/202610110003_v3_14_6_incidental_conflicts_nonblocking.sql");
  assert.match(sql, /create or replace function public\.ejadwal_upsert_schedule_incidental_v1\(/i);
  assert.match(sql, /'room_conflict_warning', v_room_conflict/);
  assert.doesNotMatch(sql, /raise exception 'ROOM_SLOT_CONFLICT'/);
  assert.match(sql, /INCIDENTAL_SLOT_ALREADY_EXISTS/);
  assert.match(sql, /v_kind := case when exists/);
  assert.doesNotMatch(sql, /MASTER_SLOT_EXISTS_USE_OVERRIDE/);
  assert.doesNotMatch(sql, /MASTER_SLOT_NOT_FOUND_USE_ADDITIONAL/);
  assert.match(sql, /TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED/);
  assert.match(sql, /STAFF_REQUIRED/);
  assert.doesNotMatch(sql, /update public\.schedule_master/i);
});

test("RC3: class+JP automatically selects the kind; a new subject is accepted", () => {
  const ui = source("../components/IncidentalScheduleAdmin.tsx");
  assert.match(ui, /const kind = masterForSlot \? "OVERRIDE" as const : "ADDITIONAL" as const/);
  assert.match(ui, /Jenis \(otomatis\)/);
  assert.match(ui, /roomConflictPreview/);
  assert.doesNotMatch(ui, /kind === "OVERRIDE" && !masterForSlot/);
});
