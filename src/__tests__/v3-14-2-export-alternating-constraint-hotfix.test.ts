import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveNormalTeachingBlock, type SubstituteConstraint } from "../domain/substituteAvailability";
import { detectScheduleConflicts } from "../domain/scheduleConflicts";
import type { ScheduleItem } from "../domain/models";

const exportUtil = fs.readFileSync(new URL("../infrastructure/browser/exportElementJpeg.ts", import.meta.url), "utf8");
const repo = fs.readFileSync(new URL("../infrastructure/repositories/scheduleAdminRepository.ts", import.meta.url), "utf8");
const constraintAdmin = fs.readFileSync(new URL("../components/SubstituteConstraintAdmin.tsx", import.meta.url), "utf8");
const inputInval = fs.readFileSync(new URL("../components/InputGuruPengganti.tsx", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../supabase/migrations/202610100048_v3_14_2_export_alternating_constraint_hotfix.sql", import.meta.url), "utf8");

function schedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: "s1", kelas: "12 AE 3 A", hari: "Jumat", jam_ke: 2, mulai: "08:30", selesai: "09:30",
    mapel: "Arabic/Native Arabic", guru1: "SYAIKH MANSHUR", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
    kelasgabung: "Bergantian", ruangan: "R12", ...overrides,
  };
}

test("V3.14.2 JPG export renders inside a stylesheet-isolated iframe", () => {
  assert.match(exportUtil, /createIsolatedExportFrame/);
  assert.match(exportUtil, /custom properties containing OKLAB\/OKLCH/);
  assert.match(exportUtil, /property\.startsWith\("--"\)/);
  assert.match(exportUtil, /doc\.importNode\(safeClone, true\)/);
});

test("V3.14.2 static conflict engine ignores ALTERNATING master rows", () => {
  const rotating = schedule();
  const normal = schedule({ id: "s2", kelas: "09 MQ IKHWAN", mapel: "Native Arabic", kelasgabung: "Tidak" });
  const conflicts = detectScheduleConflicts([rotating, normal]);
  assert.equal(conflicts.some((row) => row.kind === "TEACHER"), false);
  assert.equal(conflicts.some((row) => row.kind === "ROOM"), false);
});

test("V3.14.2 normal-teaching block is independent from substitute override level", () => {
  const constraint: SubstituteConstraint = {
    id: "c1", teacherId: "t1", kind: "DATE", specificDate: "2026-10-14",
    periodStart: 0, periodEnd: 6, reason: "Panitia Outing Class",
    overrideAllowed: true, blocksNormalTeaching: true, isActive: true,
  };
  const result = resolveNormalTeachingBlock({ teacherId: "t1", date: "2026-10-14", period: 3, constraints: [constraint] });
  assert.equal(result.blocked, true);
  assert.equal(result.matchingConstraints[0].reason, "Panitia Outing Class");
});

test("V3.14.2 wires the new constraint field and Quick Edit v4", () => {
  assert.match(constraintAdmin, /Guru juga tidak bisa mengajar jadwal normal/);
  assert.match(inputInval, /× Izin/);
  assert.match(repo, /ejadwal_update_schedule_master_v4/);
  assert.match(migration, /blocks_normal_teaching/);
  assert.match(migration, /ejadwal_update_schedule_master_v4/);
});
