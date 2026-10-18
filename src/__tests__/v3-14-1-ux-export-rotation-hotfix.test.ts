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
  assert.match(app, /section: "Administrasi"/); // V3.16.3: shared category metadata replaces literal desktop heading.
});

test("V3.14.1+ image export uses isolated safe clone pipeline", () => {
  assert.match(jadwalKelas, /downloadElementAsPng/);
  assert.match(jadwalKelas, /data-export-ignore="true"/);
  assert.doesNotMatch(jadwalKelas, /document\.adoptedStyleSheets\s*=\s*\[\]/);
});

test("V3.14.1 Quick Edit supports ALTERNATING class mode", () => {
  assert.match(quickEdit, /Pelajaran Bergantian \/ Rotasi/);
  // RC3.4.3 replaced hardcoded dropdown options with searchable generated options.
  // Assert supported frequencies and the displayed label template, not 3 literal copies.
  assert.match(quickEdit, /\[2,\s*3,\s*4\]\.map/);
  assert.match(quickEdit, /label:\s*`1 kali \/ \$\{weeks\} minggu`/);
  assert.match(quickEdit, /rotationEveryWeeks/);
  assert.match(quickEdit, /ALTERNATING/);
  assert.match(repo, /ejadwal_update_schedule_master_v4/);
  assert.match(repo, /ejadwal_upsert_schedule_incidental_session_v[23]/);
  assert.match(migration, /p_class_mode text/);
});
