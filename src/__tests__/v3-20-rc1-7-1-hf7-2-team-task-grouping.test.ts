import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {groupInlineTeamTasksByClass, inlineTeamTasksForClassCard} from "../domain/schedule/teamTeachingTask.ts";
import type {LogIzinItem} from "../domain/models.ts";

const coverage = (id: string, kelas: string, teacher: string, jam_ke = 1): LogIzinItem => ({
  id, tanggal: "2026-11-11", kelas, jam_ke, guru_izin: teacher,
  guru_pengganti: "BADAL", alasan: "", tugas: `Instruksi ${id}`,
  mapel: "Al-Qur'an", source: "LEAVE_WORKFLOW", coverage_status: "ASSIGNED",
});
const notices = [
  {coverage: coverage("s1", "03 MQ IKHWAN", "SYAIKH ALI"), subject: "Al-Qur'an"},
  {coverage: coverage("k1", "03 MQ IKHWAN", "KHOIRUDDIN"), subject: "Al-Qur'an"},
  {coverage: coverage("s2", "04 MQ IKHWAN", "SYAIKH ALI"), subject: "Al-Qur'an"},
  {coverage: coverage("k2", "04 MQ IKHWAN", "KHOIRUDDIN"), subject: "Al-Qur'an"},
  {coverage: coverage("s3", "05 MQ IKHWAN", "SYAIKH ALI"), subject: "Al-Qur'an"},
  {coverage: coverage("k3", "05 MQ IKHWAN", "KHOIRUDDIN"), subject: "Al-Qur'an"},
];

test("HF7.2: 3 combined classes with 2 absent teachers show 3 class groups, 6 intact tasks", () => {
  const groups = groupInlineTeamTasksByClass(notices);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => group.tasks.length), [2, 2, 2]);
  assert.deepEqual(groups.flatMap(group => group.tasks.map(item => item.coverage.id)),
    ["s1", "k1", "s2", "k2", "s3", "k3"]);
});

test("HF7.2: exact class and JP filtering happens before grouping", () => {
  const matched = inlineTeamTasksForClassCard({
    notices: [...notices, {coverage: coverage("other-jp", "03 MQ IKHWAN", "X", 2), subject: "X"}],
    period: 1, classes: [{kelas: "03 MQ IKHWAN"}, {kelas: "05 MQ IKHWAN"}],
  });
  const groups = groupInlineTeamTasksByClass(matched);
  assert.deepEqual(groups.map(group => group.kelas), ["03 MQ IKHWAN", "05 MQ IKHWAN"]);
  assert.deepEqual(groups.flatMap(group => group.tasks.map(item => item.coverage.id)), ["s1", "k1", "s3", "k3"]);
});

test("HF7.2: repeated coverage is shown once, distinct coverage remains separate", () => {
  const groups = groupInlineTeamTasksByClass([notices[0], notices[0], notices[1]]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.tasks.map(t => t.coverage.id), ["s1", "k1"]);
});

test("HF7.2: original task click handlers remain inside a collapsible group on the same JP card", () => {
  const source = readFileSync("src/components/Dashboard.tsx", "utf8");
  assert.match(source, /data-team-task-in-jp="true"/);
  assert.match(source, /<details data-team-task-in-jp="true"/);
  assert.match(source, /<summary className=/);
  assert.match(source, /groupInlineTeamTasksByClass\(inlineTeamTasksForClassCard\(/);
  assert.match(source, /group\.tasks\.map\(\(\{coverage, subject\}\)/);
  assert.match(source, /setTaskModalData\(\{/);
  assert.doesNotMatch(source, /data-team-task-notice=/);
});
