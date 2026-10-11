import test from "node:test";
import assert from "node:assert/strict";
import { dateMatchesScheduleDay, dayNameFromISODate, nextOccurrenceISO } from "../domain/scheduleMutation";
import { buildEffectiveScheduleForDate } from "../domain/schedule/effectiveSchedule";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";

test("V3.13.4 resolves Indonesian weekday from an ISO date", () => {
  assert.equal(dayNameFromISODate("2026-10-14"), "Rabu");
  assert.equal(dateMatchesScheduleDay("2026-10-14", "Rabu"), true);
  assert.equal(dateMatchesScheduleDay("2026-10-14", "Kamis"), false);
});

test("V3.13.4 finds the next occurrence without changing the recurring master", () => {
  assert.equal(nextOccurrenceISO("Rabu", new Date(2026, 9, 10)), "2026-10-14");
});

test("V3.13.4 incidental override wins for only the requested date", () => {
  const master: ScheduleItem = {
    id: "master-1", kelas: "05 INTER 1", hari: "Rabu", jam_ke: 3,
    mulai: "10:00", selesai: "11:00", mapel: "Math", guru1: "Guru A", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak", ruangan: "R1",
  };
  const incidental: JadwalInsidentalItem = {
    id: "inc-1", tanggal: "2026-10-14", kelas: "05 INTER 1", jam_ke: 3,
    mapel: "Science", guru1: "Guru B", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", ruangan: "LAB", tipe_insidental: "OVERRIDE",
  };
  const changed = buildEffectiveScheduleForDate({ date: "2026-10-14", schedules: [master], jadwalInsidental: [incidental] });
  const untouched = buildEffectiveScheduleForDate({ date: "2026-10-21", schedules: [master], jadwalInsidental: [incidental] });
  assert.equal(changed[0]?.mapel, "Science");
  assert.equal(changed[0]?.guru1, "Guru B");
  assert.equal(untouched[0]?.mapel, "Math");
  assert.equal(untouched[0]?.guru1, "Guru A");
});

test("V3.13.4 standalone incidental appears on a free class slot", () => {
  const incidental: JadwalInsidentalItem = {
    id: "inc-add", tanggal: "2026-10-14", kelas: "05 INTER 1", jam_ke: 5,
    mapel: "Seminar", guru1: "Guru C", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", ruangan: "AULA", tipe_insidental: "ADDITIONAL",
  };
  const effective = buildEffectiveScheduleForDate({ date: "2026-10-14", schedules: [], jadwalInsidental: [incidental] });
  assert.equal(effective.length, 1);
  assert.equal(effective[0]?.source, "INCIDENTAL_ADDITIONAL");
  assert.equal(effective[0]?.mapel, "Seminar");
});

import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

test("V3.13.4 Quick Editor exposes permanent vs one-date mutation", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/ScheduleQuickEditor.tsx"), "utf8");
  assert.match(source, /Ubah Jadwal Tetap/);
  assert.match(source, /Hanya Tanggal Ini/);
  assert.match(source, /upsertScheduleIncidental/);
});

test("V3.13.4 provides a dedicated incidental schedule admin page", () => {
  const app = fs.readFileSync(path.join(projectRoot, "src/App.tsx"), "utf8");
  const page = fs.readFileSync(path.join(projectRoot, "src/components/IncidentalScheduleAdmin.tsx"), "utf8");
  assert.match(app, /schedule-incidental/);
  assert.match(page, /Timpa Jadwal Normal/);
  assert.match(page, /Tambah Sesi/);
});

test("V3.13.4 migration exposes validated incidental mutation RPCs", () => {
  const sql = fs.readFileSync(path.join(projectRoot, "supabase/migrations/202610100036_v3_13_4_schedule_mutation_core.sql"), "utf8");
  assert.match(sql, /ejadwal_upsert_schedule_incidental_v1/);
  assert.match(sql, /ejadwal_upsert_schedule_incidental_session_v1/);
  assert.match(sql, /TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED/);
  assert.match(sql, /ROOM_SLOT_CONFLICT/);
  assert.match(sql, /SCHEDULE_INCIDENTAL_DELETE/);
});
