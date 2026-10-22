import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseManagementTeacherCategoryActivity,selectManagementCategoryTeacherRows,
  isAnalyticsPlaceholderTeacher,labelTeacherCategoryCsv,buildTeacherAnalyticsCsv,
  type ManagementTeacherAnalyticsRow} from '../domain/managementAnalytics.ts';

const fixture:ManagementTeacherAnalyticsRow[] = [
  {teacherId:'dinsya',teacherName:'DINSYA ARIFA, S.Pd.',effectiveTeachingJp:32,effectiveTeachingDays:23,
    totalLeaveJp:0,totalLeaveDays:0} as ManagementTeacherAnalyticsRow,
  {teacherId:'a',teacherName:'Guru A',effectiveTeachingJp:8,effectiveTeachingDays:4,
    totalLeaveJp:4,totalLeaveDays:3} as ManagementTeacherAnalyticsRow,
  {teacherId:'dummy',teacherName:' Guru  belum ditentukan ',effectiveTeachingJp:2,effectiveTeachingDays:1,
    totalLeaveJp:0,totalLeaveDays:0} as ManagementTeacherAnalyticsRow,
];
const raw = [
  {teacher_id:'dinsya',category:'SCHOOL_DUTY',teaching_jp:2,other_jp:0,days:1},
  {teacher_id:'dinsya',category:'ALL',teaching_jp:2,other_jp:0,days:1},
  {teacher_id:'a',category:'PERSONAL',teaching_jp:2,other_jp:0,days:2},
  {teacher_id:'a',category:'SCHOOL_DUTY',teaching_jp:1,other_jp:1,days:1},
  // Both categories on same date: ALL days must be 2, not 2+1=3.
  {teacher_id:'a',category:'ALL',teaching_jp:3,other_jp:1,days:2},
];

test('RC1.2 Dinsya official duty appears as 2 JP on SCHOOL_DUTY and ALL, not on PERSONAL',()=>{
  const entries=parseManagementTeacherCategoryActivity(raw);
  const duty=selectManagementCategoryTeacherRows(fixture,entries,'SCHOOL_DUTY');
  assert.equal(duty.find(x=>x.teacherId==='dinsya')?.totalLeaveJp,2);
  assert.equal(duty.find(x=>x.teacherId==='dinsya')?.totalLeaveDays,1);
  assert.equal(duty.find(x=>x.teacherId==='dinsya')?.effectiveTeachingJp,32);
  assert.equal(duty.find(x=>x.teacherId==='dinsya')?.leaveSharePct,2/34*100);
  const personal=selectManagementCategoryTeacherRows(fixture,entries,'PERSONAL');
  assert.equal(personal.some(x=>x.teacherId==='dinsya'),false);
  assert.equal(selectManagementCategoryTeacherRows(fixture,entries,'ALL').find(x=>x.teacherId==='dinsya')?.totalLeaveJp,2);
});

test('RC1.2 dropdown changes teacher counts, day union and CSV consistently',()=>{
  const entries=parseManagementTeacherCategoryActivity(raw);
  const personal=selectManagementCategoryTeacherRows(fixture,entries,'PERSONAL');
  const all=selectManagementCategoryTeacherRows(fixture,entries,'ALL');
  assert.equal(personal.find(x=>x.teacherId==='a')?.totalLeaveJp,2);
  assert.equal(all.find(x=>x.teacherId==='a')?.totalLeaveJp,3);
  assert.equal(all.find(x=>x.teacherId==='a')?.totalLeaveDays,2);
  const csv=labelTeacherCategoryCsv(buildTeacherAnalyticsCsv(personal),'PERSONAL');
  assert.match(csv,/JP Tidak Mengajar \(Urusan Pribadi\)/);
  assert.doesNotMatch(csv,/Guru  belum ditentukan/);
});

test('RC1.2 excludes only designated placeholder and rejects malformed/duplicate category payload',()=>{
  assert.equal(isAnalyticsPlaceholderTeacher('Guru belum ditentukan'),true);
  assert.equal(isAnalyticsPlaceholderTeacher('Guru A belum ditentukan'),false);
  assert.equal(selectManagementCategoryTeacherRows(fixture,parseManagementTeacherCategoryActivity(raw),'ALL').some(x=>x.teacherId==='dummy'),false);
  assert.throws(()=>parseManagementTeacherCategoryActivity(null),/INVALID_CATEGORY_PAYLOAD/);
  assert.throws(()=>parseManagementTeacherCategoryActivity([raw[0],raw[0]]),/INVALID_CATEGORY_ROW/);
  assert.throws(()=>parseManagementTeacherCategoryActivity([{...raw[0],teaching_jp:null}]),/INVALID_CATEGORY_ROW/);
});

test('RC1.2 backend is staff gated and prioritizes official duty without double counts',()=>{
  const sql=readFileSync('supabase/migrations/202610230001_v3_20_rc1_2_management_category_activity.sql','utf8');
  const component=readFileSync('src/components/ManagementAnalytics.tsx','utf8');
  const repository=readFileSync('src/infrastructure/repositories/managementAnalyticsRepository.ts','utf8');
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/DISTINCT ON \(teacher_id,date,period\)/);
  assert.match(sql,/GROUP BY GROUPING SETS \(\(teacher_id,category\),\(teacher_id\)\)/);
  assert.match(sql,/source='OFFICIAL_DUTY'/);
  assert.match(sql,/coverage_slots.*absence_category|absence_category.*coverage_slots/s);
  assert.match(sql,/guru belum ditentukan/);
  assert.match(repository,/ejadwal_leave_category_teacher_activity_v320/);
  assert.match(component,/absenceFilter/);
  assert.match(component,/selectManagementCategoryTeacherRows\(data.teachers, data.categoryActivity, absenceFilter\)/);
  assert.match(component,/labelTeacherCategoryCsv/);
});
