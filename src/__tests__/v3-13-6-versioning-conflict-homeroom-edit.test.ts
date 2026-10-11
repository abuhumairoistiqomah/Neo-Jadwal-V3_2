import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { detectScheduleConflicts } from "../domain/scheduleConflicts";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";

const schedule = (overrides: Partial<ScheduleItem>): ScheduleItem => ({
  id: overrides.id || crypto.randomUUID(),
  kelas: overrides.kelas || "05 INTER 1 I",
  hari: overrides.hari || "Rabu",
  jam_ke: overrides.jam_ke ?? 3,
  mulai: overrides.mulai || "10:00",
  selesai: overrides.selesai || "11:00",
  mapel: overrides.mapel || "Math",
  guru1: overrides.guru1 || "Guru A",
  guru2: overrides.guru2 || "",
  guru3: overrides.guru3 || "",
  guru4: overrides.guru4 || "",
  guru5: overrides.guru5 || "",
  guru6: overrides.guru6 || "",
  kelasgabung: overrides.kelasgabung || "Tidak",
  ruangan: overrides.ruangan || "R-1",
  keterangan_khusus: overrides.keterangan_khusus || "",
});

const incidental = (overrides: Partial<JadwalInsidentalItem>): JadwalInsidentalItem => ({
  id: overrides.id || crypto.randomUUID(),
  tanggal: overrides.tanggal || "2026-10-14",
  kelas: overrides.kelas || "05 INTER 1 I",
  jam_ke: overrides.jam_ke ?? 3,
  mapel: overrides.mapel || "Science",
  guru1: overrides.guru1 || "Guru B",
  guru2: overrides.guru2 || "",
  guru3: overrides.guru3 || "",
  guru4: overrides.guru4 || "",
  guru5: overrides.guru5 || "",
  guru6: overrides.guru6 || "",
  ruangan: overrides.ruangan || "R-2",
});

test("inferred combined rows do not become false teacher conflicts", () => {
  const conflicts = detectScheduleConflicts([
    schedule({ id: "a", kelas: "05 INTER 1 I", guru1: "Guru A", mapel: "Math", ruangan: "R-1" }),
    schedule({ id: "b", kelas: "05 MQ IKHWAN", guru1: "Guru A", mapel: "Math", ruangan: "R-1" }),
  ]);
  assert.equal(conflicts.some((item) => item.kind === "TEACHER"), false);
  assert.equal(conflicts.some((item) => item.kind === "ROOM"), false);
});

test("detects real teacher conflict as warning", () => {
  const conflicts = detectScheduleConflicts([
    schedule({ id: "a", kelas: "05 INTER 1 I", guru1: "Guru A", mapel: "Math", ruangan: "R-1" }),
    schedule({ id: "b", kelas: "06 INTER 1 I", guru1: "Guru A", mapel: "Science", ruangan: "R-2" }),
  ]);
  const conflict = conflicts.find((item) => item.kind === "TEACHER");
  assert.equal(conflict?.severity, "WARNING");
});

test("detects room conflict as blocker", () => {
  const conflicts = detectScheduleConflicts([
    schedule({ id: "a", kelas: "05 INTER 1 I", guru1: "Guru A", mapel: "Math", ruangan: "AULA" }),
    schedule({ id: "b", kelas: "06 INTER 1 I", guru1: "Guru B", mapel: "Science", ruangan: "AULA" }),
  ]);
  const conflict = conflicts.find((item) => item.kind === "ROOM");
  assert.equal(conflict?.severity, "BLOCKER");
});

test("detects incidental teacher overlap against recurring master", () => {
  const conflicts = detectScheduleConflicts([
    schedule({ id: "a", kelas: "06 INTER 1 I", hari: "Rabu", jam_ke: 3, guru1: "Guru B", mapel: "Science", ruangan: "R-6" }),
  ], [
    incidental({ id: "i", tanggal: "2026-10-14", kelas: "05 INTER 1 I", jam_ke: 3, guru1: "Guru B", mapel: "Math", ruangan: "R-5" }),
  ]);
  assert.ok(conflicts.some((item) => item.kind === "INCIDENTAL" && item.severity === "WARNING"));
});

test("V3.13.6 wires history, rollback and wali-kelas quick edit", () => {
  const root = path.resolve(process.cwd());
  const migration = fs.readFileSync(path.join(root, "supabase/migrations/202610100042_v3_13_6_schedule_versioning.sql"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(root, "src/components/Dashboard.tsx"), "utf8");
  assert.match(migration, /create table if not exists public\.schedule_versions/i);
  assert.match(migration, /ejadwal_rollback_schedule_version_v1/i);
  assert.match(migration, /capture_schedule_version_from_audit/i);
  assert.match(app, /Versi & Konflik Jadwal/);
  assert.match(app, /ScheduleControlCenter/);
  assert.match(dashboard, /Quick Edit jadwal kelas — permanen atau hanya tanggal ini/);
  assert.match(dashboard, /initialDate: selectedDate/);
});
