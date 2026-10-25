import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changeFromPrevious, daysInclusive, defaultDayRange, leaveDayCsv, makeLeaveDayReport,
  parseLeaveDayEvents, previousWindow, selectUniqueTeacherDays, shiftDate, validateLeaveDayRange } from '../domain/leaveDaysAnalyticsV320.ts';

const rows=[
  {teacher_id:'andhika',teacher_name:'ANDHIKA',date:'2026-10-23',category:'PERSONAL'},
  {teacher_id:'andhika',teacher_name:'ANDHIKA',date:'2026-10-23',category:'PERSONAL'}, // repeated JP or class
  {teacher_id:'andhika',teacher_name:'ANDHIKA',date:'2026-10-23',category:'SCHOOL_DUTY'}, // same day another category
  {teacher_id:'rafi',teacher_name:'RAFI',date:'2026-10-23',category:'SCHOOL_DUTY'},
  {teacher_id:'andhika',teacher_name:'ANDHIKA',date:'2026-10-24',category:'PERSONAL'},
  {teacher_id:'dummy',teacher_name:' Guru  belum ditentukan ',date:'2026-10-23',category:'PERSONAL'},
];
const events=parseLeaveDayEvents(rows);

test('RC1.6 unique teacher-day (not JP) and ALL cannot double count category overlap',()=>{
  assert.equal(events.length,4);
  assert.equal(selectUniqueTeacherDays(events,'ALL').length,3);
  const all=makeLeaveDayReport(events,'2026-10-23','2026-10-24','weekly','ALL');
  assert.equal(all.totalDays,3);
  assert.equal(all.affectedTeachers,2);
  assert.equal(all.averageDays,1.5);
  assert.deepEqual(all.buckets.map(x=>x.teacherDays),[2,1]);
  assert.equal(all.teacherRanking[0].teacherName,'ANDHIKA');
  assert.equal(all.teacherRanking[0].days,2);
  assert.equal(all.buckets[0].dominantCategory,'SCHOOL_DUTY'); // 2 teacher-days school duty, 1 personal
});

test('RC1.6 filter category recomputes trends, ranking, total and prevents dummy counting',()=>{
  const personal=makeLeaveDayReport(events,'2026-10-23','2026-10-24','weekly','PERSONAL');
  assert.equal(personal.totalDays,2);
  assert.equal(personal.affectedTeachers,1);
  assert.deepEqual(personal.buckets.map(x=>x.teacherDays),[1,1]);
  const school=makeLeaveDayReport(events,'2026-10-23','2026-10-24','weekly','SCHOOL_DUTY');
  assert.equal(school.totalDays,2);
  assert.deepEqual(school.buckets.map(x=>x.teacherDays),[2,0]);
  const blank=makeLeaveDayReport(events,'2026-10-23','2026-10-24','weekly','UNCLASSIFIED');
  assert.equal(blank.totalDays,0);
  assert.equal(blank.buckets.length,2);
});

test('RC1.6 month/semester/annual grouping uses school-year boundaries and has empty buckets',()=>{
  const data=parseLeaveDayEvents([
    {teacher_id:'a',teacher_name:'A',date:'2025-12-31',category:'PERSONAL'},
    {teacher_id:'a',teacher_name:'A',date:'2026-01-01',category:'PERSONAL'},
    {teacher_id:'a',teacher_name:'A',date:'2026-07-01',category:'SCHOOL_DUTY'},
  ]);
  const monthly=makeLeaveDayReport(data,'2025-12-01','2026-02-01','monthly','ALL');
  assert.deepEqual(monthly.buckets.map(r=>r.teacherDays),[1,1,0]);
  const semester=makeLeaveDayReport(data,'2025-11-01','2026-08-01','semester','ALL');
  assert.deepEqual(semester.buckets.map(r=>r.label),['Ganjil 2025/26','Genap 2025/26','Ganjil 2026/27']);
  assert.deepEqual(semester.buckets.map(r=>r.teacherDays),[1,1,1]);
  const yearly=makeLeaveDayReport(data,'2025-01-01','2026-12-31','yearly','ALL');
  assert.deepEqual(yearly.buckets.map(r=>r.teacherDays),[1,2]);
});

test('RC1.6 time arithmetic, previous period, validation and default views',()=>{
  assert.equal(daysInclusive('2026-10-01','2026-10-07'),7);
  assert.deepEqual(previousWindow('2026-10-15','2026-10-21'),{start:'2026-10-08',end:'2026-10-14'});
  assert.equal(shiftDate('2026-03-01',-1),'2026-02-28');
  assert.equal(defaultDayRange('monthly','2026-10-24').start,'2026-07-01');
  assert.equal(defaultDayRange('monthly','2026-03-24').start,'2025-07-01');
  assert.equal(validateLeaveDayRange('weekly','2026-10-25','2026-10-24','2026-10-24')!==null,true);
  assert.equal(validateLeaveDayRange('weekly','2026-10-01','2026-10-25','2026-10-24')!==null,true);
  assert.equal(validateLeaveDayRange('yearly','2024-01-01','2026-10-24','2026-10-24'),null);
  assert.equal(changeFromPrevious(18,25).difference,-7);
  assert.ok(Math.abs(changeFromPrevious(18,25).percent!+28)<0.0001);
  assert.deepEqual(changeFromPrevious(3,0),{difference:3,percent:null});
});

test('RC1.6 rejects malformed RPC payload; CSV encodes values and cannot expose reasons',()=>{
  assert.throws(()=>parseLeaveDayEvents(null),/tidak valid/);
  assert.throws(()=>parseLeaveDayEvents([{teacher_id:'x',teacher_name:'X',date:'2026-02-30',category:'PERSONAL'}]),/Tanggal tidak valid/);
  assert.throws(()=>parseLeaveDayEvents([{teacher_id:'x',teacher_name:'X',date:'2026-10-22',category:'NOT_REAL'}]),/kategori/);
  const csv=leaveDayCsv(makeLeaveDayReport(events,'2026-10-23','2026-10-24','weekly','ALL'),
    '2026-10-23','2026-10-24','weekly','ALL');
  assert.match(csv,/Peringkat guru/);
  assert.match(csv,/ANDHIKA/);
  assert.doesNotMatch(csv,/Guru  belum ditentukan/);
});

test('RC1.6 SQL enforces staff only, source priority, real dates and no disclosure of private reasons',()=>{
  const sql=readFileSync('supabase/migrations/202610240001_v3_20_rc1_6_management_leave_days.sql','utf8');
  const component=readFileSync('src/components/ManagementAnalytics.tsx','utf8');
  const daily=readFileSync('src/components/ManagementLeaveDaysAnalytics.tsx','utf8');
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/DISTINCT ON \(teacher_id, day, period\)/);
  assert.match(sql,/APPROVED[\s\S]*OFFICIAL_DUTY[\s\S]*LEGACY_IMPORT/);
  assert.match(sql,/teacher_day_category/);
  assert.match(sql,/guru belum ditentukan/);
  assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*'reason'/);
  assert.match(component,/Statistik Hari Izin/);
  assert.match(daily,/Terapkan/);
  assert.match(daily,/Guru dengan Hari Izin Terbanyak/);
});
