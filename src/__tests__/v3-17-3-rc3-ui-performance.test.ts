import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(file, 'utf8');

test('RC3 login keystrokes are local while authentication still uses Supabase and restores public snapshot on failure', () => {
  const app = read('src/App.tsx');
  const modal = read('src/components/ui/AdminLoginModal.tsx');
  assert.match(app, /<AdminLoginModal[\s\S]*?onLogin=/);
  assert.doesNotMatch(app, /setLoginPassword\(|setLoginId\(|\[loginPassword,\s*setLoginPassword\]/);
  assert.match(modal, /useState\(""\)/);
  assert.match(modal, /id="login-password-input"/);
  assert.match(modal, /id="login-id-input"/);
  assert.match(app, /await signInWithPassword/);
  assert.match(app, /await refreshFromSupabase\(\)/);
  assert.match(app, /await refreshPublicSupabase\(\)/);
});

test('RC3 dashboard teacher input is a local subtree; selection still updates parent dashboard', () => {
  const dashboard = read('src/components/Dashboard.tsx');
  const search = read('src/components/ui/DashboardTeacherSearch.tsx');
  assert.match(dashboard, /<DashboardTeacherSearch[\s\S]*?onSelectTeacher=\{setSelectedTeacher\}/);
  assert.doesNotMatch(dashboard, /setSearchQuery\(/);
  assert.match(search, /useState\(selectedTeacher\)/);
  assert.match(search, /useEffect\(\(\) => \{ setQuery\(selectedTeacher\); \}, \[selectedTeacher\]\)/);
  assert.match(search, /onSelectTeacher\(name\)/);
  assert.match(search, /deferredQuery !== query/);
});

test('RC3 incidental effective schedule only depends on authoritative date and source rows', () => {
  const editor = read('src/components/IncidentalScheduleAdmin.tsx');
  const build = editor.match(/const effectiveRowsForRoomPreview = useMemo\(\(\) => \{([\s\S]*?)\}, \[([^\]]+)\]\);/);
  assert.ok(build, 'must memoize effective schedule separately');
  assert.match(build[1], /buildEffectiveScheduleForDate/);
  assert.doesNotMatch(build[2], /\b(subject|roomId|teacherIds|period|combined)\b/);
  const room = editor.match(/const roomConflictPreview = useMemo\(\(\) => \{([\s\S]*?)\}, \[([^\]]+)\]\);/);
  assert.ok(room, 'must retain live advisory conflict classification');
  assert.match(room[1], /classifyRoomOccupancy/);
  assert.match(room[2], /\bsubject\b/);
  assert.match(room[2], /\bteacherIds\b/);
  assert.match(room[2], /effectiveRowsForRoomPreview/);
  assert.match(editor, /validateDatedTimeOverride\(startTime, endTime\)/);
});

test('RC3 searchable select always renders typed characters immediately but never commits stale filtered option', () => {
  const select = read('src/components/ui/SearchableSelect.tsx');
  assert.match(select, /value=\{query\}/);
  assert.match(select, /setQuery\(event.target.value\)/);
  assert.match(select, /useDeferredValue\(query\)/);
  assert.match(select, /!isStale && results.length/);
  assert.match(select, /onChange\(option.value\)/);
});

test('RC3 master data search input debounces list recomputation, not visible typing', () => {
  const data = read('src/components/AdminMasterData.tsx');
  assert.match(data, /<MasterSearchInput query=\{query\}/);
  assert.match(data, /const \[draft, setDraft\] = useState\(query\)/);
  assert.match(data, /value=\{draft\} onChange=\{\(event\) => setDraft\(event.target.value\)\}/);
  assert.match(data, /window.setTimeout\(\(\) => onQueryChange\(draft\), 130\)/);
  assert.match(data, /window.clearTimeout\(timer\)/);
});

test('RC3 smart audience renderer is memoized with stable update callback', () => {
  const calendar = read('src/components/EducationCalendarAdmin.tsx');
  const builder = read('src/components/EducationAudienceBuilder.tsx');
  assert.match(builder, /React.memo\(/);
  assert.match(calendar, /const onAudienceRuleChange = useCallback\(/);
  assert.match(calendar, /onChange=\{onAudienceRuleChange\}/);
  assert.match(builder, /matchesEducationAudience/);
});
