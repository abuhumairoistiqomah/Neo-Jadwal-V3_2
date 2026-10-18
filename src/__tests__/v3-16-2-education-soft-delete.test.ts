import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { filterEducationAdminEvents, isEducationEventDeleted, matchesReminderDate, type EducationEvent } from '../domain/educationCalendar';

const event=(overrides:Partial<EducationEvent>={}):EducationEvent=>({
  id:'test',title:'Field Trip',description:'',category:'Kegiatan Siswa',
  start_date:'2026-10-21',end_date:'2026-10-21',status:'PUBLISHED',
  management_only:false,audience_rule:{all:true,groups:[]},deleted_at:null,...overrides,
});

test('V3.16.2: live event still visible and still sends reminders',()=>{
  const active=event();
  assert.equal(isEducationEventDeleted(active),false);
  assert.deepEqual(filterEducationAdminEvents([active],'2026-10-18',false,false),[active]);
  assert.equal(matchesReminderDate(active,'2026-10-18'),true);
});

test('V3.16.2: soft-deleted published events never send reminders',()=>{
  const deleted=event({deleted_at:'2026-10-18T10:00:00Z'});
  assert.equal(isEducationEventDeleted(deleted),true);
  assert.equal(matchesReminderDate(deleted,'2026-10-18'),false);
  assert.deepEqual(filterEducationAdminEvents([deleted],'2026-10-18',false,false),[]);
  assert.deepEqual(filterEducationAdminEvents([deleted],'2026-10-18',false,true),[deleted]);
});

test('V3.16.2: soft deletion is independent of CANCELLED and past-event toggles',()=>{
  const historical=event({id:'past',end_date:'2026-10-10',start_date:'2026-10-10',status:'CANCELLED'});
  const deletedHistorical=event({id:'deleted',end_date:'2026-10-09',start_date:'2026-10-09',deleted_at:'2026-10-18T10:00:00Z'});
  const current=event({id:'current'});
  const all=[historical,deletedHistorical,current];
  assert.deepEqual(filterEducationAdminEvents(all,'2026-10-18',false,false).map(e=>e.id),['current']);
  assert.deepEqual(filterEducationAdminEvents(all,'2026-10-18',true,false).map(e=>e.id),['past','current']);
  assert.deepEqual(filterEducationAdminEvents(all,'2026-10-18',false,true).map(e=>e.id),['deleted','current']);
  assert.deepEqual(filterEducationAdminEvents(all,'2026-10-18',true,true).map(e=>e.id),['past','deleted','current']);
});

test('V3.16.2: normal event queries explicitly exclude deleted rows',()=>{
  const repo=readFileSync(new URL('../infrastructure/repositories/educationCalendarRepository.ts',import.meta.url),'utf8');
  assert.match(repo,/\.is\('deleted_at', null\)\.order\('start_date'/);
  assert.match(repo,/ejadwal_soft_delete_education_event_v1/);
  assert.match(repo,/ejadwal_restore_education_event_v1/);
  assert.match(repo,/\.update\(body\)\.eq\('id', id\)\.is\('deleted_at', null\)/);
});

test('V3.16.2: RLS removes deleted events from EVERY non-admin read policy',()=>{
  const sql=readFileSync(new URL('../../supabase/migrations/202610180001_v3_16_2_education_calendar_soft_delete.sql',import.meta.url),'utf8');
  assert.match(sql,/create policy education_events_public_select[\s\S]*?using \(deleted_at is null and status in/);
  assert.match(sql,/create policy education_events_staff_secret_select[\s\S]*?using \(deleted_at is null and management_only/);
  assert.match(sql,/create policy education_events_staff_secret_select[\s\S]*?current_user_is_staff\(\)/);
  assert.match(sql,/auth\.uid\(\) is null or not public\.current_user_has_role\('ADMIN'\)/);
  assert.match(sql,/set deleted_at = now\(\), deleted_by = auth\.uid\(\)/);
  assert.match(sql,/set deleted_at = null, restored_at = now\(\), restored_by = auth\.uid\(\)/);
  assert.match(sql,/revoke all on function public\.ejadwal_soft_delete_education_event_v1\(uuid\) from public, anon/);
  assert.doesNotMatch(sql,/create policy .*\bdelete\b on public\.education_calendar_events/i);
});

test('V3.16.2: admin UI confirms delete and allows restoring in opt-in view',()=>{
  const ui=readFileSync(new URL('../components/EducationCalendarAdmin.tsx',import.meta.url),'utf8');
  assert.match(ui,/Tampilkan kegiatan terhapus/);
  assert.match(ui,/\[showDeletedEvents,setShowDeletedEvents\]=useState\(false\)/);
  assert.match(ui,/window\.confirm\(`Hapus kegiatan/);
  assert.match(ui,/window\.confirm\(`Pulihkan kegiatan/);
  assert.match(ui,/disabled=\{busy\} onClick=\{\(\)=>void remove\(e\)\}/);
  assert.match(ui,/disabled=\{busy\} onClick=\{\(\)=>void restore\(e\)\}/);
});
