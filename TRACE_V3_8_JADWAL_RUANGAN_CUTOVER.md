# TRACE V3.8 — Jadwal Ruangan Consumer Cutover

## Goal
Move the **Jadwal Penggunaan Ruangan** read path into a Supabase shadow route without changing the normal E-Jadwal route yet.

## Consumer inputs under parity
Jadwal Ruangan directly consumes:
1. `schedules`
2. `jadwalInsidental`
3. `masterRuangan`
4. `kalenderAkademik`

`Log_Izin` is intentionally excluded because teacher substitution does not change which physical room is occupied.

## New route
`/?supabase-jadwal-ruangan=1`

The route:
- requires Supabase Auth;
- fetches the latest Apps Script migration snapshot;
- loads the full paginated Supabase schedule snapshot;
- compares only the four room-consumer sections using multiset parity;
- renders the existing `JadwalRuangan` component with Supabase data.

## Correctness hardening
`JadwalRuangan`'s effective-room `useMemo` now includes `kalenderAkademik` in its dependency list. This removes a stale-cache risk if calendar data changes during a live session.

## Expected live counts for the current migration snapshot
- schedules: 1682
- jadwalInsidental: 705
- masterRuangan: 28
- kalenderAkademik: 249

Counts can legitimately change when the staging source changes; parity, not the literal number, is the gate.

## Manual smoke checklist after PARITY PASS
- switch among RSG/LABKOM/LABIPA and MQ rooms;
- move one week backward/forward;
- confirm an incidental room override appears in the destination room, not the original room;
- inspect a known combined-class slot: same room + same mapel + all combined must not be marked conflict;
- inspect a known true conflict: same room/date/JP but non-combined/different activity must be red/conflict;
- inspect a class/date covered by `Kalender_Akademik`: occupied room slot must disappear for covered JP only;
- check JP 0 if present.

## Deliberately not cut over yet
- the normal application route;
- room schedule write/edit flows;
- `room_unavailability` UI. The dedicated table remains in Supabase, but the current migrated snapshot has zero such rows after legacy cleanup. It should be wired when room-block input is activated operationally.

## Gate
V3.8 is locked only when:
- full automated test suite passes;
- TypeScript lint passes;
- production build passes;
- live route shows `JADWAL RUANGAN PARITY PASS`;
- the manual room/calendar/conflict checklist is sane.
