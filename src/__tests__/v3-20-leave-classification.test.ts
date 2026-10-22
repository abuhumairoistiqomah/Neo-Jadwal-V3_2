import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {normalizeAbsenceCategory,absenceCategoryLabel,summarizeAbsenceCategories} from '../domain/leaveClassificationV320';

const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const sql=read('../../supabase/migrations/202610220001_v3_20_leave_classification.sql');

test('V3.20: only two categories can be chosen on new form; historical remains unknown',()=>{
  assert.equal(normalizeAbsenceCategory('PERSONAL'),'PERSONAL');
  assert.equal(normalizeAbsenceCategory('SCHOOL_DUTY'),'SCHOOL_DUTY');
  assert.equal(normalizeAbsenceCategory('Kegiatan Sekolah'),'UNCLASSIFIED');
  assert.equal(absenceCategoryLabel('UNCLASSIFIED'),'Belum Dikategorikan');
  const form=read('../components/LeaveRequestForm.tsx');
  assert.match(form,/ABSENCE_CATEGORY_OPTIONS/);
  assert.match(form,/setAbsenceCategory/);
  assert.match(form,/Cakupan Izin/);
  assert.match(form,/teacherName, scheduleDate, requestType, absenceCategory/);
});

test('V3.20: JP is unique even for combined classes, while days may intersect',()=>{
  const result=summarizeAbsenceCategories([
    {date:'2026-10-21',period:2,periodType:'TEACHING',category:'PERSONAL'},
    {date:'2026-10-21',period:2,periodType:'TEACHING',category:'PERSONAL'},
    {date:'2026-10-21',period:3,periodType:'TEACHING',category:'SCHOOL_DUTY'},
    {date:'2026-10-21',period:0,periodType:'FREE',category:'PERSONAL'},
    {date:'2026-10-22',period:5,periodType:'TEACHING',category:'UNCLASSIFIED'},
  ]);
  assert.deepEqual(result.PERSONAL,{days:1,teachingJp:1,otherJp:1,totalJp:2});
  assert.deepEqual(result.SCHOOL_DUTY,{days:1,teachingJp:1,otherJp:0,totalJp:1});
  assert.equal(result.UNCLASSIFIED.days,1);
});

test('V3.20: new leave is saved atomically and legacy not heuristically recategorized',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.ejadwal_submit_public_leave_request_v320/i);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.ejadwal_submit_staff_leave_v320/i);
  assert.match(sql,/UPDATE public\.leave_requests SET absence_category=p_absence_category/);
  assert.match(sql,/DEFAULT 'UNCLASSIFIED'/);
  assert.doesNotMatch(sql,/UPDATE public\.leave_requests SET absence_category='SCHOOL_DUTY' WHERE reason/i);
  assert.match(sql,/current_user_is_staff\(\)/);
  assert.match(sql,/V320_LEAVE_CLASSIFICATION/);
});

test('V3.20: official duty and approved requests are distinct inputs with JP dedup',()=>{
  assert.match(sql,/source='OFFICIAL_DUTY'/);
  assert.match(sql,/sc\.is_active/);
  assert.match(sql,/DISTINCT ON \(teacher_id,date,period\)/i);
  assert.match(sql,/p_teacher_id uuid DEFAULT NULL/i);
  const repo=read('../infrastructure/repositories/supabasePublicLeaveRepository.ts');
  assert.match(repo,/ejadwal_submit_public_leave_request_v320/);
  assert.match(repo,/ejadwal_submit_staff_leave_v320/);
  assert.match(read('../infrastructure/repositories/teacherIndividualStatisticsRepository.ts'),/ejadwal_teacher_leave_profile_v320/);
});

test('V3.20 migration filename is unique',()=>{
  const paths=readdirSync(new URL('../../supabase/migrations/',import.meta.url))
    .filter(p=>/^\d{12}_.*\.sql$/.test(p));
  const versions=paths.map(p=>p.slice(0,12));
  assert.equal(versions.length,new Set(versions).size);
});
