import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIndividualTeacherStatistics,isSicknessReason,type IndividualLeaveProfile} from '../domain/teacherIndividualStatistics';
import type {ScheduleItem} from '../domain/models';
const template = (kelas:string,period:number):ScheduleItem => ({
  id:`${kelas}-${period}`,kelas,hari:'Senin',jam_ke:period,mulai:'07:40',selesai:'08:40',
  mapel:'Math',guru1:'GURU TEST',guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',kelasgabung:'Tidak',
});
const profile = (units:IndividualLeaveProfile['units']):IndividualLeaveProfile=>({
  teacherId:'uuid',teacherName:'GURU TEST',dateStart:'2026-10-12',dateEnd:'2026-10-16',units,
});
test('one class JP counts once even with duplicate/combined timetable rows',()=>{
  const stats=buildIndividualTeacherStatistics({
    profile:profile([{date:'2026-10-12',period:1,periodType:'TEACHING',reason:'Sakit demam',source:'APPROVED'},
      {date:'2026-10-12',period:1,periodType:'TEACHING',reason:'Sakit demam',source:'LEGACY'},
      {date:'2026-10-12',period:2,periodType:'FREE',reason:'Sakit demam',source:'APPROVED'},
      {date:'2026-10-12',period:0,periodType:'TEACHING',reason:'Sakit demam',source:'APPROVED'}]),
    teacherName:'GURU TEST',schedules:[template('1 INTER',1),template('1 MQ',1),template('1 INTER',3)],
  });
  assert.equal(stats.regularWeeklyJp,2);
  assert.equal(stats.expectedTeachingJp,2);
  assert.equal(stats.comparableTeachingLeaveJp,1);
  assert.equal(stats.totalLeaveJp,3);
  assert.equal(stats.teachingLeavePct,50);
  assert.equal(stats.sickRecords[0].totalJp,3);
});
test('historical unmatched leave does not inflate comparable attendance rate',()=>{
  const stats=buildIndividualTeacherStatistics({
    profile:profile([{date:'2026-10-12',period:4,periodType:'TEACHING',reason:'Izin',source:'APPROVED'}]),
    teacherName:'GURU TEST',schedules:[template('1 INTER',1)],
  });
  assert.equal(stats.recordedTeachingLeaveJp,1);
  assert.equal(stats.unmatchedHistoricalLeaveJp,1);
  assert.equal(stats.teachingLeavePct,0);
});
test('academic cancellations remove expected JP, but an explicit dated replacement may teach',()=>{
  const closure = [{id:'x',tanggal_mulai:'2026-10-12',tanggal_selesai:'2026-10-12',
    nama_kegiatan:'Rumah Tahfidz',tipe:'Kegiatan',cakupan:'Kelas',kelas:'1 INTER',status:'Aktif'}];
  const cancelled = buildIndividualTeacherStatistics({
    profile:profile([]),teacherName:'GURU TEST',schedules:[template('1 INTER',1)],academicEvents:closure,
  });
  assert.equal(cancelled.expectedTeachingJp,0);
  const overridden = buildIndividualTeacherStatistics({
    profile:profile([]),teacherName:'GURU TEST',
    schedules:[{...template('1 INTER',1),guru1:'ANOTHER TEACHER'}],
    academicEvents:closure,
    incidentals:[{id:'inc',tanggal:'2026-10-12',kelas:'1 INTER',jam_ke:1,mapel:'Exam Prep',
      guru1:'GURU TEST',guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',replaceTeachers:true}],
  });
  assert.equal(overridden.expectedTeachingJp,1);
});
test('sickness reason categorizes commonly used wording without labeling family leave',()=>{
  assert.equal(isSicknessReason('Sakit demam dan flu'),true);
  assert.equal(isSicknessReason('Berobat ke dokter'),true);
  assert.equal(isSicknessReason('Urusan keluarga'),false);
});
test('staff-only RPC, no anon access, and safe public WA shortcut',()=>{
  const root=process.cwd();
  const sql=readFileSync(`${root}/supabase/migrations/202610120007_v3_14_6_individual_teacher_leave_analytics.sql`,'utf8');
  const app=readFileSync(`${root}/src/App.tsx`,'utf8');
  const form=readFileSync(`${root}/src/components/LeaveRequestForm.tsx`,'utf8');
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/revoke all on function public\.ejadwal_teacher_leave_profile_v1\(uuid,date,date\) from public,anon/);
  assert.match(app,/id: "teacher-statistics".*adminOnly: true/);
  assert.match(form,/https:\/\/wa\.me\/6281325245959/);
  assert.match(form,/target="_blank" rel="noopener noreferrer"/);
});
