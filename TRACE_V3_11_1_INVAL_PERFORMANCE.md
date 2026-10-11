# TRACE V3.11.1 — Inval Performance Hardening

## Why this checkpoint exists

V3.11 moved Inval writes to Supabase, but the UI could still stutter while editing the form. The bottleneck was client-side recommendation work, not Apps Script write latency: each rendered Inval row recalculated recommendations for every teacher and repeatedly rescanned schedules/logs. Typing a single character into `tugas` changed `generatedRows`, causing the full ranking engine to run again.

## What changed

### 1. One day index instead of repeated full scans

`src/domain/inval/recommendationPerformance.ts` precomputes per selected date:

- absent teachers
- saved badal periods per teacher
- saved badal teachers per JP
- regular occupied JP per teacher
- busy JP per teacher
- pendamping JP / pendamping-on-day
- active duty classification by JP
- ITBA presence by JP

The recommendation engine now performs Map/Set lookups for these facts instead of repeatedly filtering `effectiveSchedulesForDate` and `logs` inside every teacher candidate.

### 2. Task text no longer invalidates recommendations

`buildRecommendationDependencyKey()` intentionally excludes `tugas`.

Recommendation memo invalidation is limited to fields that can actually affect candidate ranking:

- JP
- class
- subject
- selected substitute
- acknowledged soft-constraint IDs

Therefore typing or pasting task text does not rerun the expensive 99-teacher ranking calculation.

### 3. Current-form badal assignments are indexed once

Assignments already selected in other generated rows are indexed by teacher instead of filtering all generated rows repeatedly for every candidate.

### 4. Candidate dropdown is memoized

The dropdown receives a stable callback and stable recommendation array while task text changes. Other JP dropdowns can skip rerendering when the user types a task for one row.

### 5. Business rules preserved

This checkpoint does not redesign ranking policy. The following remain intact:

- hard schedule conflict
- soft/hard substitute constraints
- gender preference
- same-subject / same-field / same-level scoring
- ITBA rules
- daily and weekly projected loads
- 24 JP recommended weekly threshold
- leave and existing badal checks

## Regression tests

`src/__tests__/inval-performance.test.ts` verifies:

1. task edits do not change recommendation dependency key
2. substitute changes do invalidate recommendation key
3. current-form assignment indexing
4. busy/saved-badal/leave indexing
5. academic-calendar-suppressed slots are not marked busy

Expected full suite after this checkpoint: **164 tests, 0 fail**.

## Expected user-visible result

- typing task text: no full recommendation recomputation
- selecting a substitute: recomputation only when needed
- changing selected date / absent teacher / JP: correct recomputation
- initial shadow parity behavior remains unchanged
- V3.11 Supabase write path remains unchanged
