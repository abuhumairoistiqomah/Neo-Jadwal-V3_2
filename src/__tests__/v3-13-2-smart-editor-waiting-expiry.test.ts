import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { rankScheduleEditorTeachers } from "../domain/scheduleEditorCandidate";
import type { ScheduleItem } from "../domain/models";

const schedules: ScheduleItem[] = [
  {
    id: "s1", kelas: "05 MQ AKHWAT", hari: "Senin", jam_ke: 2,
    mulai: "08:40", selesai: "09:40", mapel: "Math",
    guru1: "Ustadzah Bentrok", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "",
    kelasgabung: "Tidak", ruangan: "R1",
  },
];

test("quick editor ranks matching gender first and labels occupied teachers as warnings", () => {
  const result = rankScheduleEditorTeachers({
    teachers: [
      { id: "a", full_name: "Ustadzah Aman", gender: "AKHWAT", is_active: true },
      { id: "b", full_name: "Ustadzah Bentrok", gender: "AKHWAT", is_active: true },
      { id: "c", full_name: "Ustadz Ikhwan", gender: "IKHWAN", is_active: true },
    ],
    classNames: ["05 MQ AKHWAT"],
    schedules,
    editingScheduleIds: [],
    dayName: "Senin",
    period: 2,
  });

  assert.equal(result[0]?.teacher.full_name, "Ustadzah Aman");
  assert.equal(result[0]?.genderRank, 2);
  assert.equal(result[0]?.hasConflict, false);
  assert.equal(result[1]?.teacher.full_name, "Ustadzah Bentrok");
  assert.equal(result[1]?.hasConflict, true);
  assert.equal(result[2]?.teacher.full_name, "Ustadz Ikhwan");
  assert.equal(result[2]?.genderRank, 0);
});

test("V3.13.2 migration archives stale waiting coverage and audits teacher-conflict override", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/202610090032_v3_13_2_smart_editor_waiting_expiry.sql"), "utf8");
  assert.match(sql, /'EXPIRED'/);
  assert.match(sql, /schedule_date < p_school_today/);
  assert.match(sql, /COVERAGE_AUTO_EXPIRE/);
  assert.match(sql, /TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED/);
  assert.match(sql, /teacher_conflict_override/);
});

test("waiting-list repository uses Jakarta school date and never queries past WAITING rows", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/infrastructure/repositories/supabaseLeaveApprovalRepository.ts"), "utf8");
  assert.match(source, /getSchoolTodayISO/);
  assert.match(source, /ejadwal_expire_stale_waiting_coverage/);
  assert.match(source, /\.gte\("schedule_date", schoolToday\)/);
});
