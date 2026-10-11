import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quickEdit = fs.readFileSync(new URL("../components/ScheduleQuickEditor.tsx", import.meta.url), "utf8");
const repo = fs.readFileSync(new URL("../infrastructure/repositories/scheduleAdminRepository.ts", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const jadwalKelas = fs.readFileSync(new URL("../components/JadwalKelas.tsx", import.meta.url), "utf8");
const analytics = fs.readFileSync(new URL("../components/ManagementAnalytics.tsx", import.meta.url), "utf8");
const leaveRepo = fs.readFileSync(new URL("../infrastructure/repositories/supabaseLeaveApprovalRepository.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../supabase/migrations/202610100046_v3_14_1_ux_export_rotation_hotfix.sql", import.meta.url), "utf8");

test("V3.14.1 restores stale Waiting List RPC and keeps browser fallback", () => {
  assert.match(migration, /ejadwal_expire_stale_waiting_coverage/);
  assert.match(leaveRepo, /isMissingRpcError/);
  assert.match(leaveRepo, /\.gte\("schedule_date", schoolToday\)/);
});

test("V3.14.1 renders human-readable Supabase errors", () => {
  assert.match(analytics, /getErrorMessage/);
  assert.doesNotMatch(analytics, /String\(err\)/);
});

test("V3.14.1 prioritizes teacher-accessible navigation before administration", () => {
  assert.ok(app.indexOf('id: "jadwal-kelas"') < app.indexOf('id: "approval-izin"'));
  assert.match(app, />Administrasi<\/div>/);
});

test("V3.14.1+ image export uses isolated safe clone pipeline", () => {
  assert.match(jadwalKelas, /downloadElementAsPng/);
  assert.match(jadwalKelas, /data-export-ignore="true"/);
  assert.doesNotMatch(jadwalKelas, /document\.adoptedStyleSheets\s*=\s*\[\]/);
});

test("V3.14.1 Quick Edit supports ALTERNATING class mode", () => {
  assert.match(quickEdit, /Pelajaran Bergantian \/ Rotasi/);
  assert.match(quickEdit, /1 kali \/ 2 minggu/);
  assert.match(quickEdit, /1 kali \/ 3 minggu/);
  assert.match(quickEdit, /1 kali \/ 4 minggu/);
  assert.match(quickEdit, /ALTERNATING/);
  assert.match(repo, /ejadwal_update_schedule_master_v4/);
  assert.match(repo, /ejadwal_upsert_schedule_incidental_session_v2/);
  assert.match(migration, /p_class_mode text/);
});
