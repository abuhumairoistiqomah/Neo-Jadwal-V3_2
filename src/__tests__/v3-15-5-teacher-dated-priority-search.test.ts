import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTeacherWeeklyView, teacherWeekDays } from "../domain/schedule/teacherWeeklyView";
import type { ScheduleItem, JadwalInsidentalItem, LogIzinItem } from "../domain/models";

const sourceMaster: ScheduleItem[] = [
  { id: "m1", kelas: "08 AE 1 I", hari: "Senin", jam_ke: 2, mapel: "Al-Qur'an", mulai: "08:40", selesai: "09:40", guru1: "SALMAN", guru2: "MA'RUF", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak" },
  { id: "m2", kelas: "04 INTER 2 I", hari: "Senin", jam_ke: 2, mapel: "Fiqh & Al-Qur'an", mulai: "08:40", selesai: "09:40", guru1: "ANDIKA", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak" },
  { id: "m3", kelas: "01 INTER 2 I", hari: "Senin", jam_ke: 3, mapel: "Al-Qur'an", mulai: "10:00", selesai: "11:00", guru1: "MA'RUF", guru2: "", guru3: "", guru4: "", guru5: "", guru6: "", kelasgabung: "Tidak" },
];
const datedLog: LogIzinItem = { id: "coverage-1", tanggal: "2026-10-19", kelas: "04 INTER 2 I", jam_ke: 2, mapel: "Fiqh & Al-Qur'an", guru_izin: "ANDIKA", guru_pengganti: "MA'RUF", alasan: "sakit" };
const weekDays = teacherWeekDays("2026-10-17");

function dated(teacher: string, logs: LogIzinItem[] = [datedLog], incidentals: JadwalInsidentalItem[] = []) {
  return buildTeacherWeeklyView({ teacher, mode: "EFFECTIVE", weekDays, schedules: sourceMaster, logs, incidentals });
}

test("confirmed badal replaces a companion's old master role in teacher's effective timetable", () => {
  const result = dated("MA'RUF");
  const jp2 = result.filter((row) => row.weekDate === "2026-10-19" && Number(row.jam_ke) === 2);
  assert.equal(jp2.length, 1);
  assert.equal(jp2[0].kelas, "04 INTER 2 I");
  assert.equal(jp2[0].weekStatus, "BADAL");
  assert.equal(result.filter((row) => row.weekDate === "2026-10-19" && Number(row.jam_ke) === 3).length, 1);
});

test("master mode stays canonical and a different teacher's master row is intact", () => {
  const master = buildTeacherWeeklyView({ teacher: "MA'RUF", mode: "MASTER", weekDays, schedules: sourceMaster });
  assert.ok(master.some((row) => row.kelas === "08 AE 1 I"));
  const salman = dated("SALMAN", [datedLog]);
  assert.ok(salman.some((row) => row.kelas === "08 AE 1 I" && Number(row.jam_ke) === 2));
});

test("dated incidental assignment hides the outdated master at the same JP", () => {
  const incidental: JadwalInsidentalItem = { id:"inc", tanggal:"2026-10-19", kelas:"04 INTER 2 I", jam_ke:2,
    mapel:"Persiapan Ujian", guru1:"MA'RUF", guru2:"", guru3:"", guru4:"", guru5:"", guru6:"", replaceTeachers:true };
  const result = dated("MA'RUF", [], [incidental]);
  const jp2 = result.filter((row) => row.weekDate === "2026-10-19" && Number(row.jam_ke) === 2);
  assert.equal(jp2.length, 1);
  assert.equal(jp2[0].mapel, "Persiapan Ujian");
});

test("two independently dated assignments remain visible for a genuine dated-vs-dated conflict", () => {
  const incs: JadwalInsidentalItem[] = [
    { id:"i1", tanggal:"2026-10-19", kelas:"08 AE 1 I", jam_ke:2, mapel:"Bimbingan", guru1:"MA'RUF", guru2:"", guru3:"", guru4:"", guru5:"", guru6:"", replaceTeachers:true },
    { id:"i2", tanggal:"2026-10-19", kelas:"04 INTER 2 I", jam_ke:2, mapel:"Kegiatan", guru1:"MA'RUF", guru2:"", guru3:"", guru4:"", guru5:"", guru6:"", replaceTeachers:true },
  ];
  const result = dated("MA'RUF", [], incs);
  assert.equal(result.filter((row) => row.weekDate === "2026-10-19" && Number(row.jam_ke) === 2).length, 2);
});

test("global teacher typing updates local component state only; teacher weekly schedule is memoized", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const search = readFileSync("src/components/ui/TeacherHeaderSearch.tsx", "utf8");
  const timetable = readFileSync("src/components/JadwalLengkap.tsx", "utf8");
  assert.match(app, /<TeacherHeaderSearch teachers=\{teachers\}/);
  assert.doesNotMatch(app, /setHeaderSearch\(e\.target\.value\)/);
  assert.match(search, /const \[query, setQuery\] = useState\(selectedTeacher\)/);
  assert.match(search, /onChange=\{\(event\) => \{ setQuery\(event\.target\.value\)/);
  assert.match(timetable, /const teacherSchedules: TeacherWeekRow\[\] = useMemo\(\(\) => buildTeacherWeeklyView/);
});
