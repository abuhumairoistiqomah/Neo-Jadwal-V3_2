import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildTeacherAnalyticsCsv,
  getCoverageHealthLabel,
  normalizeManagementAnalyticsPayload,
} from "../domain/managementAnalytics";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("normalizes management analytics payload and clamps percentages", () => {
  const result = normalizeManagementAnalyticsPayload({
    date_start: "2026-10-01",
    date_end: "2026-10-10",
    summary: {
      request_total: "4",
      coverage_rate_pct: 120,
      task_readiness_pct: -4,
      absent_teacher_days: 3,
    },
    teachers: [{
      teacher_id: "t1",
      teacher_name: "Guru A",
      gender: "AKHWAT",
      regular_weekly_jp: "12",
      leave_days: 2,
      task_readiness_pct: 87.5,
    }],
  });
  assert.equal(result.summary.requestTotal, 4);
  assert.equal(result.summary.coverageRatePct, 100);
  assert.equal(result.summary.taskReadinessPct, 0);
  assert.equal(result.summary.absentTeacherDays, 3);
  assert.equal(result.teachers[0].regularWeeklyJp, 12);
  assert.equal(result.teachers[0].leaveDays, 2);
});

test("coverage health thresholds are management friendly", () => {
  assert.equal(getCoverageHealthLabel(100), "BAIK");
  assert.equal(getCoverageHealthLabel(95), "BAIK");
  assert.equal(getCoverageHealthLabel(80), "PERLU PERHATIAN");
  assert.equal(getCoverageHealthLabel(79.9), "KRITIS");
});

test("teacher analytics CSV is escaped and contains operational columns", () => {
  const csv = buildTeacherAnalyticsCsv([{
    teacherId: "t1",
    teacherName: 'Guru "A"',
    gender: "IKHWAN",
    regularWeeklyJp: 15,
    leaveDays: 1,
    absencePeriods: 3,
    teachingAbsencePeriods: 2,
    freeAbsencePeriods: 1,
    homeroomAbsencePeriods: 0,
    substitutePeriods: 4,
    taskEligiblePeriods: 2,
    taskReadyPeriods: 1,
    taskReadinessPct: 50,
  }]);
  assert.match(csv, /JP Reguler\/Minggu/);
  assert.match(csv, /JP Menjadi Badal/);
  assert.match(csv, /Guru ""A""/);
});

test("V3.14 wires Management Analytics into canonical admin navigation", () => {
  const app = read("src/App.tsx");
  const models = read("src/domain/models.ts");
  const repo = read("src/infrastructure/repositories/managementAnalyticsRepository.ts");
  const component = read("src/components/ManagementAnalytics.tsx");
  assert.match(models, /"management-analytics"/);
  assert.match(app, /label: "Management Analytics"/);
  assert.match(app, /<ManagementAnalytics onBack=/);
  assert.match(repo, /ejadwal_management_analytics_v1/);
  assert.match(component, /Kelas gabung dihitung sebagai satu unit badal/);
  assert.match(component, /JP-0 Homeroom/);
  assert.match(app, /Statistik Badal \(Legacy\)/);
});

test("V3.14 migration protects analytics RPC from anon", () => {
  const migration = read("supabase/migrations/202610100044_v3_14_management_analytics.sql");
  const verifier = read("supabase/migrations/202610100045_v3_14_verify_management_analytics.sql");
  assert.match(migration, /current_user_is_staff\(\)/);
  assert.match(migration, /revoke all on function public\.ejadwal_management_analytics_v1\(date,date\) from anon/);
  assert.match(migration, /period = 0/);
  assert.match(migration, /period_type = 'FREE'/);
  assert.match(verifier, /anon_cannot_execute_management_analytics/);
});
