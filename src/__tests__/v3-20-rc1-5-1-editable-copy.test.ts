import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { previewIncidentalCopy } from "../domain/schedule/incidentalCopy";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";

const date = "2026-10-26";
const source: JadwalInsidentalItem = {
  id: "source-slot", tanggal: date, kelas: "12 AE 1", jam_ke: 4,
  mapel: "Mata Pelajaran Pilihan 1", guru1: "GURU SUMBER A", guru2: "GURU SUMBER B",
  guru3: "", guru4: "", guru5: "", guru6: "", ruangan: "R1", kelasgabung: "Tidak",
  keterangan_khusus: "Pendalaman TKA", replaceTeachers: true,
};
const targetMaster: ScheduleItem = {
  id: "master-target", hari: "Senin", kelas: "12 AE 2", jam_ke: 4,
  mulai: "13:00", selesai: "14:00", mapel: "Bahasa Inggris", guru1: "GURU TUJUAN",
  guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", ruangan: "R2", kelasgabung: "Tidak",
};
const basic = {
  date, sourceClass: "12 AE 1", periods: [4], targetClasses: ["12 AE 2"],
  incidentals: [source], schedules: [targetMaster], overwriteExisting: false,
};

test("RC1.5.1: copy from source into an already scheduled target includes source teachers by default", () => {
  const [preview] = previewIncidentalCopy({ ...basic, copySourceTeam: true });
  assert.equal(preview.status, "READY_EXISTING_MASTER");
  assert.match(preview.explanation, /tim guru sumber/i);
  assert.match(preview.explanation, /ruangan master tujuan tetap/i);
});

test("RC1.5.1: previous keep-target-teacher mode remains selectable", () => {
  const [preview] = previewIncidentalCopy({ ...basic, copySourceTeam: false });
  assert.equal(preview.status, "READY_EXISTING_MASTER");
  assert.match(preview.explanation, /master tujuan/i);
});

test("RC1.5.1: no-master class requires explicit team copy", () => {
  const input = { ...basic, targetClasses: ["12 MQ IKHWAN"], schedules: [] as ScheduleItem[] };
  assert.equal(previewIncidentalCopy({ ...input, copySourceTeam: false })[0].status, "BLOCKED_NO_TEACHER");
  assert.equal(previewIncidentalCopy({ ...input, copySourceTeam: true })[0].status, "READY_EMPTY_SLOT");
});

test("RC1.5.1: existing copied incidental requires explicit overwrite, never duplicates", () => {
  const oldCopy = { ...source, id: "old-target-copy", kelas: "12 AE 2", tipe_insidental: "COPY_INCIDENTAL_RC15" };
  const input = { ...basic, incidentals: [source, oldCopy], copySourceTeam: true };
  assert.equal(previewIncidentalCopy(input)[0].status, "BLOCKED_EXISTS");
  const [overwrite] = previewIncidentalCopy({ ...input, overwriteExisting: true });
  assert.equal(overwrite.status, "WILL_REPLACE_INCIDENTAL");
  assert.match(overwrite.explanation, /tim guru sumber/i);
});

test("RC1.5.1: no teacher in source is blocked before save", () => {
  const noTeam = { ...source, guru1: "", guru2: "" };
  const [row] = previewIncidentalCopy({ ...basic, incidentals: [noTeam], copySourceTeam: true });
  assert.equal(row.status, "BLOCKED_NO_TEACHER");
});

test("RC1.5.1: admin receives copied IDs for an editable filtered list", () => {
  const repo = readFileSync("src/infrastructure/repositories/scheduleAdminRepository.ts", "utf8");
  const panel = readFileSync("src/components/IncidentalCopyPanel.tsx", "utf8");
  const admin = readFileSync("src/components/IncidentalScheduleAdmin.tsx", "utf8");
  assert.match(repo, /ejadwal_copy_incidental_lessons_v320_rc15(?:1|2)/);
  assert.match(repo, /incidentalIds/);
  assert.match(panel, /onCopied\(response\.incidentalIds\)/);
  assert.match(admin, /copiedIncidentalIds/);
  assert.match(admin, /Lihat hasil salin/);
  assert.match(admin, /setTeacherIds\(names\.map/);
  assert.match(admin, /actualMaster \|\| row/);
});

test("RC1.5.1: SQL copy is admin-only, atomic, audited, editable and never copies the room", () => {
  const sql = readFileSync("supabase/migrations/202610230005_v3_20_rc1_5_1_editable_incidental_copy.sql", "utf8");
  assert.match(sql, /ADMIN_OR_WAKASEK_REQUIRED/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /p_copy_source_team/);
  assert.match(sql, /delete from public\.schedule_incidental_teacher_overrides/);
  assert.match(sql, /COPY_TARGET_HAS_ACTIVE_BADAL/);
  assert.match(sql, /COPY_INCIDENTAL_LESSON_RC151/);
  assert.match(sql, /'incidental_ids', to_jsonb\(v_saved_ids\)/);
  assert.doesNotMatch(sql, /update public\.schedule_master\b/i);
  assert.doesNotMatch(sql, /override_room_id\s*=/i);
});
