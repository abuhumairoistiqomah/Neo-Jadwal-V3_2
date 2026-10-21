import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/components/SubstituteConstraintAdmin.tsx', 'utf8');
const editor = src.slice(src.indexOf('const SubstituteConstraintEditor:'), src.indexOf('export const SubstituteConstraintAdmin:'));
const admin = src.slice(src.indexOf('export const SubstituteConstraintAdmin:'));

test('RC3.1: typing in reason or changing form select stays inside child editor', () => {
  assert.match(editor, /const \[reason, setReason\] = useState\(editingRow\?\.reason \|\| ""\)/);
  assert.match(editor, /value=\{reason\} onChange=\{\(e\) => setReason\(e\.target\.value\)\}/);
  assert.match(editor, /const \[teacherId, setTeacherId\] = useState/);
  assert.match(editor, /const \[periodStart, setPeriodStart\] = useState/);
  assert.doesNotMatch(admin, /\[reason, setReason\]|\[teacherId, setTeacherId\]|\[periodStart, setPeriodStart\]/);
  assert.match(admin, /<SubstituteConstraintEditor\s+key=\{editorRevision\}/);
});

test('RC3.1: expensive coverage is memoized against actual data, never against form reason', () => {
  assert.match(admin, /const coverageByRule = useMemo\(\(\) =>/);
  assert.match(admin, /for \(const rule of displayedRules\)/);
  assert.match(admin, /const assigned = coverageByRule\.get\(row\.id\)/);
  assert.doesNotMatch(admin, /needsFor\(row, row\.specific_date/);
  const coverageMemo = admin.match(/const coverageByRule = useMemo\(\(\) => \{[\s\S]*?\}, \[([^\]]+)\]\);/);
  assert.ok(coverageMemo);
  assert.doesNotMatch(coverageMemo[1], /reason|editorRevision|editingRow/);
  assert.match(coverageMemo[1], /displayedRules/);
  assert.match(coverageMemo[1], /schedules/);
});

test('RC3.1: save and edit preserve the business payload; do not save on typing', () => {
  assert.match(editor, /onClick=\{\(\) => void onSave\(\{/);
  assert.match(editor, /requiresBadal: blocksNormalTeaching && requiresBadal/);
  assert.match(editor, /specificDate: kind === "DATE" \? specificDate : null/);
  assert.match(editor, /dayOfWeek: kind === "WEEKLY" \? dayOfWeek : null/);
  assert.doesNotMatch(editor, /repository\./);
  assert.match(admin, /await repository\.saveSubstituteConstraint\(\{\s*\.\.\.draft,\s*id: editingRow\?\.id \|\| undefined/);
  assert.match(admin, /setEditorRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(admin, /setRows\(await repository\.listSubstituteConstraints\((?:true)?\)\)/);
  assert.match(admin, /await onChanged\?\.\(\)/);
});

test('RC3.1: active rule modal and official-duty workflows remain intact', () => {
  assert.match(admin, /const currentNeeds = useMemo\(/);
  assert.match(admin, /const currentCoverage = useMemo\(/);
  assert.match(admin, /<InputGuruPengganti/);
  assert.match(admin, /officialDutySlots=\{pendingNeeds\.map/);
  assert.match(admin, /onAddLogs=\{saveOfficialDutySelections\}/);
  assert.match(admin, /badalRepository\.assign/);
});
