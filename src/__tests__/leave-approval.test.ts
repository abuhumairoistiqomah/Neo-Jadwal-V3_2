import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildBadalProcessingUrl,
  groupWaitingBadalRows,
  summarizeLeaveRequest,
  type LeaveReviewRequest,
  type WaitingCoverageRow,
} from "../domain/leaveApproval";

function waiting(overrides: Partial<WaitingCoverageRow> = {}): WaitingCoverageRow {
  return {
    id: "cov-1",
    leaveRequestId: "leave-1",
    requestCode: "IZN-20261008-ABC123",
    scheduleDate: "2026-10-09",
    period: 3,
    classCode: "05 INTER 2",
    subject: "Al-Qur'an",
    absentTeacherId: "teacher-1",
    absentTeacherName: "Ustadz A",
    reason: "Keperluan keluarga",
    status: "WAITING",
    source: "LEAVE_WORKFLOW",
    createdAt: "2026-10-08T10:00:00Z",
    taskText: "",
    taskUrls: [],
    ...overrides,
  };
}

test("waiting list recombines inferred combined classes into one operator session", () => {
  const grouped = groupWaitingBadalRows([
    waiting(),
    waiting({ id: "cov-2", classCode: "05 MQ IKHWAN" }),
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].classLabel, "05 INTER 2 + 05 MQ IKHWAN");
  assert.equal(grouped[0].coverageSlotIds.length, 2);
  assert.equal(grouped[0].isCombinedSession, true);
});

test("waiting list keeps different subjects as distinct sessions", () => {
  const grouped = groupWaitingBadalRows([
    waiting(),
    waiting({ id: "cov-2", classCode: "05 MQ IKHWAN", subject: "Tahsin" }),
  ]);
  assert.equal(grouped.length, 2);
});

test("leave review summary keeps FREE periods separate from teaching coverage", () => {
  const request: LeaveReviewRequest = {
    id: "leave-1",
    requestCode: "IZN-1",
    teacherId: "teacher-1",
    teacherName: "Guru A",
    scheduleDate: "2026-10-09",
    requestType: "PARTIAL",
    reason: "Izin",
    detail: null,
    status: "SUBMITTED",
    submittedAt: "2026-10-08T10:00:00Z",
    periods: [
      { id: "p1", scheduleDate: "2026-10-09", period: 2, periodType: "FREE" },
      { id: "p2", scheduleDate: "2026-10-09", period: 3, periodType: "TEACHING" },
    ],
    slots: [
      { id: "s1", scheduleDate: "2026-10-09", period: 3, classCode: "05 INTER 2", subject: "Math" },
      { id: "s2", scheduleDate: "2026-10-09", period: 3, classCode: "05 MQ IKHWAN", subject: "Math" },
    ],
    tasks: [],
  };
  assert.deepEqual(summarizeLeaveRequest(request), {
    periodCount: 2,
    teachingPeriodCount: 1,
    freePeriodCount: 1,
    teachingClassCount: 2,
  });
});

test("waiting-list handoff targets Supabase Inval Write with precise JP", () => {
  const session = groupWaitingBadalRows([waiting()])[0];
  const url = new URL(buildBadalProcessingUrl(session), "https://example.test");
  assert.equal(url.searchParams.get("supabase-inval-write"), "1");
  assert.equal(url.searchParams.get("date"), "2026-10-09");
  assert.equal(url.searchParams.get("teacher"), "Ustadz A");
  assert.equal(url.searchParams.get("period"), "3");
  assert.equal(url.searchParams.get("leave"), "IZN-20261008-ABC123");
});

test("approval migration creates WAITING LEAVE_WORKFLOW only through staff decision RPC", () => {
  const sql = readFileSync(
    "supabase/migrations/202610080020_v3_12_2_leave_approval_waiting_list.sql",
    "utf8",
  );
  assert.match(sql, /current_user_is_staff\(\)/);
  assert.match(sql, /'WAITING'/);
  assert.match(sql, /'LEAVE_WORKFLOW'/);
  assert.match(sql, /leave_request_periods[\s\S]*period_type = 'TEACHING'/);
  assert.match(sql, /grant execute on function public\.ejadwal_decide_leave_request[\s\S]*to authenticated/i);
  assert.match(sql, /revoke all on function public\.ejadwal_decide_leave_request[\s\S]*from anon/i);
});
