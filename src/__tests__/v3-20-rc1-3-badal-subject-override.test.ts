import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { expandInvalSessionRowsForPersistence } from "../domain/inval/sessionGrouping";
import { buildInvalWriteBundle } from "../domain/inval/invalWrite";
import { buildRecommendationDependencyKey } from "../domain/inval/recommendationPerformance";
import type { Teacher } from "../domain/models";

const teachers = [
  { id: "11111111-1111-1111-1111-111111111111", nama: "Syaikh", gender: "IKHWAN", mapel_utama: "Tahsin", rumpun: "Tahsin", jenjang: "SD" },
  { id: "22222222-2222-2222-2222-222222222222", nama: "Guru B", gender: "IKHWAN", mapel_utama: "Al-Qur'an", rumpun: "Qur'an", jenjang: "SD" },
] as Teacher[];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = (relative: string) => readFileSync(resolve(root, relative), "utf8");
const sample = () => ({
  tanggal: "2026-10-23", guruIzin: "Syaikh", alasan: "Izin",
  rows: [{ jam_ke: 2, kelas: "08 AE 1 I + 08 AE 2 I", mapel: "Tahsin Syaikh",
    subjectOverride: "Al-Qur'an", selectedPengganti: "Guru B", targetSlots: [
      { kelas: "08 AE 1 I", mapel: "Tahsin Syaikh" },
      { kelas: "08 AE 2 I", mapel: "Tahsin Syaikh" },
    ],
  }],
});

test("RC1.3 combined class subject change expands into each real class, preserving the original marker", () => {
  const rows = expandInvalSessionRowsForPersistence(sample());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((item) => item.log.mapel), ["Al-Qur'an", "Al-Qur'an"]);
  assert.deepEqual(rows.map((item) => item.subjectOverride), [
    { originalSubject: "Tahsin Syaikh", subject: "Al-Qur'an" },
    { originalSubject: "Tahsin Syaikh", subject: "Al-Qur'an" },
  ]);
  assert.deepEqual(rows.map((item) => item.log.kelas), ["08 AE 1 I", "08 AE 2 I"]);
});

test("RC1.3 unchanged subjects have no incidental-change marker", () => {
  const data = sample();
  delete (data.rows[0] as { subjectOverride?: string }).subjectOverride;
  const rows = expandInvalSessionRowsForPersistence(data);
  assert.equal(rows.every((item) => item.subjectOverride === null), true);
  assert.equal(rows[0]?.log.mapel, "Tahsin Syaikh");
});

test("RC1.3 explicit edited subject reaches canonical RPC payload and not absent master", () => {
  const expanded = expandInvalSessionRowsForPersistence(sample());
  const bundle = buildInvalWriteBundle({
    logs: expanded.map((item) => item.log), teachers, constraints: [],
    metadata: { subjectOverridesByRow: expanded.map((item) => item.subjectOverride) },
  });
  assert.equal(bundle.rows.length, 2);
  assert.equal(bundle.rows[0]?.subject, "Al-Qur'an");
  assert.equal(bundle.rows[0]?.original_subject, "Tahsin Syaikh");
  assert.equal(bundle.rows[1]?.class_code, "08 AE 2 I");
});

test("RC1.3 rejects a forged or empty subject edit before RPC", () => {
  const logs = [expandInvalSessionRowsForPersistence(sample())[0]!.log];
  assert.throws(() => buildInvalWriteBundle({logs,teachers,constraints:[], metadata:{
    subjectOverridesByRow: [{ originalSubject: "Tahsin Syaikh", subject: "Mathematics" }],
  }}), /berubah saat proses penyimpanan/i);
  assert.throws(() => buildInvalWriteBundle({logs,teachers,constraints:[],metadata:{
    subjectOverridesByRow: [{ originalSubject: "Tahsin Syaikh", subject: "" }],
  }}), /wajib terisi/i);
});

test("RC1.3 recommendation invalidation reacts to edited subject (but not task text)", () => {
  const rows = sample().rows.map((row) => ({...row, tugas: "Halaman 2"}));
  const base = buildRecommendationDependencyKey(rows);
  assert.notEqual(base, buildRecommendationDependencyKey(rows.map((row) => ({...row,subjectOverride: "Tahsin"}))));
  assert.equal(base, buildRecommendationDependencyKey(rows.map((row) => ({...row,tugas: "Halaman 999"}))));
});

test("RC1.3 UI exposes manual subject editor only on general admin input route", () => {
  const ui = src("src/components/InputGuruPengganti.tsx");
  assert.match(ui, /Edit Mapel/);
  assert.match(ui, /!approvedWaitingSession && !officialDutySlots && !readOnlyPreview && row\.jam_ke > 0/);
  assert.match(ui, /subjectOverridesByRow: expandedRows\.map/);
  assert.match(ui, /Mapel asli:/);
});

test("RC1.3 atomic database RPC guards concurrency, updates effective subject, and audits", () => {
  const sql = src("supabase/migrations/202610230002_v3_20_rc1_3_badal_subject_override.sql");
  assert.match(sql, /ejadwal_save_inval_bundle_v319_rc42\(/);
  assert.match(sql, /BADAL_SUBJECT_STALE_REFRESH_REQUIRED/);
  assert.match(sql, /update public\.schedule_incidentals[\s\S]*?set override_subject = v_desired/);
  assert.match(sql, /update public\.coverage_slots[\s\S]*?subject_snapshot = v_desired/);
  assert.match(sql, /insert into public\.audit_logs/);
  assert.match(sql, /ADMIN_OR_WAKASEK_REQUIRED/);
  assert.doesNotMatch(sql, /update public\.schedule_master/i);
  assert.doesNotMatch(sql, /delete from public\.schedule_incidental_teacher_overrides/i);
});
