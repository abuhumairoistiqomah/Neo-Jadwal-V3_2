import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildApprovedLeaveOperatorRows, matchApprovedWaitingAssignments } from "../domain/inval/approvedLeaveSelection";
import { expandInvalSessionRowsForPersistence } from "../domain/inval/sessionGrouping";
import type { WaitingBadalSession, WaitingCoverageRow } from "../domain/leaveApproval";

const session: WaitingBadalSession = {
  key: "req|date|2", leaveRequestId: "request-id", requestCode: "IZN-2026-14",
  scheduleDate: "2026-10-23", period: 2,
  classCodes: ["08 AE 1 I", "08 AE 2 I"], classLabel: "08 AE 1 I + 08 AE 2 I",
  subject: "Tahsin Syaikh", absentTeacherId: "teacher-id", absentTeacherName: "Syaikh Ali",
  reason: "Kegiatan Sekolah", coverageSlotIds: ["coverage-1", "coverage-2"],
  createdAt: "", isCombinedSession: true, taskText: "Materi asli tetap", taskUrls: [],
};
const waiting: WaitingCoverageRow[] = session.classCodes.map((cls, index) => ({
  id: session.coverageSlotIds[index]!, leaveRequestId: session.leaveRequestId,
  requestCode: session.requestCode, scheduleDate: session.scheduleDate,
  period: session.period, classCode: cls, subject: session.subject,
  absentTeacherId: session.absentTeacherId, absentTeacherName: session.absentTeacherName,
  reason: session.reason, status: "WAITING", source: "LEAVE_WORKFLOW", createdAt: "",
  taskText: session.taskText, taskUrls: [],
}));
function proposed(override?: string) {
  const [operatorRow] = buildApprovedLeaveOperatorRows(session);
  return expandInvalSessionRowsForPersistence({
    rows: [{...operatorRow, selectedPengganti: "Guru Badal", subjectOverride: override}],
    tanggal: session.scheduleDate, guruIzin: session.absentTeacherName,
    alasan: session.reason,
  });
}

test("RC1.4 approved Waiting combined session edits each concrete class, no new leave", () => {
  const expanded = proposed("Al-Qur'an");
  assert.equal(expanded.length, 2);
  const assignments = matchApprovedWaitingAssignments(
    session, waiting, expanded.map((item) => item.log),
    expanded.map((item) => item.subjectOverride),
  );
  assert.deepEqual(assignments.map((entry) => entry.coverageSlotId), session.coverageSlotIds);
  assert.deepEqual(assignments.map((entry) => entry.expectedSubject), ["Tahsin Syaikh", "Tahsin Syaikh"]);
  assert.deepEqual(assignments.map((entry) => entry.subject), ["Al-Qur'an", "Al-Qur'an"]);
});

test("RC1.4 unchanged subject keeps original Waiting assignment behavior", () => {
  const expanded = proposed();
  assert.equal(expanded.every((entry) => entry.subjectOverride === null), true);
  assert.deepEqual(matchApprovedWaitingAssignments(session, waiting, expanded.map((item) => item.log)).map((entry) => entry.subject),
    ["Tahsin Syaikh", "Tahsin Syaikh"]);
});

test("RC1.4 forged or out-of-order subject marker is rejected", () => {
  const expanded = proposed("Al-Qur'an");
  const logs = expanded.map((entry) => entry.log);
  const subjects = expanded.map((entry) => entry.subjectOverride);
  assert.throws(() => matchApprovedWaitingAssignments(session, waiting, logs,
    [{ originalSubject: "Wrong", subject: "Al-Qur'an" }, subjects[1]!]), /Perubahan mapel/);
  assert.throws(() => matchApprovedWaitingAssignments(session, waiting, logs,
    [{ originalSubject: "Tahsin Syaikh", subject: "Tahsin" }, subjects[1]!]), /Perubahan mapel/);
  assert.throws(() => matchApprovedWaitingAssignments(session, waiting, logs, [subjects[0]!]), /Jumlah perubahan/);
  assert.throws(() => matchApprovedWaitingAssignments(session, waiting, logs, []), /tidak sesuai/);
  assert.throws(() => matchApprovedWaitingAssignments(session, waiting.map((item) => ({...item,status: "ASSIGNED"})), logs, subjects), /berubah/);
});

test("RC1.4 no JP0 subject override or overlength subject", () => {
  const expanded = proposed("A".repeat(121));
  assert.throws(() => matchApprovedWaitingAssignments(session, waiting,
    expanded.map((entry) => entry.log),expanded.map((entry) => entry.subjectOverride)), /tidak sesuai/);
  const zero = { ...session, period: 0 };
  const rows = waiting.map((item) => ({ ...item, period: 0 }));
  const logs = proposed("Arabic").map((entry) => ({ ...entry.log, jam_ke: 0 }));
  const markers = proposed("Arabic").map((entry) => entry.subjectOverride);
  assert.throws(() => matchApprovedWaitingAssignments(zero, rows, logs, markers), /tidak sesuai/);
});

test("RC1.4 Waiting UI exposes edit mapel while official duty remains locked", () => {
  const ui = readFileSync("src/components/InputGuruPengganti.tsx", "utf8");
  const admin = readFileSync("src/components/LeaveApprovalAdmin.tsx", "utf8");
  const repo = readFileSync("src/infrastructure/repositories/supabaseInvalWriteRepository.ts", "utf8");
  assert.match(ui, /!officialDutySlots && !readOnlyPreview && row\.jam_ke > 0/);
  assert.doesNotMatch(ui, /!approvedWaitingSession && !officialDutySlots && !readOnlyPreview && row\.jam_ke > 0/);
  assert.match(ui, /subjectOverridesByRow: expandedRows\.map/);
  assert.match(admin, /matchApprovedWaitingAssignments\([\s\S]*metadata\?\.subjectOverridesByRow/);
  assert.match(admin, /assignmentRepository\.assignApprovedWaitingSession/);
  assert.doesNotMatch(admin, /assignmentRepository\.replaceSubstitute/);
  assert.match(repo, /ejadwal_assign_waiting_badal_v320_rc14/);
  assert.match(repo, /expected_subject: entry\.expectedSubject/);
});

test("RC1.4 DB RPC validates approval, protects existing leave, and writes atomic dated subjects", () => {
  const sql = readFileSync("supabase/migrations/202610230003_v3_20_rc1_4_waiting_approved_subject_override.sql", "utf8");
  assert.match(sql, /ejadwal_assign_waiting_badal_v320_rc14/);
  assert.match(sql, /APPROVED_LEAVE_REQUIRED/);
  assert.match(sql, /APPROVED_WAITING_COVERAGE_REQUIRED/);
  assert.match(sql, /WAITING_SESSION_INCOMPLETE_REFRESH_REQUIRED/);
  assert.match(sql, /ejadwal_replace_inval_substitute_v1\(/);
  assert.match(sql, /BADAL_SUBJECT_STALE_REFRESH_REQUIRED/);
  assert.match(sql, /update public\.coverage_slots[\s\S]*subject_snapshot = v_desired/);
  assert.match(sql, /update public\.schedule_incidentals[\s\S]*override_subject = v_desired/);
  assert.match(sql, /insert into public\.audit_logs/);
  assert.match(sql, /ADMIN_OR_WAKASEK_REQUIRED/);
  assert.doesNotMatch(sql, /insert into public\.leave_requests/i);
  assert.doesNotMatch(sql, /insert into public\.coverage_slots/i);
  assert.doesNotMatch(sql, /update public\.schedule_master/i);
});
