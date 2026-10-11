import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { detectScheduleConflicts } from "../domain/scheduleConflicts";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";

const fixture = (klasse: string, guru: string, mapel: string, ruangan: string): ScheduleItem => ({
  id: `master-${klasse}`, kelas: klasse, hari: "Senin", jam_ke: 1,
  mulai: "07:40", selesai: "08:40", mapel,
  guru1: guru, guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  kelasgabung: "Tidak", ruangan,
});
const override = (klasse: string, room = "RSG", subject = "Gladi Resik TKA"): JadwalInsidentalItem => ({
  id: `inc-${klasse}`, tanggal: "2026-10-12", kelas: klasse, jam_ke: 1,
  mapel: subject, guru1: "Pengawas A", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
  kelasgabung: "Ya", ruangan: room, kind: "OVERRIDE",
});
const source = (relative: string) => fs.readFileSync(new URL(relative, import.meta.url), "utf8");

test("12 AE + 12 MQ Akhwat: same date JP subject invigilator room is one incidental session", () => {
  const master = [fixture("12 AE 3 A", "Guru Matematika", "Mathematics", "K12"),
    fixture("12 MQ AKHWAT", "Guru Al Quran", "Al-Qur'an", "KMQ")];
  const conflicts = detectScheduleConflicts(master, [override("12 AE 3 A"), override("12 MQ AKHWAT")]);
  assert.equal(conflicts.some((v) => v.kind === "INCIDENTAL"), false);
});

test("same invigilator, same subject, DIFFERENT rooms is a genuine conflict", () => {
  const master = [fixture("12 AE 3 A", "Guru Matematika", "Mathematics", "K12"),
    fixture("12 MQ AKHWAT", "Guru Al Quran", "Al-Qur'an", "KMQ")];
  const conflicts = detectScheduleConflicts(master, [override("12 AE 3 A", "RSG"), override("12 MQ AKHWAT", "LABKOM")]);
  assert.ok(conflicts.some((v) => v.kind === "INCIDENTAL" && v.severity === "WARNING"));
});

test("same venue, DIFFERENT subjects is still a real room blocker", () => {
  const master = [fixture("12 AE 3 A", "Guru Matematika", "Mathematics", "K12"),
    fixture("12 MQ AKHWAT", "Guru Al Quran", "Al-Qur'an", "KMQ")];
  const conflicts = detectScheduleConflicts(master, [override("12 AE 3 A", "RSG"), override("12 MQ AKHWAT", "RSG", "Science")]);
  assert.ok(conflicts.some((v) => v.kind === "INCIDENTAL" && v.severity === "BLOCKER"));
});

test("RC2 SQL uses effective DATE occupancy and only explicit, evidenced combined sessions bypass conflicts", () => {
  const sql = source("../../supabase/migrations/202610110002_v3_14_6_incidental_combined_sessions.sql");
  assert.match(sql, /create or replace function public\.ejadwal_upsert_schedule_incidental_v1\(/i);
  assert.match(sql, /left join public\.schedule_incidentals si/);
  assert.match(sql, /coalesce\(si\.override_room_id, sm\.room_id\)/);
  assert.match(sql, /coalesce\(p_is_combined, false\)/);
  assert.match(sql, /e\.teacher_ids @> p_teacher_ids/);
  assert.match(sql, /p_teacher_ids @> e\.teacher_ids/);
  assert.match(sql, /if v_room_conflict then/i);
  assert.match(sql, /TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.doesNotMatch(sql, /update public\.schedule_master/i);
});

test("editor asks for teacher override only after dated Supabase conflict, then explicitly retries", () => {
  const editor = source("../components/IncidentalScheduleAdmin.tsx");
  assert.match(editor, /allowTeacherConflict: false/);
  assert.match(editor, /detail\.includes\("TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED"\)/);
  assert.match(editor, /window\.confirm/);
  assert.match(editor, /allowTeacherConflict: true/);
  assert.match(editor, /Kelas Gabung/);
});
