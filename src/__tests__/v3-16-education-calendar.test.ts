import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addEducationDays, matchesEducationAudience, matchesReminderDate, validateAudience, type AudienceRule, type EducationEvent } from '../domain/educationCalendar';
import type { Teacher, ScheduleItem } from '../types';

const teacher: Teacher = { id:'teacher-a', nama:'GURU A', mapel_utama:'Math', rumpun:'', jenjang:'', tugas_tambahan:'', keterangan:'', wali_kelas:'' };
const template: ScheduleItem = {id:'one',kelas:'06 INTER 1 I',hari:'Senin',jam_ke:2,mulai:'',selesai:'',mapel:'English',guru1:'GURU A',guru2:'',guru3:'',guru4:'',guru5:'',guru6:'',kelasgabung:''};
const schedules: ScheduleItem[] = [template,{...template,id:'two',kelas:'10 AE 1 I',mapel:'Math'}];
const rule=(classes:string[],mapel='Math'):AudienceRule=>({all:false,groups:[
  {op:'OR',join:'AND',tags:classes.map(value=>({kind:'CLASS' as const,value}))},
  {op:'OR',join:'AND',tags:[{kind:'SUBJECT',value:mapel}]},
]});
const event=(overrides:Partial<EducationEvent>={}):EducationEvent=>({id:'evt',title:'Kegiatan',description:'',category:'Akademik',start_date:'2026-10-23',end_date:'2026-10-23',status:'PUBLISHED',management_only:false,audience_rule:{all:true,groups:[]},...overrides});

test('V3.16: AND academic tags must match same class-subject assignment',()=>{
  assert.equal(matchesEducationAudience(rule(['06 INTER','12 AE']),teacher,schedules,[]),false,
    'English taught in 06 must NOT combine with Math taught in grade 10');
  assert.equal(matchesEducationAudience(rule(['06 INTER','12 AE']),teacher,[...schedules,{...template,id:'three',kelas:'12 AE 1 I',mapel:'Math'}],[]),true);
  assert.equal(matchesEducationAudience(rule(['06 INTER','12 AE'],'English'),teacher,schedules,[]),true);
});

test('V3.16: class prefix matches all streams but not other grades',()=>{
  assert.equal(matchesEducationAudience(rule(['06 INTER'],'English'),teacher,[template],[]),true);
  assert.equal(matchesEducationAudience(rule(['12 AE'],'English'),teacher,[template],[]),false);
});

test('V3.16: class tags also recognize explicit combined-class references',()=>{
  const combined={...template,kelas:'06 INTER 1 I',kelasgabung:'06 INTER 1 I, 06 INTER 2 I',mapel:'Math'};
  assert.equal(matchesEducationAudience(rule(['06 INTER 2 I'],'Math'),teacher,[combined],[]),true);
});

test('V3.16: AND role and OR groups respect same assignment, support teams',()=>{
  const withRole:AudienceRule={all:false,groups:[
    {join:'AND',op:'OR',tags:[{kind:'CLASS',value:'06 INTER'},{kind:'CLASS',value:'12 AE'}]},
    {join:'AND',op:'OR',tags:[{kind:'SUBJECT',value:'Math'}]},
    {join:'AND',op:'OR',tags:[{kind:'ROLE',value:'PENGAMPU'}]},
  ]};
  const rows=[{...template,kelas:'06 INTER 1 I',mapel:'Math',guru1:'GURU B',guru2:'GURU A'}];
  assert.equal(matchesEducationAudience(withRole,teacher,rows,[]),false);
  assert.equal(matchesEducationAudience({...withRole,groups:withRole.groups.slice(0,2)},teacher,rows,[]),true);
  const teams:AudienceRule={all:false,groups:[{op:'OR',join:'AND',tags:[{kind:'TEAM',value:'WAKAKUR'}]}]};
  assert.equal(matchesEducationAudience(teams,teacher,[],[{teacher_id:'teacher-a',team_code:'WAKAKUR'}]),true);
  assert.equal(matchesEducationAudience(teams,teacher,[],[]),false);
});

test('V3.16: explicit OR between groups works with class/subject logic',()=>{
  const ruleOr:AudienceRule={all:false,groups:[{op:'OR',join:'AND',tags:[{kind:'CLASS',value:'06 INTER'}]},{op:'OR',join:'OR',tags:[{kind:'SUBJECT',value:'Math'}]}]};
  assert.equal(matchesEducationAudience(ruleOr,teacher,schedules,[]),true);
});

test('V3.16: empty groups fail-closed; all is explicit',()=>{
  assert.ok(validateAudience({all:false,groups:[]}));
  assert.equal(matchesEducationAudience({all:false,groups:[]},teacher,schedules,[]),false);
  assert.equal(matchesEducationAudience({all:true,groups:[]},teacher,[],[]),true);
});

test('V3.16: reminder inclusive H-14, excludes past and cancelled events',()=>{
  assert.equal(addEducationDays('2026-10-17',14),'2026-10-31');
  assert.equal(matchesReminderDate(event(),'2026-10-17'),true);
  assert.equal(matchesReminderDate(event({start_date:'2026-11-01',end_date:'2026-11-01'}),'2026-10-17'),false);
  assert.equal(matchesReminderDate(event({status:'CANCELLED'}),'2026-10-17'),false);
  assert.equal(matchesReminderDate(event({start_date:'2026-10-12',end_date:'2026-10-18'}),'2026-10-17'),true);
  assert.equal(matchesReminderDate(event({start_date:'2026-10-12',end_date:'2026-10-16'}),'2026-10-17'),false);
});

test('V3.16: database policies hide confidential title/details and prevent anonymous writes',()=>{
  const sql=readFileSync(new URL('../../supabase/migrations/202610170002_v3_16_education_calendar.sql',import.meta.url),'utf8');
  assert.match(sql,/education_events_public_select[\s\S]*management_only\s*=\s*false/i);
  assert.match(sql,/education_events_staff_secret_select[\s\S]*current_user_is_staff\(\)/i);
  assert.match(sql,/education_events_admin_insert[\s\S]*current_user_has_role\('ADMIN'\)/i);
  assert.doesNotMatch(sql,/create policy.*education_events.*select\s+on\s+public.education_calendar_events\s+for\s+select\s+to\s+anon, authenticated\s+using\s*\(true\)/i);
});

test('V3.16: navigation, default-collapsed reminder and private account identity',()=>{
  const app=readFileSync(new URL('../App.tsx',import.meta.url),'utf8');
  const reminder=readFileSync(new URL('../components/EducationReminder.tsx',import.meta.url),'utf8');
  assert.match(app,/id:\s*"education-calendar"/);
  assert.match(app,/id:\s*"education-calendar-admin"/);
  assert.match(reminder,/setExpanded\]\s*=\s*useState\(false\)/);
  assert.match(reminder,/e\.management_only\?teachers\.find\(t=>t\.id&&t\.id===context\?\.teacherId\)/);
});
