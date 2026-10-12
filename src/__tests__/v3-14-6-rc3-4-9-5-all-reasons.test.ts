import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndividualTeacherStatistics, classifyLeaveReason, type IndividualLeaveProfile } from '../domain/teacherIndividualStatistics';

const profile: IndividualLeaveProfile = {
  teacherId:'teacher-1', teacherName:'GURU TEST', dateStart:'2026-10-12', dateEnd:'2026-10-23',
  units:[
    {date:'2026-10-12',period:1,periodType:'TEACHING',reason:'Mengantar siswa lomba',source:'APPROVED',requestType:'PARTIAL'},
    {date:'2026-10-12',period:2,periodType:'TEACHING',reason:'Mengantar siswa lomba',source:'APPROVED',requestType:'PARTIAL'},
    {date:'2026-10-12',period:2,periodType:'TEACHING',reason:'Mengantar siswa lomba',source:'LEGACY_IMPORT'},
    {date:'2026-10-12',period:3,periodType:'FREE',reason:'Mengantar siswa lomba',source:'APPROVED',requestType:'PARTIAL'},
    {date:'2026-10-19',period:0,periodType:'TEACHING',reason:'mengantar  siswa   lomba',source:'APPROVED',requestType:'PARTIAL'},
    {date:'2026-10-20',period:1,periodType:'TEACHING',reason:'Sakit demam',source:'APPROVED',requestType:'FULL_DAY'},
    {date:'2026-10-21',period:1,periodType:'TEACHING',reason:'',source:'LEGACY_IMPORT'},
  ],
};
const stats = buildIndividualTeacherStatistics({profile,teacherName:'GURU TEST',schedules:[]});

test('all recorded leave reasons are preserved, not just illness', () => {
  assert.equal(classifyLeaveReason('Mengantar siswa lomba'), 'OTHER');
  assert.equal(classifyLeaveReason('Sakit demam'), 'SICK_KEYWORD');
  assert.equal(classifyLeaveReason(''), 'UNSPECIFIED');
  assert.ok(stats.leaveReasonRecords.some(r => r.reason === 'Mengantar siswa lomba'));
  assert.ok(stats.leaveReasonRecords.some(r => r.reason === 'Sakit demam'));
  assert.ok(stats.leaveReasonRecords.some(r => r.reason === 'Tanpa alasan'));
});
test('reason summary deduplicates combined coverage and counts attendance JPs only once', () => {
  const school = stats.leaveReasonSummary.find(r=>r.reason.toLocaleLowerCase('id-ID') === 'mengantar siswa lomba');
  assert.ok(school);
  assert.equal(school.dates,2); // Monday 12 and Monday 19 (despite multiple JPs)
  assert.equal(school.teachingJp,2);
  assert.equal(school.freeJp,1);
  assert.equal(school.homeroomJp,1);
  assert.equal(school.totalJp,4);
  assert.equal(stats.totalLeaveJp,6); // duplicate historical JP ignored
});
test('details show original date, request scope, reason and source for audit', () => {
  const entry = stats.leaveReasonRecords.find(r=>r.date==='2026-10-12' && r.reason==='Mengantar siswa lomba');
  assert.ok(entry);
  assert.equal(entry.source,'APPROVED');
  assert.equal(entry.requestType,'PARTIAL');
  assert.equal(entry.teachingJp,2);
  assert.equal(entry.freeJp,1);
});
test('the reason UI includes search, all dates and the school context without opening anonymous RPC', () => {
  const ui = readFileSync('src/components/TeacherIndividualStatistics.tsx','utf8');
  const sql = readFileSync('supabase/migrations/202610120008_v3_14_6_teacher_leave_patterns.sql','utf8');
  assert.match(ui,/Rekap seluruh alasan izin/);
  assert.match(ui,/Cari kata dalam alasan/);
  assert.match(ui,/Alasan paling sering tercatat/);
  assert.doesNotMatch(ui,/Ringkasan alasan terkait sakit \(internal\)/);
  assert.match(sql,/current_user_is_staff\(\)/);
});
