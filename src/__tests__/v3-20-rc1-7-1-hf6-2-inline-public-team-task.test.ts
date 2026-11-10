import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findTeamTeachingTasksForTeacher, includeTeamTaskClassRows, inlineTeamTasksForClassCard} from '../domain/schedule/teamTeachingTask.ts';
import type {LogIzinItem} from '../domain/models.ts';

const source=(path:string)=>readFileSync(path,'utf8');
const dashboard=source('src/components/Dashboard.tsx');
const sql=source('supabase/migrations/202611110001_v3_20_rc1_7_1_hf6_2_public_team_tasks.sql');
const repo=source('src/infrastructure/repositories/supabasePublicScheduleRepository.ts');
const coverage: LogIzinItem={id:'lalu',mapel:'Bahasa Arab',tanggal:'2026-11-10',kelas:'10 AE 1 I',jam_ke:3,guru_izin:'LALU',guru_pengganti:'YADIQ',alasan:'',tugas:'Bab 3',coverage_status:'ASSIGNED',source:'LEAVE_WORKFLOW'};
const slot={kelas:'10 AE 1 I',jam_ke:3,guru1:'LALU',guru2:'HAIKAL',guru3:'ARIA',guru4:'ALI',isActive:true,isSuppressedByAcademicCalendar:false,effectiveTeachers:['YADIQ','HAIKAL','ARIA','ALI']};

test('HF6.2: shared task remains accessible to all available peers, not substitute or absent teacher',()=>{
  for(const name of ['HAIKAL','ARIA','ALI']){
    assert.deepEqual(findTeamTeachingTasksForTeacher({date:coverage.tanggal,period:3,teacherName:name,effectiveClasses:[slot],coverageLogs:[coverage]}).map(x=>x.id),['lalu']);
  }
  for(const name of ['YADIQ','LALU']){
    assert.deepEqual(findTeamTeachingTasksForTeacher({date:coverage.tanggal,period:3,teacherName:name,effectiveClasses:[slot],coverageLogs:[coverage]}),[]);
  }
});

test('HF6.2: no independent teaching team task section, only normal JP card action',()=>{
  assert.doesNotMatch(dashboard,/aria-label="Tugas untuk Teaching Team"|data-team-task-notice=/);
  assert.match(dashboard,/data-team-task-in-jp="true"/);
  const start=dashboard.indexOf('{mergedAllSchedules.map(');
  const inline=dashboard.indexOf('data-team-task-in-jp="true"');
  assert.ok(start > 0 && inline > start);
  assert.match(dashboard,/inlineTeamTasksForClassCard\(\{/);
  assert.match(dashboard,/classes: item\.items/);
  assert.match(dashboard,/!item\.isInval && !item\.isCancelledForKalender && !item\.isCancelledForInval/);
});

test('HF6.2: a task-bearing effective class can be restored to existing lesson grouping',()=>{
  assert.match(dashboard,/const operationalRows = includeTeamTaskClassRows\(\{/);
  assert.match(dashboard,/selectOperationalTeacherSchedules\(teacherRegularSchedules/);
  assert.match(dashboard,/notices: teacherTeamTaskNotices/);
});

test('HF6.2: guest includes older instructional tasks but not unrelated private data',()=>{
  assert.match(repo,/client\.rpc\("ejadwal_public_schedule_snapshot_v4"\)/);
  assert.match(sql,/public\.ejadwal_public_schedule_snapshot_v3\(\)/);
  assert.match(sql,/cs\.status not in \('CANCELLED', 'EXPIRED'\)/);
  assert.match(sql,/cs\.deleted_at is null/);
  assert.match(sql,/lt\.deleted_at is null/);
  assert.match(sql,/join visible_tasks t on t\.id = tr\.task_id/);
  assert.doesNotMatch(sql,/schedule_date >=|lt\.description.*reason_snapshot|grant select on public\.learning_tasks/i);
  assert.match(sql,/grant execute on function public\.ejadwal_public_schedule_snapshot_v4\(\) to anon, authenticated/);
});

test('HF6.2: pure logic restores canonical class row once, no extra task-only card',()=>{
  const operationalRows=[] as Array<typeof slot & {id:string}>;
  const exact={...slot,id:'normal-class-3'};
  const other={...slot,id:'other-class-3',kelas:'10 AE 2 I'};
  const notices=[{coverage,subject:'Bahasa Arab'}];
  assert.deepEqual(includeTeamTaskClassRows({operationalRows,effectiveRows:[exact,other],notices}).map(x=>x.id),['normal-class-3']);
  assert.deepEqual(includeTeamTaskClassRows({operationalRows:[exact],effectiveRows:[exact],notices}).map(x=>x.id),['normal-class-3']);
  assert.deepEqual(includeTeamTaskClassRows({operationalRows,effectiveRows:[{...exact,isActive:false}],notices}),[]);
  assert.deepEqual(includeTeamTaskClassRows({operationalRows,effectiveRows:[{...exact,isSuppressedByAcademicCalendar:true}],notices}),[]);
});

test('HF6.2: inline tasks belong only to exact class and JP, dedup inherited from HF6 notices',()=>{
  const notices=[{coverage,subject:'Bahasa Arab'}];
  const matched=inlineTeamTasksForClassCard({notices,period:3,classes:[{kelas:'10 AE 1 I'}]});
  assert.equal(matched.length,1);
  assert.equal(matched[0]?.subject,'Bahasa Arab');
  assert.equal(inlineTeamTasksForClassCard({notices,period:3,classes:[{kelas:'10 AE 1 A'}]}).length,0);
  assert.equal(inlineTeamTasksForClassCard({notices,period:4,classes:[{kelas:'10 AE 1 I'}]}).length,0);
  assert.equal(inlineTeamTasksForClassCard({notices,period:3,classes:[{kelas:'10 AE 2 I'}]}).length,0);
});
