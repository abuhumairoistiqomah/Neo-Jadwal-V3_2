import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coversExactlyOfficialDutySlots, scopeInvalRowsToOfficialDuty } from "../domain/inval/officialDutySelection";

const teachingRows = [
  {jam_ke:2,kelas:"08 MQ IKHWAN & 09 MQ IKHWAN",targetSlots:[{kelas:"08 MQ IKHWAN",mapel:"Al-Qur'an"},{kelas:"09 MQ IKHWAN",mapel:"Al-Qur'an"}],selectedPengganti:"",isCombinedGroup:true},
  {jam_ke:3,kelas:"10 AE 1 I",targetSlots:[{kelas:"10 AE 1 I",mapel:"Math"}],selectedPengganti:"",isCombinedGroup:false},
];

test("smart badal scope keeps only the exact unmet class/JP", () => {
  const allowed = [{period:2,className:"08 MQ IKHWAN"}];
  const actual = scopeInvalRowsToOfficialDuty(teachingRows, allowed);
  assert.equal(actual.length,1);
  assert.deepEqual(actual[0].targetSlots, [{kelas:"08 MQ IKHWAN",mapel:"Al-Qur'an"}]);
  assert.equal(actual[0].kelas,"08 MQ IKHWAN");
  assert.equal(actual[0].isCombinedGroup,false);
  assert.equal(coversExactlyOfficialDutySlots(actual,allowed),true);
  assert.equal(coversExactlyOfficialDutySlots(teachingRows,allowed),false);
});

test("smart badal scope detects missing/duplicate coverage", () => {
  assert.equal(coversExactlyOfficialDutySlots([], [{period:2,className:"08 MQ IKHWAN"}]),false);
  assert.equal(coversExactlyOfficialDutySlots(teachingRows,[{period:2,className:"08 MQ IKHWAN"},{period:3,className:"10 AE 1 I"}]),false);
  assert.equal(coversExactlyOfficialDutySlots(teachingRows.slice(0,1),[{period:2,className:"08 MQ IKHWAN"},{period:2,className:"09 MQ IKHWAN"}]),true);
  assert.equal(coversExactlyOfficialDutySlots([teachingRows[1],teachingRows[1]],[{period:3,className:"10 AE 1 I"}]),false);
});

test("Aturan Badal routes to existing smart recommender with official-duty-only persistence", () => {
  const rules = readFileSync("src/components/SubstituteConstraintAdmin.tsx","utf8");
  const smart = readFileSync("src/components/InputGuruPengganti.tsx","utf8");
  assert.match(rules,/<InputGuruPengganti/);
  assert.match(rules,/officialDutySlots=\{pendingNeeds\.map/);
  assert.match(rules,/onAddLogs=\{saveOfficialDutySelections\}/);
  assert.match(rules,/badalRepository\.assign/);
  assert.match(rules,/!expected\.has\(key\)/);
  assert.match(smart,/genderPreferenceRank/);
  assert.match(smart,/teacherDailyLoads/);
  assert.match(smart,/teacherWeeklyLoads/);
  assert.match(smart,/evaluateSubstituteCandidatePolicy/);
  assert.match(smart,/coversExactlyOfficialDutySlots/);
  assert.doesNotMatch(rules,/new SupabaseInvalWriteRepository/);
});

test("RC4.2: no-badal keeps official-duty path without fake teacher", () => {
  const ui=readFileSync("src/components/InputGuruPengganti.tsx","utf8");
  const admin=readFileSync("src/components/SubstituteConstraintAdmin.tsx","utf8");
  const repo=readFileSync("src/infrastructure/repositories/officialDutyBadalRepository.ts","utf8");
  const sql=readFileSync("supabase/migrations/202610210001_v3_19_rc4_1_team_teaching_no_badal.sql","utf8");
  assert.match(ui,/allowTeamTeachingNoBadal=\{row\.jam_ke > 0\}/);
  assert.match(ui,/Tidak perlu ada badal/);
  assert.match(admin,/badalRepository\.acknowledgeTeamTeaching/);
  assert.match(admin,/badalRepository\.reopenTeamTeaching/);
  assert.match(repo,/ejadwal_acknowledge_official_duty_team_teaching_task_v319/);
  const taskMigration=readFileSync("supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks.sql","utf8");
  assert.match(taskMigration,/create or replace function public\.ejadwal_acknowledge_official_duty_team_teaching_task_v319/);
  assert.match(taskMigration,/ejadwal_save_team_teaching_task_v319/);
  assert.match(sql,/status='NO_SUBSTITUTE'/);
  assert.match(sql,/substitute_teacher_id=null/);
  assert.match(sql,/TEAM_TEACHING_NOT_AVAILABLE/);
  assert.match(sql,/OFFICIAL_DUTY_COVERAGE_ALREADY_EXISTS/);
  assert.match(sql,/REOPEN_OFFICIAL_DUTY_TEAM_TEACHING/);
  assert.doesNotMatch(sql,/insert into public\.leave_requests/i);
});
