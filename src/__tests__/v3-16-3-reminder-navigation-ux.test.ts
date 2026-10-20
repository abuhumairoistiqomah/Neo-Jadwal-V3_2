import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const reminder = readFileSync(new URL('../components/EducationReminder.tsx', import.meta.url), 'utf8');
const navSource = app.split('const navItems = [')[1]?.split('\n  ];')[0] ?? '';
const itemPattern = /\{ id: "([^"]+)", label: (?:"([^"]+)"|[^,]+), icon: \w+, adminOnly: (true|false)(?:, section: "([^"]+)")? \}/g;
const parsed = [...navSource.matchAll(itemPattern)].map(match => ({ id: match[1], label: match[2], adminOnly: match[3] === 'true', section: match[4] }));
const byId = (id: string) => parsed.find(item => item.id === id);

test('V3.16.3: teacher navigation uses requested category order without changing route IDs', () => {
  assert.deepEqual(parsed.filter(item => !item.adminOnly).map(item => item.id), [
    'dashboard', 'jadwal-lengkap', 'jadwal-kelas', 'jadwal-ruangan', 'education-calendar',
    'ajukan-izin', 'lengkapi-tugas', 'guru-pengampu-kelas', 'list-mapel', 'jam-kosong-individu',
  ]);
  assert.equal(byId('jadwal-lengkap')?.label, 'Jadwal Pribadi');
  assert.equal(byId('jadwal-lengkap')?.section, 'Jadwal');
  assert.equal(byId('ajukan-izin')?.section, 'Perizinan');
  assert.equal(byId('guru-pengampu-kelas')?.section, 'Statistik');
  assert.equal(byId('dashboard')?.section, undefined);
});

test('V3.16.3: every existing admin route is preserved and grouped logically', () => {
  const adminIds = parsed.filter(item => item.adminOnly).map(item => item.id);
  assert.deepEqual([...adminIds].sort(), [
    'approval-izin', 'approved-leave-list', 'action-center', 'management-analytics', 'teacher-statistics',
    'tabel-jam-kosong', 'jam-kosong-semua', 'rekap-guru', 'master-data',
    'schedule-import', 'schedule-syaikh-import', 'schedule-incidental',
    'substitute-constraints', 'academic-calendar', 'operational-calendar', 'education-calendar-admin',
    'schedule-control-center', 'input-pengganti', 'log-pengganti', 'statistik',
  ].sort());
  assert.equal(byId('approval-izin')?.section, 'Administrasi');
  assert.equal(byId('approved-leave-list')?.label, 'List Badal Pengajuan Badal');
  assert.equal(byId('schedule-incidental')?.section, 'Kelola Jadwal & Kalender');
  assert.equal(byId('operational-calendar')?.adminOnly, true, 'V3.19 operational calendar must remain admin-only');
  assert.equal(byId('operational-calendar')?.label, 'Kalender Operasional KBM');
  assert.equal(byId('management-analytics')?.section, 'Analitik & Rekap');
  assert.equal(byId('master-data')?.section, 'Data & Impor');
  assert.equal(new Set(parsed.map(item => item.id)).size, parsed.length, 'duplicate routes are not allowed');
});

test('V3.16.3: desktop, collapsed desktop, and mobile share section metadata', () => {
  assert.equal((app.match(/navItems\.map\(\(item\) =>/g) ?? []).length, 2);
  assert.equal((app.match(/\{item\.section && \(/g) ?? []).length, 2);
  // V3.17 translates section labels while retaining the same accessible grouping.
  assert.match(app, /role="separator" aria-label=\{t\(item\.section\)\}/);
  assert.match(app, /id=\{`sidebar-nav-\$\{item\.id\}`\}/);
  assert.match(app, /id=\{`mobile-nav-\$\{item\.id\}`\}/);
  assert.match(app, /const showItem = !item\.adminOnly \|\| isAdmin/g);
});

test('V3.16.3: expanded reminder has a bottom-right accessible collapse button', () => {
  assert.match(reminder, /useState\(false\)/);
  assert.match(reminder, /aria-expanded=\{expanded\}/);
  const expandedPart = reminder.slice(reminder.indexOf('{expanded&&'));
  // V3.17 localizes both controls; preserve ordering and accessibility, not hardcoded Indonesian.
  const reminderRows = expandedPart.indexOf('relevant.map(');
  const calendarLink = expandedPart.indexOf('t("Lihat Kalender Pendidikan")');
  const collapseControl = expandedPart.indexOf('aria-label={t("Sembunyikan rincian agenda")}');
  assert.ok(reminderRows >= 0 && calendarLink > reminderRows, 'calendar link must follow event cards');
  assert.ok(collapseControl > calendarLink, 'accessible collapse button must be at the bottom-right');
  assert.match(expandedPart, /justify-between gap-2 pt-1/);
  assert.match(expandedPart, /onClick=\{\(\)=>setExpanded\(false\)\} aria-label=\{t\("Sembunyikan rincian agenda"\)\}/);
  assert.match(reminder, /t\(expanded \? 'rincian ditampilkan' : 'tertutup secara default'\)/);
});
