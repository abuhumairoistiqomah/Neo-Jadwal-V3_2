import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findTeamTeachingTasksForTeacher } from '../domain/schedule/teamTeachingTask.ts';

const sql=readFileSync('supabase/migrations/202610210004_v3_19_rc4_4_team_teaching_tasks.sql','utf8');
const dashboard=readFileSync('src/components/Dashboard.tsx','utf8');
const picker=readFileSync('src/components/InputGuruPengganti.tsx','utf8');
const admin=readFileSync('src/components/SubstituteConstraintAdmin.tsx','utf8');
const repo=readFileSync('src/infrastructure/repositories/officialDutyBadalRepository.ts','utf8');
const date='2026-10-21';
const slots=[{kelas:'08 AE 2 I',jam_ke:2,guru1:'ARIA FARISKA',guru2:'HARIYADIQ FEBRIAN',guru3:'UKASYAH'},
 {kelas:'09 AE 1 I',jam_ke:2,guru1:'ARIA FARISKA',guru2:'NURIN'}];
const logs=[{id:'one',tanggal:date,kelas:'08 AE 2 I',jam_ke:2,guru_izin:'ARIA FARISKA',guru_pengganti:'',coverage_status:'NO_SUBSTITUTE',source:'ADMIN_MANUAL',tugas:'Kerjakan QS Al-Mulk 1–5',mapel:"Al-Qur'an",alasan:'Tugas resmi'},
 {id:'two',tanggal:date,kelas:'09 AE 1 I',jam_ke:2,guru_izin:'ARIA FARISKA',guru_pengganti:'',coverage_status:'WAITING',tugas:'Harus tetap menunggu badal',mapel:'Matematika',alasan:'Izin'}] as any[];
const find=(teacherName:string,coverageLogs:any[]=logs,effectiveClasses:any[]=slots,period=2)=>findTeamTeachingTasksForTeacher({date,period,teacherName,effectiveClasses,coverageLogs});

test('RC4.4 co-teacher sees exact task from NO_SUBSTITUTE, not pending',()=>{
 const tasks=find('UKASYAH');
 assert.equal(tasks.length,1);
 assert.equal(tasks[0].tugas,'Kerjakan QS Al-Mulk 1–5');
});
test('RC4.4 absent teacher and unrelated class teachers never get task',()=>{
 assert.equal(find('ARIA FARISKA').length,0);
 assert.equal(find('NURIN').length,0);
 assert.equal(find('GURU LUAR').length,0);
});
test('RC4.4 colleague on leave in same class/JP is excluded',()=>{
 const extra={...logs[0],id:'three',guru_izin:'UKASYAH',coverage_status:'ASSIGNED',guru_pengganti:'SALMAN'};
 assert.equal(find('UKASYAH',[...logs,extra]).length,0);
});
test('RC4.4 dated/class/JP match is exact and status must be NO_SUBSTITUTE',()=>{
 assert.equal(find('UKASYAH',logs,slots,3).length,0);
 assert.equal(find('UKASYAH',[{...logs[0],kelas:'08 AE 1 I'}]).length,0);
 assert.equal(find('UKASYAH',[{...logs[0],tanggal:'2026-10-20'}]).length,0);
 assert.equal(find('UKASYAH',[{...logs[0],coverage_status:'CANCELLED'}]).length,0);
 assert.equal(find('UKASYAH',[{...logs[0],source:'LEGACY_IMPORT'}]).length,0);
});
test('RC4.4 Dashboard reuses the existing task modal; does not allocate badal JP',()=>{
 assert.match(dashboard,/findTeamTeachingTasksForTeacher/);
 assert.match(dashboard,/!item\.teacherUnavailable\.unavailable/);
 assert.match(dashboard,/!item\.isCancelledForKalender/);
 assert.match(dashboard,/taskLabel: "Instruksi \/ tugas untuk team teaching"/);
 assert.match(dashboard,/isAcknowledgedTeamTeachingCoverage\(matchingLog\)/);
 assert.doesNotMatch(dashboard,/set.*Badal.*TeamTeaching/);
});
test('RC4.4 NO_SUBSTITUTE saves in same existing learning_tasks table, transactionally',()=>{
 assert.match(sql,/create or replace function public\.ejadwal_save_team_teaching_task_v319/);
 assert.match(sql,/insert into public\.learning_tasks/);
 assert.match(sql,/insert into public\.task_resources/);
 assert.match(sql,/v_slot\.source='LEAVE_WORKFLOW' and v_task_id is not null then return/);
 assert.match(sql,/perform public\.ejadwal_save_team_teaching_task_v319\(\s*v_slot, p_row->>'task_text'/);
 assert.match(sql,/public\.ejadwal_acknowledge_official_duty_team_teaching_v319\(/);
 assert.match(sql,/perform public\.ejadwal_save_team_teaching_task_v319\(v_slot_id,p_task_text/);
 assert.match(sql,/ADMIN_OR_WAKASEK_REQUIRED/);
 assert.doesNotMatch(sql,/create table|alter table public\.learning_tasks/i);
});
test('RC4.4 existing form field is reused for official duty team teaching',()=>{
 assert.match(picker,/!officialDutySlots \|\| row\.selectedPengganti === TEAM_TEACHING_NO_BADAL/);
 assert.match(admin,/taskText: String\(row\.tugas \|\| ""\)\.trim\(\)/);
 assert.match(repo,/ejadwal_acknowledge_official_duty_team_teaching_task_v319/);
 assert.match(repo,/p_task_text: input\.taskText \|\| ""/);
 assert.match(repo,/p_task_resources: input\.taskResources \|\| \[\]/);
});


test('RC4.4.2 wali and pendamping warnings omit substitute suffix only for acknowledged team teaching',()=>{
  assert.match(dashboard,/function SubstituteWarningSuffix/);
  assert.match(dashboard,/if \(isAcknowledgedTeamTeachingCoverage\(log\)\) return null;/);
  assert.match(dashboard,/if \(!substituteName\)/);
  assert.match(dashboard,/Badal belum ditentukan\./);
  const uses=dashboard.match(/<SubstituteWarningSuffix log=\{log\} assignedClass=/g) || [];
  assert.equal(uses.length,2,'Both wali and pendamping banners must use the same status handling');
  assert.doesNotMatch(dashboard,/log\.guru_pengganti \|\| "Belum Ditentukan"/);
});
