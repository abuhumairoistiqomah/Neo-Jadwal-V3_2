import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getHorizontalScrollMetrics, getDraggedScrollLeft, syncHorizontalScroll } from '../domain/tableNavigation.ts';

const component = readFileSync('src/components/ManagementAnalytics.tsx', 'utf8');

test('RC2 geometry only enables top horizontal scrollbar when columns overflow', () => {
  assert.deepEqual(getHorizontalScrollMetrics(350, 1120), { viewportWidth: 350, contentWidth: 1120, hasOverflow: true });
  assert.equal(getHorizontalScrollMetrics(1200, 1120).hasOverflow, false);
  assert.equal(getHorizontalScrollMetrics(0, 0).hasOverflow, false);
});

test('RC2 top/bottom scroll positions are synced in either direction without oscillation', () => {
  const top = { scrollLeft: 120 };
  const table = { scrollLeft: 0 };
  syncHorizontalScroll(top, table);
  assert.equal(table.scrollLeft, 120);
  table.scrollLeft = 215;
  syncHorizontalScroll(table, top);
  assert.equal(top.scrollLeft, 215);
  syncHorizontalScroll(null, top);
  assert.equal(top.scrollLeft, 215);
  top.scrollLeft = 215.25;
  syncHorizontalScroll(top, table);
  assert.equal(table.scrollLeft, 215, 'subpixel difference should not create feedback jitter');
});

test('RC2 mouse drag scrolls in opposite direction to cursor motion', () => {
  assert.equal(getDraggedScrollLeft(100, 200, 160), 140);
  assert.equal(getDraggedScrollLeft(100, 200, 240), 60);
});

test('RC2 table has a vertically bounded native scroller and frozen header/teacher name', () => {
  assert.match(component, /max-h-\[min\(58vh,520px\)\] overflow-auto/);
  assert.match(component, /<thead className="sticky top-0/);
  assert.match(component, /className="sticky left-0 z-40/);
  assert.match(component, /className="sticky left-0 z-10/);
  assert.match(component, /aria-label="Beban Operasional Guru — tabel dapat digulir"/);
  assert.match(component, /aria-sort=/, 'click-to-sort must remain available');
  assert.match(component, /buildTeacherAnalyticsCsv\(teacherRows\)/, 'CSV must preserve table sorting');
});

test('RC2 mouse drag excludes interactive controls and leaves touch scrolling native', () => {
  assert.match(component, /event.pointerType !== 'mouse'/);
  assert.match(component, /closest\('thead,button,a,input,select,textarea/);
  assert.match(component, /onScroll=\{onTopTableScroll\}/);
  assert.match(component, /onScroll=\{onBodyTableScroll\}/);
  assert.match(component, /onPointerCancel=\{finishTableDrag\}/);
  assert.match(component, /onLostPointerCapture=\{finishTableDrag\}/);
});
