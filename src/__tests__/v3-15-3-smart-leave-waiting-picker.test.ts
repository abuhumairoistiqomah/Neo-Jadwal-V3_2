import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildApprovedLeaveOperatorRows, matchApprovedWaitingAssignments } from "../domain/inval/approvedLeaveSelection";
import type { WaitingBadalSession, WaitingCoverageRow } from "../domain/leaveApproval";

const session: WaitingBadalSession = {
  key:"approved|date|1",leaveRequestId:"req-1",requestCode:"IZN-99",scheduleDate:"2026-10-19",period:1,
  classCodes:["08 MQ IKHWAN", "09 MQ IKHWAN"],classLabel:"08 MQ IKHWAN + 09 MQ IKHWAN",subject:"Math",
  absentTeacherId:"t1",absentTeacherName:"Guru Izin",reason:"Dinas",coverageSlotIds:["a","b"],
  createdAt:"2026-10-16T00:00:00Z",isCombinedSession:true,taskText:"Kerjakan latihan",taskUrls:["https://example.org/tugas"],
};
const waitingRows: WaitingCoverageRow[] = ["08 MQ IKHWAN","09 MQ IKHWAN"].map((cls, index) => ({
  id: index===0?"a":"b",leaveRequestId:"req-1",requestCode:"IZN-99",scheduleDate:"2026-10-19",
  period:1,classCode:cls,subject:"Math",absentTeacherId:"t1",absentTeacherName:"Guru Izin",
  reason:"Dinas",status:"WAITING",source:"LEAVE_WORKFLOW",createdAt:"",taskText:"Kerjakan latihan",taskUrls:[],
}));
const proposed = waitingRows.map((row) => ({ tanggal: row.scheduleDate,kelas:row.classCode,jam_ke:row.period,
  mapel:row.subject,guru_izin:"Guru Izin",guru_pengganti:"Guru Badal",alasan:"Dinas",tugas:"" }));

test("approved waiting rows drive smart picker independent from master", () => {
  const [item] = buildApprovedLeaveOperatorRows(session);
  assert.equal(item.isCombinedGroup,true);
  assert.equal(item.targetSlots.length,2);
  assert.equal(item.recommendationClassLabel,"08 MQ IKHWAN");
  assert.equal(item.tugas,"Kerjakan latihan");
});

test("existing WAITING coverage ids are matched one-to-one, preserving leave identity", () => {
  assert.deepEqual(matchApprovedWaitingAssignments(session,waitingRows,proposed).map(x=>x.coverageSlotId),["a","b"]);
  assert.throws(()=>matchApprovedWaitingAssignments(session,waitingRows.slice(0,1),proposed),/berubah/);
  assert.throws(()=>matchApprovedWaitingAssignments(session,waitingRows,[proposed[0],proposed[0]]),/sesuai|kelas|belum/);
  assert.throws(()=>matchApprovedWaitingAssignments(session,waitingRows,proposed.slice(0,1)),/Jumlah kelas/);
  assert.throws(()=>matchApprovedWaitingAssignments(session,waitingRows.map((row)=>({...row,status:"ASSIGNED"})),proposed),/berubah/);
  assert.throws(()=>matchApprovedWaitingAssignments(session,waitingRows,proposed.map((row)=>({...row,tanggal:"2026-10-20"}))),/sesuai/);
});

test("approval uses same smart recommender and existing audited substitute RPC", () => {
  const approval = readFileSync("src/components/LeaveApprovalAdmin.tsx","utf8");
  const smart = readFileSync("src/components/InputGuruPengganti.tsx","utf8");
  assert.match(approval, /<InputGuruPengganti/);
  assert.match(approval, /taskOwnership="LEAVE_TEACHER"/);
  assert.match(approval, /approvedWaitingSession=\{activeWaitingSession\}/);
  assert.match(approval, /matchApprovedWaitingAssignments/);
  assert.match(approval, /assignmentRepository\.replaceSubstitute/);
  assert.doesNotMatch(approval,/href=\{buildBadalProcessingUrl\(session\)\}/);
  assert.match(smart,/genderPreferenceRank/);
  assert.match(smart,/teacherDailyLoads/);
  assert.match(smart,/teacherWeeklyLoads/);
  assert.match(smart,/buildApprovedLeaveOperatorRows/);
});
