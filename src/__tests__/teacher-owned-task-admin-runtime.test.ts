import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPublicLeaveSubmission, type LeaveRequestPeriodDraft } from "../domain/leaveRequest";

const teachingSlot: LeaveRequestPeriodDraft = {
  key: "2026-10-12|JP2",
  scheduleDate: "2026-10-12",
  period: 2,
  periodType: "TEACHING",
  classCode: "06 INTER 1 I",
  subject: "Mathematics",
  startTime: "08:40",
  endTime: "09:40",
  source: "MASTER",
  assignments: [{ classCode: "06 INTER 1 I", subject: "Mathematics", source: "MASTER" }],
  isCombinedSession: false,
};

const freeSlot: LeaveRequestPeriodDraft = {
  key: "2026-10-12|JP3",
  scheduleDate: "2026-10-12",
  period: 3,
  periodType: "FREE",
  classCode: "JAM KOSONG",
  subject: "Tidak ada jadwal mengajar",
  startTime: "09:40",
  endTime: "10:40",
  source: "FREE",
  assignments: [],
  isCombinedSession: false,
};

test("teacher-owned leave payload carries text/link only on selected TEACHING periods", () => {
  const payload = buildPublicLeaveSubmission({
    teacherName: "Mr Is",
    scheduleDate: "2026-10-12",
    requestType: "PARTIAL",
    reason: "Keperluan keluarga",
    slots: [teachingSlot, freeSlot],
    tasks: [{
      period: 2,
      description: "Kerjakan halaman 35–37",
      resources: [{ resource_type: "LINK", label: "Classroom", url: "https://classroom.google.com/x" }],
    }],
  });

  assert.deepEqual(payload.p_tasks, [{
    period: 2,
    description: "Kerjakan halaman 35–37",
    resources: [{ resource_type: "LINK", label: "Classroom", url: "https://classroom.google.com/x" }],
  }]);
  assert.equal(payload.p_tasks.some((task) => task.period === 3), false);
});

test("task on FREE period is rejected", () => {
  assert.throws(() => buildPublicLeaveSubmission({
    teacherName: "Mr Is",
    scheduleDate: "2026-10-12",
    requestType: "PARTIAL",
    reason: "Keperluan keluarga",
    slots: [teachingSlot, freeSlot],
    tasks: [{ period: 3, description: "Should not exist" }],
  }), /JP mengajar/i);
});

test("V3.12.4 SQL owns tasks at leave request and preserves them through approval/assignment", () => {
  const sql = readFileSync("supabase/migrations/202610090024_v3_12_4_teacher_owned_tasks_admin_supabase.sql", "utf8");
  assert.match(sql, /create table if not exists public\.leave_request_tasks/i);
  assert.match(sql, /ejadwal_submit_public_leave_request_v3/i);
  assert.match(sql, /ejadwal_validate_public_task_upload/i);
  assert.match(sql, /Copy the teacher-owned JP task to every concrete class coverage row/i);
  assert.match(sql, /ejadwal_save_inval_bundle_v3/i);
  assert.match(sql, /source = 'LEAVE_WORKFLOW'/i);
});

test("admin shell has scrollable navigation and Supabase runtime paths", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert.match(app, /overflow-y-auto overscroll-contain/);
  assert.match(app, /refreshFromSupabase/);
  assert.match(app, /signInWithPassword/);
  assert.match(app, /Admin never bootstraps from Apps Script/);
});

test("public Drive upload branch runs before any legacy Spreadsheet open in doPost", () => {
  const code = readFileSync("Code.gs", "utf8");
  const postStart = code.indexOf("function doPost(e)");
  const upload = code.indexOf('postData.action === "upload_leave_task_file"', postStart);
  const sheetOpen = code.indexOf("const ss = getSpreadsheet();", upload);
  assert.ok(postStart >= 0 && upload > postStart && sheetOpen > upload);
  assert.match(code.slice(upload, sheetOpen), /ejadwal_validate_public_task_upload/);
  assert.match(code.slice(upload, sheetOpen), /ejadwal_attach_public_leave_task_file/);
});
