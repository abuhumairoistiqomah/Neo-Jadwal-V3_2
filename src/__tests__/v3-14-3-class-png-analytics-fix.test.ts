import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const jadwalKelas = fs.readFileSync(new URL("../components/JadwalKelas.tsx", import.meta.url), "utf8");
const exportUtil = fs.readFileSync(new URL("../infrastructure/browser/exportElementJpeg.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../supabase/migrations/202610110050_v3_14_3_management_analytics_grouping_fix.sql", import.meta.url), "utf8");
const verifier = fs.readFileSync(new URL("../../supabase/migrations/202610110051_v3_14_3_verify_management_analytics_png.sql", import.meta.url), "utf8");

test("V3.14.3 makes PNG the class timetable image export", () => {
  assert.match(jadwalKelas, /downloadElementAsPng/);
  assert.match(jadwalKelas, /Jadwal_Kelas_\$\{selectedClass\.replace/);
  assert.match(jadwalKelas, /scheduleViewMode === "MASTER" \? "Asli" : "Minggu_Ini"/);
  assert.match(jadwalKelas, /\.png/);
  assert.match(jadwalKelas, /Unduh Jadwal Kelas \(PNG\)/);
  assert.match(exportUtil, /image\/png/);
  assert.match(exportUtil, /computeRasterScale\(renderWidth, renderHeight, 2\.5\)/);
});

test("V3.14.3 expands teacher labels in export mode instead of line-clipping them", () => {
  assert.match(jadwalKelas, /data-export-expand-text="true"/);
  assert.match(jadwalKelas, /data-export-cell="true"/);
  assert.match(exportUtil, /applyReadableTimetableExportTweaks/);
  assert.match(exportUtil, /removeProperty\("-webkit-line-clamp"\)/);
  assert.match(exportUtil, /overflowWrap = "anywhere"/);
});

test("V3.14.3 repairs the PostgreSQL 42803 analytics grouping bug", () => {
  assert.match(migration, /former CASE expression left absent_teacher_name_snapshot ungrouped/);
  assert.match(migration, /group by cs\.leave_request_id, cs\.schedule_date, cs\.period, cs\.absent_teacher_id,[\s\S]*coalesce\(cs\.absent_teacher_id::text, lower\(trim\(cs\.absent_teacher_name_snapshot\)\), 'unknown'\), cs\.source/);
  assert.doesNotMatch(migration, /case when cs\.absent_teacher_id is null then lower\(trim\(cs\.absent_teacher_name_snapshot\)\) else '' end, cs\.source/);
  assert.match(verifier, /analytics_grouping_uses_exact_absent_identity/);
});
