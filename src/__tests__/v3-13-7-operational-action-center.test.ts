import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  deriveMissingTaskActions,
  filterActionableConflicts,
  summarizeOperationalActions,
} from "../domain/actionCenter";
import type { LogIzinItem } from "../domain/models";
import type { LeaveReviewRequest, WaitingBadalSession } from "../domain/leaveApproval";
import type { ScheduleConflict } from "../domain/scheduleConflicts";

const log = (overrides: Partial<LogIzinItem>): LogIzinItem => ({
  id: overrides.id || crypto.randomUUID(),
  tanggal: overrides.tanggal || "2026-10-14",
  guru_izin: overrides.guru_izin || "Guru A",
  alasan: overrides.alasan || "Dinas",
  jam_ke: overrides.jam_ke ?? 3,
  kelas: overrides.kelas || "05 INTER 1 I",
  mapel: overrides.mapel || "Math",
  guru_pengganti: overrides.guru_pengganti || "Guru B",
  tugas: overrides.tugas ?? "",
});

const pending = (date = "2026-10-14"): LeaveReviewRequest => ({
  id: "leave-1",
  requestCode: "IZN-001",
  teacherId: "teacher-a",
  teacherName: "Guru A",
  scheduleDate: date,
  requestType: "PARTIAL",
  reason: "Dinas",
  detail: null,
  status: "SUBMITTED",
  submittedAt: "2026-10-10T02:00:00Z",
  periods: [],
  slots: [],
  tasks: [],
});

const waiting = (date = "2026-10-14"): WaitingBadalSession => ({
  key: "wait-1",
  leaveRequestId: "leave-1",
  requestCode: "IZN-001",
  scheduleDate: date,
  period: 3,
  classCodes: ["05 INTER 1 I"],
  classLabel: "05 INTER 1 I",
  subject: "Math",
  absentTeacherId: "teacher-a",
  absentTeacherName: "Guru A",
  reason: "Dinas",
  coverageSlotIds: ["coverage-1"],
  createdAt: "2026-10-10T02:00:00Z",
  isCombinedSession: false,
  taskText: "",
  taskUrls: [],
});

test("V3.13.7 missing-task actions collapse combined canonical rows", () => {
  const rows = deriveMissingTaskActions([
    log({ id: "a", kelas: "05 INTER 1 I" }),
    log({ id: "b", kelas: "05 MQ IKHWAN" }),
    log({ id: "past", tanggal: "2026-10-09", kelas: "04 INTER 1 I" }),
    log({ id: "done", kelas: "06 INTER 1 I", tugas: "Worksheet" }),
  ], "2026-10-10");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classLabel, "05 INTER 1 I + 05 MQ IKHWAN");
});

test("V3.13.7 hides historical incidental conflicts but keeps recurring conflicts", () => {
  const conflicts: ScheduleConflict[] = [
    { id: "old", severity: "WARNING", kind: "INCIDENTAL", title: "Old", detail: "", dayOrDate: "2026-10-09", period: 3, classes: [], teachers: [] },
    { id: "future", severity: "BLOCKER", kind: "INCIDENTAL", title: "Future", detail: "", dayOrDate: "2026-10-14", period: 3, classes: [], teachers: [] },
    { id: "master", severity: "WARNING", kind: "TEACHER", title: "Master", detail: "", dayOrDate: "Rabu", period: 3, classes: [], teachers: [] },
  ];
  assert.deepEqual(filterActionableConflicts(conflicts, "2026-10-10").map((item) => item.id), ["future", "master"]);
});

test("V3.13.7 summary exposes operator action counts and today's urgency", () => {
  const conflict: ScheduleConflict = { id: "c", severity: "BLOCKER", kind: "ROOM", title: "Room", detail: "", dayOrDate: "Rabu", period: 3, classes: [], teachers: [] };
  const missing = deriveMissingTaskActions([log({ tanggal: "2026-10-10" })], "2026-10-10");
  const summary = summarizeOperationalActions({
    pendingRequests: [pending("2026-10-09")],
    waitingSessions: [waiting("2026-10-10")],
    missingTasks: missing,
    conflicts: [conflict],
    schoolToday: "2026-10-10",
  });
  assert.equal(summary.totalActionCount, 4);
  assert.equal(summary.urgentTodayCount, 4);
  assert.equal(summary.blockerCount, 1);
});

test("V3.13.7 wires Operational Action Center", () => {
  const root = process.cwd();
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  const component = fs.readFileSync(path.join(root, "src/components/OperationalActionCenter.tsx"), "utf8");
  assert.match(app, /id: "action-center", label: "Action Center"/);
  assert.match(app, /<OperationalActionCenter/);
  assert.match(component, /Pending Approval/);
  assert.match(component, /Waiting Badal/);
  assert.match(component, /Missing Task/);
  assert.match(component, /Conflict Alerts/);
});
