import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExpectedTeacherDays,teacherDayLeaveRate } from '../domain/expectedTeacherDaysV320.ts';
import { leaveDayCsv, makeLeaveDayReport, parseLeaveDayEvents } from '../domain/leaveDaysAnalyticsV320.ts';

const summary=parseExpectedTeacherDays({expected_teacher_days:5000,calendar_term_days:80,
  leave_days_outside_calendar:0,status:'ESTIMATED'});

test('RC1.6.1 ratio = unique teacher-leave-days / expected teacher duty-days',()=>{
  assert.ok(Math.abs(teacherDayLeaveRate(343,summary)!-6.86)<1e-10);
  assert.equal(summary.expectedTeacherDays,5000);
  assert.equal(teacherDayLeaveRate(0,summary),0);
});
test('RC1.6.1 category filter changes numerator but not denominator',()=>{
  const data=parseLeaveDayEvents([
    {teacher_id:'a',teacher_name:'A',date:'2026-10-20',category:'PERSONAL'},
    {teacher_id:'a',teacher_name:'A',date:'2026-10-20',category:'SCHOOL_DUTY'},
    {teacher_id:'a',teacher_name:'A',date:'2026-10-21',category:'PERSONAL'},
    {teacher_id:'b',teacher_name:'B',date:'2026-10-20',category:'SCHOOL_DUTY'},
  ]);
  const r=(category:'ALL'|'PERSONAL'|'SCHOOL_DUTY')=>makeLeaveDayReport(data,'2026-10-20','2026-10-21','weekly',category);
  assert.deepEqual([r('ALL').totalDays,r('PERSONAL').totalDays,r('SCHOOL_DUTY').totalDays],[3,2,2]);
  assert.equal(teacherDayLeaveRate(r('ALL').totalDays,summary),.06);
  assert.equal(teacherDayLeaveRate(r('PERSONAL').totalDays,summary),.04);
  assert.equal(teacherDayLeaveRate(r('SCHOOL_DUTY').totalDays,summary),.04);
  const csv=leaveDayCsv(r('ALL'),'2026-10-20','2026-10-21','weekly','ALL',summary);
  assert.match(csv,/Total guru-hari kewajiban/);
  assert.match(csv,/5000/);
});
test('RC1.6.1 incomplete/zero/mismatched denominator suppresses percentage',()=>{
  for(const status of ['PARTIAL','UNAVAILABLE'] as const){
    assert.equal(teacherDayLeaveRate(343,{...summary,status}),null);
  }
  assert.equal(teacherDayLeaveRate(343,{...summary,expectedTeacherDays:0}),null);
  assert.equal(teacherDayLeaveRate(343,{...summary,expectedTeacherDays:100}),null);
  assert.equal(teacherDayLeaveRate(343,null),null);
  assert.equal(teacherDayLeaveRate(-1,summary),null);
});
test('RC1.6.1 refuses malformed DB summaries',()=>{
  assert.throws(()=>parseExpectedTeacherDays(null),/tidak valid/);
  assert.throws(()=>parseExpectedTeacherDays({expected_teacher_days:'5000',calendar_term_days:80,
    leave_days_outside_calendar:0,status:'ESTIMATED'}),/tidak valid/);
  assert.throws(()=>parseExpectedTeacherDays({expected_teacher_days:10,calendar_term_days:0,
    leave_days_outside_calendar:-1,status:'ESTIMATED'}),/tidak valid/);
});
test('RC1.6.1 RPC staff only, no physical attendance, no personal reasons',()=>{
  const sql=readFileSync('supabase/migrations/202610240002_v3_20_rc1_6_1_expected_teacher_days.sql','utf8');
  const component=readFileSync('src/components/ManagementLeaveDaysAnalytics.tsx','utf8');
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public.ejadwal_management_expected_teacher_days_v320/);
  assert.match(sql,/ejadwal_management_leave_days_v320/);
  assert.match(sql,/schedule_master_teachers/);
  assert.match(sql,/ejadwal_operational_terms/);
  assert.match(sql,/compensatory_off/);
  assert.doesNotMatch(sql,/SELECT\s+.*reason_snapshot/i);
  assert.match(component,/kewajiban terjadwal/);
  assert.match(component,/expectedRate/);
  assert.match(component,/bukan total hari kalender atau absensi fisik/);
});
