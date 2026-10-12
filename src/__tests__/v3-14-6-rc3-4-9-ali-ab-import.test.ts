import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGACY_ROTATION_HEADER } from "../domain/syaikhAlternatingLegacyImport";
import {
  buildFlexibleDatedRotation, getFlexibleTemplateSlots, parseFlexibleDatedTSV, prepareFlexibleWeek,
} from "../domain/syaikhFlexibleDatedImport";
import type { ScheduleItem, JadwalInsidentalItem } from "../domain/models";
import type { ScheduleImportClassMaster, ScheduleImportTeacherMaster } from "../domain/scheduleImport";

const teachers: ScheduleImportTeacherMaster[] = [
  ["s", "Syaikh Ali Ali Sinan", "Syaikh Ali"],
  ["h", "MUHAMMAD HUSEIN HAIKAL, S.Pd.", "Haikal"],
  ["a", "ALIEF", "Alief"], ["u", "UKASYAH", "Ukasyah"],
  ["t", "MUHAMMAD TSAQIF ABDURRAHMAN, S.Pd.", "Tsaqif"],
  ["r", "ARIA FARISKA, S.E.I., M.Pd.", "Aria"],
  ["z", "AHMAD ZAKI", "Zaki"], ["f", "SALMAN AL FARISI, S.Pd.", "Salman"],
].map(([id, full_name, short_name]) => ({ id, full_name, short_name }));
const classes: ScheduleImportClassMaster[] = ["10 AE 1 I", "11 AE 1 I", "12 AE 1 I", "12 AE 2 I"]
  .map((name) => ({ id: name, code: name, display_name: name }));
const schedules = classes.map((klass, i) => ({ id: String(i), kelas: klass.display_name, hari: "Senin",
  jam_ke: i < 2 ? 1 : 4, mapel: "Tahsin Syaikh" })) as unknown as ScheduleItem[];
function item(date: string, klass: string, jp: number, subject: string, ...team: string[]): string {
  return [date, klass, jp, subject, ...Array.from({length:6}, (_,i)=>team[i] || ""), "", "", "", ""].join("\t");
}
const aText = [LEGACY_ROTATION_HEADER,
  item("2026-10-05", "10 AE 1 I", 1, "Tahsin Syaikh", "Syaikh Ali Ali Sinan", "Haikal"),
  item("2026-10-05", "11 AE 1 I", 1, "Al-Qur'an", "Alief", "Ukasyah", "Tsaqif"),
  item("2026-10-05", "12 AE 1 I", 4, "Tahsin Syaikh", "Syaikh Ali Ali Sinan", "Aria"),
].join("\n");
const bText = [LEGACY_ROTATION_HEADER,
  item("2026-10-05", "10 AE 1 I", 1, "Al-Qur'an", "Haikal", "Ukasyah", "Tsaqif"),
  item("2026-10-05", "11 AE 1 I", 1, "Tahsin Syaikh", "Syaikh Ali Ali Sinan", "Alief"),
  item("2026-10-05", "12 AE 2 I", 4, "Tahsin Syaikh", "Syaikh Ali Ali Sinan", "Aria"),
].join("\n");
function build(datedText: string, incidentals: JadwalInsidentalItem[] = []) {
  return buildFlexibleDatedRotation({ datedText, selectedSyaikhId: "s", classes, teachers, aliases: [], schedules, incidentals });
}

test("A/B templates are optional configurations, not mandatory pairs or automatic parity", () => {
  const slots = getFlexibleTemplateSlots(aText, bText);
  assert.equal(slots.slots.length, 4); // 12 AE 1 only A; 12 AE 2 only B
  assert.deepEqual(slots.issues.filter((i) => i.severity === "ERROR"), []);
  assert.equal(slots.slots.find((s) => s.className === "12 AE 1 I")?.b, undefined);
});
test("skip and per-class choices generate only explicitly selected dates", () => {
  const slots = getFlexibleTemplateSlots(aText, bText).slots;
  const picks = Object.fromEntries(slots.map((slot) => [slot.key, slot.className === "10 AE 1 I" ? "B" : slot.className === "12 AE 1 I" ? "A" : "SKIP"])) as Record<string, "A" | "B" | "SKIP">;
  const plan = prepareFlexibleWeek({ aText, bText, monday: "2026-10-12", selections: picks });
  assert.deepEqual(plan.issues.filter((i) => i.severity === "ERROR"), []);
  assert.equal(plan.lines.length, 2);
  const dated = [LEGACY_ROTATION_HEADER, ...plan.lines].join("\n");
  const compiled = build(dated);
  assert.equal(compiled.rows.length, 2);
  assert.equal(compiled.rows.find((r) => r.className === "10 AE 1 I")?.subject, "Al-Qur'an");
  assert.deepEqual(compiled.rows.find((r) => r.className === "10 AE 1 I")?.teacherIds, ["h", "u", "t"]);
  assert.equal(compiled.rows.some((r) => r.className === "11 AE 1 I"), false);
  assert.equal(compiled.rows.some((r) => r.scheduleDate === "2026-10-19"), false);
});
test("different weeks can have any sequence and independent class decisions", () => {
  const dated = [LEGACY_ROTATION_HEADER,
    item("2026-10-12", "10 AE 1 I", 1, "Al-Qur'an", "Haikal", "Ukasyah", "Tsaqif"),
    item("2026-10-26", "11 AE 1 I", 1, "Tahsin Syaikh", "Syaikh Ali Ali Sinan", "Alief"),
    item("2026-11-02", "10 AE 1 I", 1, "Al-Qur'an", "Haikal", "Ukasyah", "Tsaqif"),
  ].join("\n");
  const result = build(dated);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.issues.filter((i) => i.severity === "ERROR"), []);
  assert.equal(result.rows.filter((row) => row.rotationStatus === "NATIVE").length, 1);
  assert.equal(schedules[0].mapel, "Tahsin Syaikh");
});
test("direct dated TSV requires valid columns and blocks duplicates on same date/class/JP", () => {
  const duplicated = [LEGACY_ROTATION_HEADER,
    item("2026-10-12", "10 AE 1 I", 1, "Tahsin Syaikh", "Syaikh Ali Ali Sinan"),
    item("2026-10-12", "10 AE 1 I", 1, "Al-Qur'an", "Haikal")].join("\n");
  assert.ok(parseFlexibleDatedTSV(duplicated).issues.some((i) => i.code === "DUPLICATE_DATED_SLOT"));
});
test("a class with no counterpart may be scheduled; absent teachers are never guessed", () => {
  const onlyA = prepareFlexibleWeek({ aText, bText: LEGACY_ROTATION_HEADER, monday: "2026-10-19", selections: {
    [getFlexibleTemplateSlots(aText, LEGACY_ROTATION_HEADER).slots[0].key]: "A",
  } });
  assert.equal(onlyA.lines.length, 1);
  const bad = build([LEGACY_ROTATION_HEADER, item("2026-10-19", "10 AE 1 I", 1, "Tahsin Syaikh", "UNKNOWN")].join("\n"));
  assert.ok(bad.issues.some((i) => i.code === "TEACHER_NOT_FOUND"));
});
test("other incidental ownership is protected from new rotation", () => {
  const incidentals = [{tanggal:"2026-10-12", kelas:"10 AE 1 I", jam_ke:1, tipe_insidental:"Perubahan Jadwal"}] as JadwalInsidentalItem[];
  const result = build([LEGACY_ROTATION_HEADER, item("2026-10-12", "10 AE 1 I", 1, "Tahsin Syaikh", "Syaikh Ali Ali Sinan")].join("\n"), incidentals);
  assert.ok(result.issues.some((i) => i.code === "OTHER_INCIDENTAL_OWNS_SLOT"));
});
test("rotation of another Syaikh is protected", () => {
  const inc = [{tanggal:"2026-10-12",kelas:"10 AE 1 I", jam_ke:1, tipe_insidental:"SYAIKH_ROTATION", alasan:"Rotasi Syaikh Manshur"}] as JadwalInsidentalItem[];
  const result = build([LEGACY_ROTATION_HEADER, item("2026-10-12", "10 AE 1 I", 1, "Tahsin Syaikh", "Syaikh Ali Ali Sinan")].join("\n"), inc);
  assert.ok(result.issues.some((i) => i.code === "OTHER_SYAIKH_ROTATION"));
});
test("no date iteration in new Ali importer; Log Badal compact actions kept", () => {
  const importer = readFileSync("src/components/SyaikhAlternatingLegacyImporter.tsx", "utf8");
  const old = readFileSync("src/domain/syaikhAlternatingLegacyImport.ts", "utf8");
  const log = readFileSync("src/components/LogGuruPengganti.tsx", "utf8");
  assert.match(importer, /parseFlexibleDatedTSV/);
  assert.match(importer, /Lewati — jangan ubah/);
  assert.doesNotMatch(importer, /startScenario|w % 2/);
  assert.doesNotMatch(old, /buildAlternatingLegacyRotation/);
  assert.match(log, /sticky right-0/);
  assert.match(log, /aria-label=\{`Batalkan log badal/);
});
test("missing selection is not a silent A default and never suppresses master", () => {
  const preview = prepareFlexibleWeek({ aText, bText, monday: "2026-10-12", selections: {} });
  assert.equal(preview.lines.length, 0);
  assert.equal(preview.skipped, 4);
});
