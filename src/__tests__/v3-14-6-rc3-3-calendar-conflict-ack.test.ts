import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { atomicClassChoices, expandCalendarClassIds, splitClassMembers } from "../domain/academicCalendarClasses";
import { conflictFingerprint, isConflictHidden, updateHiddenConflict } from "../domain/conflictAcknowledgements";
import { isClassCoveredByEvent } from "../domain/calendar";
import { getErrorMessage } from "../domain/errorMessage";
import type { ScheduleConflict } from "../domain/scheduleConflicts";

const rows = [
  { id: "a", display_name: "01 MQ AKHWAT" },
  { id: "b", display_name: "02 MQ AKHWAT" },
  { id: "c", display_name: "03 INTER 1 I" },
  { id: "ab", display_name: "01 MQ AKHWAT & 02 MQ AKHWAT" },
  { id: "ac", display_name: "01 MQ AKHWAT + 03 INTER 1 I" },
];

test("RC3.3 calendar picker excludes legacy composed teaching-class labels", () => {
  assert.deepEqual(atomicClassChoices(rows).map((row) => row.id), ["a", "b", "c"]);
  assert.deepEqual(splitClassMembers(rows[3].display_name), ["01 MQ AKHWAT", "02 MQ AKHWAT"]);
});

test("RC3.3 legacy groups expand into atomic IDs, deduplicated", () => {
  assert.deepEqual(expandCalendarClassIds(["ab", "a", "ac"], rows), {
    classIds: ["a", "b", "c"], unresolvedLegacyIds: [],
  });
});

test("RC3.3 unresolved legacy groups are preserved instead of silently dropped", () => {
  assert.deepEqual(expandCalendarClassIds(["legacy"], [
    ...rows, { id: "legacy", display_name: "01 MQ AKHWAT & 99 MQ AKHWAT" },
  ]), { classIds: [], unresolvedLegacyIds: ["legacy"] });
});

test("RC3.3 one atomic calendar class covers an actual combined teaching session", () => {
  const event = {
    id: "calendar-1", cakupan: "Kelas", kelas: "01 MQ AKHWAT", tanggal_mulai: "2026-10-14",
    tanggal_selesai: "2026-10-14", nama_kegiatan: "Rumah Tahfidz 2", tipe: "Kegiatan",
    jp_mulai: 1, jp_selesai: 6, status: "Aktif",
  };
  assert.equal(isClassCoveredByEvent(event, "01 MQ AKHWAT & 02 MQ AKHWAT"), true);
  assert.equal(isClassCoveredByEvent(event, "03 INTER 1 I"), false);
});

const conflict: ScheduleConflict = {
  id: "teacher:adji:2026-10-12:3", kind: "TEACHER", severity: "WARNING",
  title: "Potensi bentrok", detail: "Ruang A dan Ruang B", dayOrDate: "2026-10-12",
  period: 3, classes: ["09 AE 2 A", "09 MQ AKHWAT"], teachers: ["ADJI"],
};

test("RC3.3 hidden conflicts are reversible; changed conflict details re-open alert", () => {
  const hidden = updateHiddenConflict({}, conflict, true);
  assert.equal(isConflictHidden(conflict, hidden), true);
  assert.equal(isConflictHidden({ ...conflict, detail: "Ruang baru" }, hidden), false);
  assert.equal(isConflictHidden(conflict, updateHiddenConflict(hidden, conflict, false)), false);
  assert.ok(conflictFingerprint(conflict).includes("Ruang A"));
});

test("RC3.3 calendar errors show Supabase detail and code, not object Object", () => {
  const message = getErrorMessage({ message: "permission denied", details: "academic_events", code: "42501" });
  assert.match(message, /permission denied/);
  assert.match(message, /42501/);
  assert.doesNotMatch(message, /object Object/);
  const postgrestLike = Object.assign(new Error("permission denied"), { details: "policy blocked", code: "42501" });
  assert.match(getErrorMessage(postgrestLike), /policy blocked/);
  assert.match(getErrorMessage(postgrestLike), /42501/);
});

test("RC3.4.1 calendar revision is atomic and versions once after complete batch", () => {
  const code = readFileSync("src/infrastructure/repositories/operationalRulesRepository.ts", "utf8");
  const migration = readFileSync("supabase/migrations/202610110052_v3_14_6_calendar_bulk_versioning.sql", "utf8");
  assert.match(code, /client\.rpc\("ejadwal_save_academic_event_group_v2"/);
  assert.match(migration, /perform set_config\('ejadwal\.calendar_bulk_mode', 'on', true\)/);
  assert.match(migration, /ACADEMIC_EVENT_GROUP_PUBLISH/);
  const block = migration.slice(migration.indexOf("create or replace function public.ejadwal_save_academic_event_group_v2"));
  assert.ok(block.indexOf("insert into public.academic_events(") < block.indexOf("update public.academic_events set status = 'INACTIVE'"));
  assert.ok(block.indexOf("update public.academic_events set status = 'INACTIVE'") < block.indexOf("'ACADEMIC_EVENT_GROUP_PUBLISH'"));
});

test("RC3.3 UI uses canonical classes and local reversible conflict visibility", () => {
  const calendar = readFileSync("src/components/AcademicCalendarAdmin.tsx", "utf8");
  const control = readFileSync("src/components/ScheduleControlCenter.tsx", "utf8");
  const action = readFileSync("src/components/OperationalActionCenter.tsx", "utf8");
  assert.match(calendar, /atomicClassChoices\(classes\)/);
  assert.match(calendar, /expandCalendarClassIds\(group.classIds, classes\)/);
  assert.match(calendar, /getErrorMessage\(err/);
  assert.match(control, /Sembunyikan \/ Sudah Ditangani/);
  assert.match(control, /Lihat yang disembunyikan/);
  assert.match(action, /isConflictHidden\(conflict, hiddenConflicts\)/);
});
