import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { getTeacherWeekSlotAnnotations } from '../domain/schedule/teacherWeeklyPresentation';

test('Incidentals expose supervision detail on both mobile and desktop', () => {
  const ann = getTeacherWeekSlotAnnotations([{weekStatus:'INSIDENTAL',weekDetail:'Ustadzah Asysyifa supervisi dengan Mr. Is',keterangan_khusus:''}], 'EFFECTIVE');
  assert.deepEqual(ann.statusLabels,['INSIDENTAL']);
  assert.deepEqual(ann.operationalDetails,['Ustadzah Asysyifa supervisi dengan Mr. Is']);
});

test('Official duties, badal, leave and calendar reasons survive presentation', () => {
  const ann = getTeacherWeekSlotAnnotations([
    {weekStatus:'TUGAS_RESMI',weekDetail:'Mengawas TKA',keterangan_khusus:''},
    {weekStatus:'BADAL',weekDetail:'Mengganti: Andika',keterangan_khusus:''},
    {weekStatus:'IZIN',weekDetail:'Digantikan: Salman',keterangan_khusus:''},
    {weekStatus:'KALENDER',weekDetail:'KBM dibatalkan',keterangan_khusus:''},
  ], 'EFFECTIVE');
  assert.deepEqual(ann.statusLabels,['TUGAS SEKOLAH — TIDAK MENGAJAR','BADAL','IZIN','KALENDER / KBM BATAL']);
  assert.equal(ann.operationalDetails.length, 4);
});

test('Master mode ignores dated overrides but retains special notes', () => {
  const ann = getTeacherWeekSlotAnnotations([{weekStatus:'INSIDENTAL',weekDetail:'TO TKA',keterangan_khusus:'Kelas pindah ruang'}], 'MASTER');
  assert.deepEqual(ann.statusLabels,[]);
  assert.deepEqual(ann.operationalDetails,[]);
  assert.deepEqual(ann.specialNotes,['Kelas pindah ruang']);
});

test('Repeated notes and whitespace do not produce duplicate mobile lines', () => {
  const ann = getTeacherWeekSlotAnnotations([
    {weekStatus:'INSIDENTAL',weekDetail:'  Supervisi dengan Mr. Is  ',keterangan_khusus:'supervisi dengan mr. is'},
    {weekStatus:'INSIDENTAL',weekDetail:'Supervisi dengan Mr. Is',keterangan_khusus:'Pendamping Asysyifa'},
  ], 'EFFECTIVE');
  assert.deepEqual(ann.operationalDetails,['Supervisi dengan Mr. Is']);
  assert.deepEqual(ann.specialNotes,['Pendamping Asysyifa']);
  assert.deepEqual(ann.statusLabels,['INSIDENTAL']);
});

test('Desktop AND mobile consume the same operational annotations in timetable source', () => {
  const component = readFileSync(new URL('../components/JadwalLengkap.tsx', import.meta.url), 'utf8');
  assert.equal(component.match(/getTeacherWeekSlotAnnotations\(items, scheduleMode\)/g)?.length, 2);
  assert.equal(component.match(/annotations\.statusLabels\.map/g)?.length, 2);
  assert.equal(component.match(/annotations\.operationalDetails\.map/g)?.length, 2);
  assert.equal(component.match(/annotations\.specialNotes\.map/g)?.length, 2);
});
