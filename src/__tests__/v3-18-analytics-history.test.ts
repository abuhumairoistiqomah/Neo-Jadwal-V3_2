import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partitionSubstituteHistory } from '../domain/substituteLogVisibility';
import {
  normalizeManagementAnalyticsPayload,
  mergeTeacherEffectiveActivity,
  buildTeacherAnalyticsCsv,
  sortTeacherActivityRows,
  type ManagementTeacherAnalyticsRow,
} from '../domain/managementAnalytics';

const read = (p: string) => readFileSync(p,'utf8');
const history = [
  {tanggal:'2026-10-18',id:'old'},
  {tanggal:'2026-10-19',id:'today'},
  {tanggal:'2026-10-20',id:'tomorrow'},
  {tanggal:'',id:'unknown'},
];
test('V3.18 Log Izin & WA hides strictly earlier Jakarta dates, not today and future', () => {
  const result = partitionSubstituteHistory(history,'2026-10-19');
  assert.deepEqual(result.past.map(x=>x.id), ['old']);
  assert.deepEqual(result.currentAndUpcoming.map(x=>x.id), ['today','tomorrow','unknown']);
  assert.equal(history.length,4,'presentation filter must never delete records');
  assert.equal(partitionSubstituteHistory(history,'2026-10-20').past.length,2);
});

test('V3.18 merges observed operational JP into original report and calculates complementary percentages', () => {
  const base = normalizeManagementAnalyticsPayload({
    date_start:'2026-10-01',date_end:'2026-10-19',teachers:[
      {teacher_id:'a',teacher_name:'Guru A',regular_weekly_jp:24},
      {teacher_id:'b',teacher_name:'Guru B',regular_weekly_jp:18},
    ],
  });
  const enhanced = mergeTeacherEffectiveActivity(base,[
    {teacher_id:'a',effective_teaching_jp:18,leave_jp:2,effective_teaching_days:5,leave_days:1},
    {teacher_id:'b',effective_teaching_jp:0,leave_jp:0,effective_teaching_days:0,leave_days:0},
  ]);
  assert.equal(enhanced.teachers[0].effectiveTeachingJp,18);
  assert.equal(enhanced.teachers[0].totalLeaveJp,2);
  assert.equal(enhanced.teachers[0].teachingSharePct,90);
  assert.equal(enhanced.teachers[0].leaveSharePct,10);
  assert.equal(enhanced.teachers[1].teachingSharePct,null,'zero denominator must be unavailable not 0%');
  assert.equal(enhanced.teachers[1].leaveSharePct,null);
  assert.equal(enhanced.teachers[0].regularWeeklyJp,24,'legacy KPI still available for old screens');
});

test('V3.18 does not invent metrics when new RPC missing / invalid', () => {
  const base = normalizeManagementAnalyticsPayload({teachers:[{teacher_id:'a',teacher_name:'Guru A'}]});
  assert.throws(()=>mergeTeacherEffectiveActivity(base,null),/INVALID_ACTIVITY_PAYLOAD/);
  assert.throws(()=>mergeTeacherEffectiveActivity(base,[]),/TEACHER_NOT_FOUND/);
  assert.throws(()=>mergeTeacherEffectiveActivity(base,[{teacher_id:'a',effective_teaching_jp:null,leave_jp:0,effective_teaching_days:0,leave_days:0}]),/INVALID_ACTIVITY_ROW/);
});

test('V3.18 all headings sortable ASC/DESC, missing percentages are always last', () => {
  const raw: ManagementTeacherAnalyticsRow[] = [
    {teacherId:'a',teacherName:'A',leaveSharePct:75,effectiveTeachingJp:2},
    {teacherId:'b',teacherName:'B',leaveSharePct:null,effectiveTeachingJp:0},
    {teacherId:'c',teacherName:'C',leaveSharePct:15,effectiveTeachingJp:10},
  ] as ManagementTeacherAnalyticsRow[];
  assert.deepEqual(sortTeacherActivityRows(raw,'leaveSharePct','desc').map(x=>x.teacherId),['a','c','b']);
  assert.deepEqual(sortTeacherActivityRows(raw,'leaveSharePct','asc').map(x=>x.teacherId),['c','a','b']);
  assert.deepEqual(sortTeacherActivityRows(raw,'effectiveTeachingJp','asc').map(x=>x.teacherId),['b','a','c']);
  assert.deepEqual(sortTeacherActivityRows(raw,'name','desc').map(x=>x.teacherId),['c','b','a']);
  assert.equal(raw[0].teacherId,'a','input row order must remain untouched');
});

test('V3.18 CSV exports only six operational metrics plus teacher', () => {
  const rows: ManagementTeacherAnalyticsRow[] = [{teacherId:'a',teacherName:'Guru "A"',
    effectiveTeachingJp:3,totalLeaveJp:1,effectiveTeachingDays:2,totalLeaveDays:1,
    teachingSharePct:75,leaveSharePct:25}] as ManagementTeacherAnalyticsRow[];
  const csv = buildTeacherAnalyticsCsv(rows);
  assert.match(csv,/"Total JP Mengajar Efektif"/);
  assert.match(csv,/"Total Hari Izin"/);
  assert.match(csv,/"Persentase JP Izin"/);
  assert.match(csv,/"Guru ""A"""/);
  assert.match(csv,/"75.0%","25.0%"/);
  assert.doesNotMatch(csv,/JP Reguler\/Minggu|JP Menjadi Badal/);
  assert.equal(csv.split('\n')[0].split(',').length,7);
});

test('V3.18 deployment keeps prior analytics endpoint and protects new RPC', () => {
  const repo = read('src/infrastructure/repositories/managementAnalyticsRepository.ts');
  const sql = read('supabase/migrations/202610190001_v3_18_effective_teacher_activity.sql');
  const view = read('src/components/LogGuruPengganti.tsx');
  const panel = read('src/components/ManagementAnalytics.tsx');
  assert.match(repo,/ejadwal_management_analytics_v1/);
  assert.match(repo,/ejadwal_teacher_effective_activity_v318/);
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.ejadwal_teacher_effective_activity_v318\(date,date\) FROM PUBLIC,anon/);
  assert.match(sql,/DISTINCT candidate\.teacher_id,candidate\.schedule_date,candidate\.period/);
  assert.match(sql,/source IN \('LEGACY_IMPORT','ADMIN_MANUAL'\)/);
  assert.match(sql,/sc\.blocks_normal_teaching/);
  assert.match(view,/showPastLogs/);
  assert.match(view,/visibility\.past\.length/);
  assert.match(panel,/aria-sort=/);
  assert.match(panel,/sortTeacherActivityRows/);
});
