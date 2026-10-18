import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ar, en, tr, isLocale, localeIntl, supportedLocales, DEFAULT_LOCALE, LOCALE_STORAGE_KEY, displaySchoolWeekRange } from '../i18n/translations';

test('V3.17 exposes three explicit static locales with Indonesian fallback', () => {
  assert.deepEqual(supportedLocales, ['id', 'en', 'ar']);
  assert.equal(DEFAULT_LOCALE, 'id');
  for (const value of supportedLocales) assert.equal(isLocale(value), true);
  assert.equal(isLocale('auto'), false);
  assert.equal(isLocale(null), false);
  assert.ok(LOCALE_STORAGE_KEY.startsWith('ejadwal_ui_language'));
});

test('V3.17 core navigation and teacher features translate into English and Arabic', () => {
  const keys = ['Jadwal Pribadi', 'Jadwal Kelas', 'Jadwal Ruangan', 'Kalender Pendidikan',
    'Ajukan Izin', 'Lengkapi Tugas', 'Persetujuan Izin', 'Agenda 14 Hari Mendatang'];
  for (const key of keys) {
    assert.notEqual(tr(key, 'en'), key, `Missing English: ${key}`);
    assert.notEqual(tr(key, 'ar'), key, `Missing Arabic: ${key}`);
    assert.equal(tr(key, 'id'), key);
  }
});

test('V3.17 UI dictionaries have matching source keys', () => {
  const englishKeys = Object.keys(en).sort();
  const arabicKeys = Object.keys(ar).sort();
  assert.deepEqual(arabicKeys, englishKeys);
  assert.ok(englishKeys.length >= 350);
});

test('V3.17 never translates arbitrary operational data or changes database values', () => {
  for (const raw of ['ANDIKA SETYA WIBOWO, S.Ag', '06 INTER 1', 'Pra Lajnah Ubur',
    'Math', 'OFFICIAL_DUTY', 'WAITING', 'Field Trip Akhwat SMP-SMA']) {
    assert.equal(tr(raw, 'en'), raw);
    assert.equal(tr(raw, 'ar'), raw);
  }
  // Only the option's display text is translated; the stored category stays Indonesian.
  assert.equal(tr('Kegiatan Siswa', 'en'), 'Student Activities');
  assert.equal(tr('Kegiatan Siswa', 'ar'), 'أنشطة الطلاب');
});

test('V3.17 Arabic labels and dates can localize without mirroring timetable direction', () => {
  assert.equal(localeIntl('id'), 'id-ID');
  assert.equal(localeIntl('en'), 'en-GB');
  assert.equal(localeIntl('ar'), 'ar');
  assert.equal(tr('Senin', 'ar'), 'الاثنين');
  assert.equal(tr('Jumat', 'en'), 'Friday');
  assert.notEqual(tr('Khusus Manajemen', 'ar'), 'Khusus Manajemen');
});

test('V3.17 timetable week ranges localize without changing their ISO selection', () => {
  const isoStart = '2026-10-19';
  const isoEnd = '2026-10-23';
  assert.match(displaySchoolWeekRange(isoStart, isoEnd, 'id'), /2026/);
  assert.match(displaySchoolWeekRange(isoStart, isoEnd, 'en'), /Oct/);
  assert.match(displaySchoolWeekRange(isoStart, isoEnd, 'ar'), /أكتوبر|أكت/);
  assert.equal(displaySchoolWeekRange('invalid', isoEnd, 'ar'), `invalid – ${isoEnd}`);
});


test('V3.17.1 calendar selected-day heading receives current locale', () => {
  const calendar = readFileSync(new URL('../components/EducationCalendar.tsx', import.meta.url), 'utf8');
  assert.match(calendar, /pretty\(selectedDate,\s*locale\)/);
  assert.doesNotMatch(calendar, /pretty\(selectedDate\)/);
});
