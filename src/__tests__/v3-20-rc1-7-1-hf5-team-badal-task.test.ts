import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findTeamTeachingTasksForTeacher, isAssignedTeamCoverage } from "../domain/schedule/teamTeachingTask.ts";

const date = "2026-11-09";
const team = {
  kelas: "10 AE 1 I", jam_ke: 3, guru1: "LALU", guru2: "HAIKAL",
  guru3: "ARIA", guru4: "ALI", guru5: "", guru6: "", isActive: true,
};
const badal = {
  id: "coverage-lalu", tanggal: date, kelas: team.kelas, jam_ke: 3,
  guru_izin: "LALU", guru_pengganti: "YADIQ", coverage_status: "ASSIGNED",
  source: "LEAVE_WORKFLOW", tugas: "Kerjakan latihan 1–5 dan pelajari materi Bab 3",
  mapel: "Bahasa Arab", alasan: "Izin",
};
const noSub = {
  ...badal, id: "coverage-no-sub", guru_pengganti: "", coverage_status: "NO_SUBSTITUTE",
};
const find = (teacherName: string, logs: any[] = [badal], slots: any[] = [team], period = 3, requestedDate = date) =>
  findTeamTeachingTasksForTeacher({ date: requestedDate, period, teacherName, effectiveClasses: slots, coverageLogs: logs });

test("HF5: every available team member gets the same assigned coverage task", () => {
  for (const name of ["HAIKAL", "ARIA", "ALI"]) {
    assert.deepEqual(find(name).map(item => item.id), ["coverage-lalu"]);
    assert.equal(find(name)[0].tugas, badal.tugas);
  }
  assert.equal(find("LALU").length, 0, "absent teacher must not appear as an active peer");
  assert.equal(find("YADIQ").length, 0, "substitute sees the task through their original badal card");
  assert.equal(find("GURU LAIN").length, 0);
});

test("HF5: date, period, class and effective membership all must agree", () => {
  assert.equal(find("HAIKAL", [badal], [team], 2).length, 0);
  assert.equal(find("HAIKAL", [badal], [team], 3, "2026-11-10").length, 0);
  assert.equal(find("HAIKAL", [{ ...badal, kelas: "10 AE 2 I" }]).length, 0);
  assert.equal(find("HAIKAL", [badal], [{ ...team, kelas: "10 AE 1 A" }]).length, 0);
  assert.equal(find("HAIKAL", [badal], [{ ...team, guru2: "NURIN" }]).length, 0);
  assert.equal(find("HAIKAL", [badal], [{ ...team, isActive: false }]).length, 0);
  assert.equal(find("HAIKAL", [badal], [{ ...team, isSuppressedByAcademicCalendar: true }]).length, 0);
});

test("HF5: cancelled, expired and waiting are not shared as assigned tasks", () => {
  for (const status of ["WAITING", "CANCELLED", "EXPIRED", "PENDING"]) {
    assert.equal(find("HAIKAL", [{ ...badal, coverage_status: status }]).length, 0, status);
  }
  assert.equal(find("HAIKAL", [{ ...badal, guru_pengganti: "" }]).length, 0);
  assert.equal(isAssignedTeamCoverage({ ...badal, guru_pengganti: "LALU" }), false);
  assert.equal(find("HAIKAL", [{ ...badal, coverage_status: undefined }]).length, 0);
});

test("HF5: the existing verified NO_SUBSTITUTE task sharing is preserved", () => {
  assert.equal(find("HAIKAL", [noSub]).length, 1);
  assert.equal(find("HAIKAL", [{ ...noSub, source: "IMPORT_LEGACY" }]).length, 0);
  assert.equal(find("HAIKAL", [{ ...noSub, guru_pengganti: "YADIQ" }]).length, 0);
});

test("HF5: a second absent team member cannot read another teacher's task as available peer", () => {
  const ariaAbsent = { ...badal, id: "coverage-aria", guru_izin: "ARIA", guru_pengganti: "SALMAN" };
  assert.equal(find("ARIA", [badal, ariaAbsent]).length, 0);
  assert.equal(find("HAIKAL", [badal, ariaAbsent]).length, 2);
});

test("HF5: a replaced or cancelled team cannot inherit stale assignments", () => {
  assert.equal(find("HAIKAL", [badal], [{ ...team, teacherTeamReplaced: true, guru1: "SAIF" }]).length, 0);
  assert.equal(find("HAIKAL", [badal], [{ ...team, teacherTeamReplaced: true }]).length, 1);
});

test("HF5: dashboard reuses shared task, keeps regular and substitute cards separate", () => {
  const dashboard = readFileSync("src/components/Dashboard.tsx", "utf8");
  const repo = readFileSync("src/infrastructure/repositories/supabasePublicScheduleRepository.ts", "utf8");
  assert.match(dashboard, /findTeamTeachingTasksForTeacher\(\{/);
  assert.match(dashboard, /Tugas Teaching Team/);
  assert.match(dashboard, /taskLabel: isAcknowledgedTeamTeachingCoverage\(coverage\)/);
  assert.match(dashboard, /canShowSlot: \(slot\) =>/);
  assert.match(dashboard, /\{item\.isInval && \(/);
  assert.match(repo, /"learningTasks", "taskResources"/);
  assert.doesNotMatch(dashboard, /insert\s+into\s+learning_tasks/);
});
