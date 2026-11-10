import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectTeacherDashboardTeamTaskNotices, isAssignedTeamCoverage} from '../domain/schedule/teamTeachingTask.ts';

const date='2026-11-09';
const row={kelas:'10 AE 1 I',jam_ke:3,mapel:'Bahasa Arab',guru1:'LALU',guru2:'HAIKAL',guru3:'ARIA',guru4:'ALI',guru5:'',guru6:'',isActive:true,
  effectiveTeachers:['HAIKAL','ARIA','ALI','YADIQ']};
const coverage={id:'cov-lalu',tanggal:date,kelas:'10 AE 1 I',jam_ke:3,guru_izin:'LALU',alasan:'Izin pribadi',guru_pengganti:'YADIQ',coverage_status:'ASSIGNED',source:'LEAVE_WORKFLOW',tugas:'Kerjakan latihan 1–5',mapel:'Bahasa Arab'};
const find=(name:string,rows:any[]=[row],logs:any[]=[coverage],canShowSlot?:(slot:any)=>boolean)=>
  collectTeacherDashboardTeamTaskNotices({date,teacherName:name,effectiveClasses:rows,coverageLogs:logs,canShowSlot});

test('HF6: teacher dashboard reads dated team tasks independently of rendered timetable cards',()=>{
  for(const teacher of ['HAIKAL','ARIA','ALI']){
    const tasks=find(teacher);
    assert.equal(tasks.length,1,teacher);
    assert.equal(tasks[0].coverage.tugas,'Kerjakan latihan 1–5');
    assert.equal(tasks[0].subject,'Bahasa Arab');
  }
  assert.equal(find('YADIQ').length,0,'original badal card handles substitute');
  assert.equal(find('LALU').length,0,'absent teacher is not available teammate');
  assert.equal(find('GURU LUAR').length,0);
});

test('HF6: COMPLETED badal still shares the task on selected historical date',()=>{
  assert.equal(isAssignedTeamCoverage({...coverage, coverage_status:'COMPLETED'}),true);
  assert.equal(find('HAIKAL',[row],[{...coverage,coverage_status:'COMPLETED'}]).length,1);
});

test('HF6: cancelled/unassigned/pending coverage never appears',()=>{
  for(const status of ['WAITING','CANCELLED','EXPIRED','PENDING','NO_SUBSTITUTE']){
    assert.equal(find('ARIA',[row],[{...coverage,coverage_status:status}]).length,0,status);
  }
});

test('HF6: real NO_SUBSTITUTE still works without another badal',()=>{
  const noBadal={...coverage,coverage_status:'NO_SUBSTITUTE',guru_pengganti:''};
  assert.equal(find('ARIA',[row],[noBadal]).length,1);
});

test('HF6: exact roster, effective attendance, date, class and JP protected',()=>{
  assert.equal(find('ARIA',[{...row,effectiveTeachers:['HAIKAL','ALI']}]).length,0);
  assert.equal(find('ARIA',[{...row,isActive:false}]).length,0);
  assert.equal(find('ARIA',[{...row,isSuppressedByAcademicCalendar:true}]).length,0);
  assert.equal(find('ARIA',[{...row,kelas:'10 AE 1 A'}]).length,0);
  assert.equal(find('ARIA',[{...row,jam_ke:4}]).length,0);
  assert.equal(find('ARIA',[row],[{...coverage,tanggal:'2026-11-10'}]).length,0);
  assert.equal(find('ARIA',[row],[{...coverage,kelas:'10 AE 2 I'}]).length,0);
});

test('HF6: eligibility callback excludes unavailable or displaced members',()=>{
  assert.equal(find('HAIKAL',[row],[coverage],()=>false).length,0);
  assert.equal(find('HAIKAL',[row],[coverage],()=>true).length,1);
});

test('HF6: no duplicate cards from repeated class rows or stale copies',()=>{
  assert.equal(find('HAIKAL',[row,{...row}],[coverage,{...coverage}]).length,1);
});

test('HF6.2: Dashboard Guru displays a team task in its existing class JP card',()=>{
  const src=readFileSync('src/components/Dashboard.tsx','utf8');
  assert.match(src,/const teacherTeamTaskNotices = useMemo\(\(\) => collectTeacherDashboardTeamTaskNotices<DashboardEffectiveItem>\(/);
  assert.match(src,/data-team-task-in-jp="true"/);
  assert.doesNotMatch(src,/data-team-task-notice="true"|aria-label="Tugas untuk Teaching Team"/);
  const cards=src.indexOf('{mergedAllSchedules.map(');
  const inline=src.indexOf('data-team-task-in-jp="true"');
  assert.ok(cards >= 0 && inline > cards, 'shared task must be within the standard JP card');
  assert.match(src,/inlineTeamTasksForClassCard\(\{/);
  assert.match(src,/classes: item\.items/);
  assert.match(src,/includeTeamTaskClassRows\(\{/);
  assert.match(src,/!resolveDisplacedTeacher\(/);
  assert.match(src,/getTeacherUnavailableStatus\(\{/);
  assert.match(src,/setTaskModalData\(\{/);
});
