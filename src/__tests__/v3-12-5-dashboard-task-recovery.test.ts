import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isTaskRecoveryDateActive } from "../domain/date";

test("dashboard recombines canonical badal rows into one inferred teaching session", () => {
  const source = readFileSync("src/components/Dashboard.tsx", "utf8");
  assert.match(source, /teachingSessionSignature/);
  assert.match(source, /inval-session-/);
  assert.match(source, /kelasgabung: logsInSession\.length > 1/);
});

test("dashboard offers WhatsApp task request when substitute task is missing", () => {
  const source = readFileSync("src/components/Dashboard.tsx", "utf8");
  assert.match(source, /Minta Tugas via WhatsApp/);
  assert.match(source, /wa\.me/);
  assert.match(source, /buildTaskRequestWhatsappMessage/);
});

test("leave request visually distinguishes FREE periods", () => {
  const source = readFileSync("src/components/LeaveRequestForm.tsx", "utf8");
  assert.match(source, /border-sky-500 bg-sky-100/);
  assert.match(source, /JP FREE • Statistik/);
});

test("decline flow requires a note and opens a WhatsApp handoff modal", () => {
  const source = readFileSync("src/components/LeaveApprovalAdmin.tsx", "utf8");
  assert.match(source, /wajib jika ditolak/i);
  assert.match(source, /setDeclineHandoff/);
  assert.match(source, /Buka WhatsApp/);
  assert.match(source, /Pengajuan Ditolak/);
});

test("late task menu is conditional and has cross-device recovery", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const page = readFileSync("src/components/LateTaskCompletion.tsx", "utf8");
  assert.match(app, /missingTeacherTaskCount/);
  assert.match(app, /lengkapi-tugas/);
  assert.match(page, /4 digit terakhir WhatsApp/i);
  assert.match(page, /Kirim Tugas ke Badal/);
});

test("V3.12.5 SQL preserves approved upload tokens and syncs late tasks to coverage", () => {
  const sql = readFileSync("supabase/migrations/202610090026_v3_12_5_dashboard_task_recovery.sql", "utf8");
  assert.match(sql, /ejadwal_preserve_task_upload_after_approval/);
  assert.match(sql, /status in \('SUBMITTED', 'APPROVED'\)/);
  assert.match(sql, /ejadwal_sync_leave_task_to_coverage/);
  assert.match(sql, /ejadwal_recover_public_task_upload/);
  assert.match(sql, /ejadwal_complete_public_leave_task/);
});


test("V3.12.5.1 removes expired missing tasks from the actionable queue", () => {
  assert.equal(isTaskRecoveryDateActive("2026-10-08", "2026-10-09"), false);
  assert.equal(isTaskRecoveryDateActive("2026-10-09", "2026-10-09"), true);
  assert.equal(isTaskRecoveryDateActive("2026-10-10", "2026-10-09"), true);
  const app = readFileSync("src/App.tsx", "utf8");
  const page = readFileSync("src/components/LateTaskCompletion.tsx", "utf8");
  assert.match(app, /isTaskRecoveryDateActive\(log\.tanggal, schoolToday\)/);
  assert.match(page, /isTaskRecoveryDateActive\(log\.tanggal, schoolToday\)/);
});

test("V3.12.5.1 gives the absent teacher a direct WhatsApp shortcut to the substitute", () => {
  const page = readFileSync("src/components/LateTaskCompletion.tsx", "utf8");
  assert.match(page, /Hubungi Guru Badal/);
  assert.match(page, /openSubstituteWhatsapp/);
  assert.match(page, /wa\.me/);
  assert.match(page, /guru_pengganti/);
});
