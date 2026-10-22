import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("V3.14.6 RC3.4.4.1 keeps task navigation enabled on mobile and desktop", () => {
  const app = read("src/App.tsx");
  assert.match(app, /id: "lengkapi-tugas"/);
  assert.doesNotMatch(app, /item\.disabled/);
  assert.match(app, /id={`sidebar-nav-\$\{item\.id\}`}/);
  assert.match(app, /id={`mobile-nav-\$\{item\.id\}`}/);
});

test("RC3.4.4.1 explicitly preserves academic event group type through history filtering", () => {
  const calendar = read("src/components/AcademicCalendarAdmin.tsx");
  assert.match(calendar, /filterOperationalHistory<AcademicEventGroup>\(groups,/);
  assert.match(calendar, /isPastAcademicEvent\(group, schoolToday\)/);
  assert.match(calendar, /displayedGroups\.map\(\(group\)/);
});

test("RC3.4.4.1 explicitly preserves substitute rule type through history filtering", () => {
  const rules = read("src/components/SubstituteConstraintAdmin.tsx");
  assert.match(rules, /filterOperationalHistory<SubstituteConstraintAdminRow>\(\s*rows\.filter/);
  assert.match(rules, /showDeletedRules \|\| !row\.deleted_at/);
  assert.match(rules, /isPastSubstituteRule\(row, schoolToday\)/);
  assert.match(rules, /displayedRules\.map\(\(row\)/);
});

test("RC3.4.4.1 still offers 2, 3, 4 week rotation options via searchable control", () => {
  const quick = read("src/components/ScheduleQuickEditor.tsx");
  assert.match(quick, /\[2,3,4\]\.map/);
  assert.match(quick, /label:\s*`1 kali \/ \$\{weeks\} minggu`/);
  assert.match(quick, /setRotationEveryWeeks/);
});
