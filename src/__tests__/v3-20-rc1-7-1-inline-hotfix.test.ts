import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=(p:string)=>readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');

test('task picker is editable by management and explicitly persisted to canonical task',()=>{
 const picker=read('src/components/InputGuruPengganti.tsx');
 assert.match(picker,/saveTeacherTaskAtPicker/);
 assert.match(picker,/adminTaskRepository\.editTeacherTask/);
 assert.match(picker,/Simpan Perubahan Tugas \(Audit\)/);
 assert.doesNotMatch(picker,/readOnly=\{taskOwnership === "LEAVE_TEACHER"\}/);
 assert.match(picker,/Ada perubahan tugas belum disimpan/);
});

test('events are edited in existing weekly room calendar, without any new menu',()=>{
 const app=read('src/App.tsx');
 assert.doesNotMatch(app,/reservasi-ruangan/);
 const editor=read('src/components/WeeklyRoomEditor.tsx');
 assert.match(editor,/Reservasi Event/);
 assert.match(editor,/await eventRepo\.save\(eventForm\)/);
 assert.match(editor,/Tidak perlu memilih kelas pengguna atau guru/);
 const calendar=read('src/components/JadwalRuangan.tsx');
 assert.match(calendar,/eventAtPeriod/);
 assert.match(calendar,/eventRepo|eventRepository/);
 assert.match(calendar,/initialEvent=\{editingRoomSlot\.initialEvent\}/);
});

test('calendar has read-only limited guest projection and event time collision stays on server',()=>{
 const sql=read('supabase/migrations/202610300003_v3_20_rc1_7_1_room_calendar_integrated.sql');
 assert.match(sql,/ejadwal_public_room_calendar_rc171/);
 assert.doesNotMatch(sql,/r\.organizer|r\.description/);
 assert.match(sql,/TO anon,authenticated/);
 const repo=read('src/infrastructure/repositories/roomEventReservationsRepository.ts');
 assert.match(repo,/async listPublic/);
 assert.match(repo,/ejadwal_upsert_room_event_rc17/);
});
