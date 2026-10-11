import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildRoomWeekDays } from "../domain/roomWeek";
import { localISODate, visibleScheduleConflicts } from "../domain/operationalConflictVisibility";
import { formatOperationalError } from "../domain/formatOperationalError";
import { classifyRoomOccupancy } from "../domain/roomOccupancy";
import type { ScheduleConflict } from "../domain/scheduleConflicts";

const source = (path: string) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Sunday school-week selection uses the correct upcoming Monday", () => {
  const days = buildRoomWeekDays(new Date(2026, 9, 11), 0);
  assert.deepEqual(days.map((day) => day.dateStr), [
    "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16",
  ]);
  assert.equal(days[0].name, "Senin");
  assert.equal(buildRoomWeekDays(new Date(2026, 9, 11), -1)[0].dateStr, "2026-10-05");
  assert.equal(buildRoomWeekDays(new Date(2026, 9, 10), 0)[0].dateStr, "2026-10-12");
  assert.equal(buildRoomWeekDays(new Date(2026, 9, 8), 0)[0].dateStr, "2026-10-05");
});

test("Date-specific old conflict is hidden but recurring master conflicts remain", () => {
  const conflict = (id: string, date: string): ScheduleConflict => ({
    id, dayOrDate: date, title: id, detail: "", kind: "INCIDENTAL", severity: "BLOCKER",
    period: 1, classes: ["12 AE 1"], teachers: [],
  });
  const all = [conflict("past", "2026-08-06"), conflict("today", "2026-10-11"), conflict("master", "Senin"), conflict("future", "2026-10-12")];
  assert.deepEqual(visibleScheduleConflicts(all, "2026-10-11").map((item) => item.id), ["today", "master", "future"]);
  assert.equal(visibleScheduleConflicts(all, "2026-10-11", true).length, 4);
  assert.equal(localISODate(new Date(2026, 9, 11)), "2026-10-11");
});

test("Supabase error object retains message, hint, details and code", () => {
  const error = { message: "ROOM_SLOT_CONFLICT", details: "RSG occupied", hint: "Choose another room", code: "P0001" };
  const result = formatOperationalError(error);
  assert.match(result, /ROOM_SLOT_CONFLICT/);
  assert.match(result, /RSG occupied/);
  assert.match(result, /Choose another room/);
  assert.match(result, /P0001/);
  assert.doesNotMatch(result, /\[object Object\]/);
});

test("Weekly room editor uses a dedicated transaction-scoped room RPC and keeps the canonical master", () => {
  const room = source("../components/JadwalRuangan.tsx");
  const editor = source("../components/WeeklyRoomEditor.tsx");
  const repository = source("../infrastructure/repositories/scheduleAdminRepository.ts");
  const migration = source("../../supabase/migrations/202610110001_v3_14_6_weekly_room_editor.sql");
  assert.match(room, /Edit Ruangan Minggu Ini/);
  assert.match(room, /roomEditMode/);
  assert.match(room, /<WeeklyRoomEditor/);
  assert.match(editor, /getCurrentUserContext/);
  assert.match(editor, /row\.isActive/);
  assert.match(editor, /repo\.relocateRoomForDate/);
  assert.match(editor, /repo\.addRoomSessionForDate/);
  assert.match(repository, /ejadwal_relocate_room_date_v1/);
  assert.match(repository, /ejadwal_add_room_session_date_v1/);
  assert.match(migration, /public\.current_user_is_staff\(\)/);
  assert.match(migration, /p_schedule_date/);
  assert.match(migration, /ROOM_TARGET_OCCUPIED/);
  assert.doesNotMatch(migration, /update public\.schedule_master/i);
});

test("Room occupancy infers combined classes when one explicit flag is missing", () => {
  const first = { mapel: "English", guru: "Guru A", kelasgabung: "Ya" };
  const second = { mapel: "English", guru: "Guru A", kelasgabung: "Tidak" };
  assert.deepEqual(classifyRoomOccupancy([first, second]), { conflict: false, combined: true });
  assert.deepEqual(classifyRoomOccupancy([first, { ...second, guru: "Guru B" }]), { conflict: true, combined: false });
  assert.deepEqual(classifyRoomOccupancy([first, { ...second, mapel: "Math" }]), { conflict: true, combined: false });
});
