import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isEducationEventPast } from '../domain/educationCalendar';

test('V3.16.1: single-day events disappear only after the school date', () => {
  const event = {start_date:'2026-10-21',end_date:'2026-10-21'};
  assert.equal(isEducationEventPast(event,'2026-10-20'),false);
  assert.equal(isEducationEventPast(event,'2026-10-21'),false);
  assert.equal(isEducationEventPast(event,'2026-10-22'),true);
});

test('V3.16.1: multi-day event remains visible until its last day', () => {
  const event = {start_date:'2026-10-17',end_date:'2026-10-23'};
  assert.equal(isEducationEventPast(event,'2026-10-22'),false);
  assert.equal(isEducationEventPast(event,'2026-10-23'),false);
  assert.equal(isEducationEventPast(event,'2026-10-24'),true);
});

test('V3.16.1: archive is date-based regardless of event status, no deletion', () => {
  const statuses=['DRAFT','PUBLISHED','CANCELLED'];
  for (const status of statuses) {
    assert.equal(isEducationEventPast({start_date:'2026-10-15',end_date:'2026-10-16'},'2026-10-18'),true, status);
  }
  assert.equal(isEducationEventPast({start_date:'2026-10-17',end_date:'2026-10-19'},'2026-10-18'),false);
});

test('V3.16.1: editor scrolls its own content-pane ancestor into view', () => {
  const source=readFileSync(new URL('../components/EducationCalendarAdmin.tsx', import.meta.url),'utf8');
  assert.match(source,/editorRef\.current\?\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
  assert.match(source,/ref=\{editorRef\}/);
  assert.doesNotMatch(source,/window\.scrollTo/);
});

test('V3.16.1: history checkbox is default OFF, applies to visible count and list', () => {
  const source=readFileSync(new URL('../components/EducationCalendarAdmin.tsx', import.meta.url),'utf8');
  assert.match(source,/\[showPastEvents,setShowPastEvents\]=useState\(false\)/);
  assert.match(source,/filterEducationAdminEvents\(events,schoolToday,showPastEvents,showDeletedEvents\)/);
  assert.match(source,/checked=\{showPastEvents\}/);
  assert.match(source,/Tampilkan kegiatan lampau/);
  // V3.17 localizes the list heading, while the visible-event count stays coupled to filtering.
  assert.match(source,/\{t\("Daftar Kegiatan"\)\} \(\{visibleEvents\.length\}\)/);
  assert.match(source,/visibleEvents\.map\(/);
  assert.match(source,/getSchoolTodayISO\(\)/);
});
