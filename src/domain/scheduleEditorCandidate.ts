import { getClassGender, normalizeSchoolGender, type SchoolGender } from "./classGender";
import { normalizeImportKey, type ScheduleImportTeacherMaster } from "./scheduleImport";
import type { ScheduleItem } from "./models";
import { parseScheduleClassMode, type ScheduleClassMode } from "./schedule/classMode";

export interface ScheduleEditorCandidate {
  teacher: ScheduleImportTeacherMaster;
  targetGender: SchoolGender;
  genderRank: number;
  hasConflict: boolean;
  conflictLabels: string[];
}

function targetGenderForClasses(classNames: string[]): SchoolGender {
  const genders = [...new Set(classNames.map(getClassGender).filter((value) => value !== "UNKNOWN"))];
  return genders.length === 1 ? genders[0] : "UNKNOWN";
}

function teacherNameKeys(teacher: ScheduleImportTeacherMaster): Set<string> {
  return new Set([teacher.full_name, teacher.short_name, teacher.legacy_name].map(normalizeImportKey).filter(Boolean));
}

export function rankScheduleEditorTeachers(input: {
  teachers: ScheduleImportTeacherMaster[];
  classNames: string[];
  schedules: ScheduleItem[];
  editingScheduleIds: string[];
  dayName: string;
  period: number;
  targetClassMode?: ScheduleClassMode;
}): ScheduleEditorCandidate[] {
  const targetGender = targetGenderForClasses(input.classNames);
  const editingIds = new Set(input.editingScheduleIds);
  const dayKey = normalizeImportKey(input.dayName);

  return input.teachers
    .filter((teacher) => teacher.is_active !== false)
    .map((teacher) => {
      const teacherGender = normalizeSchoolGender(teacher.gender);
      const genderRank = targetGender === "UNKNOWN" || teacherGender === "UNKNOWN"
        ? 1
        : teacherGender === targetGender ? 2 : 0;
      const keys = teacherNameKeys(teacher);
      const conflictLabels: string[] = [];
      for (const schedule of input.schedules) {
        if (editingIds.has(schedule.id)) continue;
        if (normalizeImportKey(schedule.hari) !== dayKey || Number(schedule.jam_ke) !== input.period) continue;
        // ALTERNATING is a rotation declaration, not a statement that two
        // sessions happen in the same week. Without a concrete dated rotation
        // occurrence, static master rows cannot be called a teacher conflict.
        if (input.targetClassMode === "ALTERNATING" || parseScheduleClassMode(schedule.kelasgabung) === "ALTERNATING") continue;
        const names = [schedule.guru1, schedule.guru2, schedule.guru3, schedule.guru4, schedule.guru5, schedule.guru6]
          .map(normalizeImportKey)
          .filter(Boolean);
        if (names.some((name) => keys.has(name))) {
          conflictLabels.push(`${schedule.kelas} • ${schedule.mapel}`);
        }
      }
      return {
        teacher,
        targetGender,
        genderRank,
        hasConflict: conflictLabels.length > 0,
        conflictLabels: [...new Set(conflictLabels)],
      };
    })
    .sort((a, b) => {
      if (b.genderRank !== a.genderRank) return b.genderRank - a.genderRank;
      if (a.hasConflict !== b.hasConflict) return Number(a.hasConflict) - Number(b.hasConflict);
      return a.teacher.full_name.localeCompare(b.teacher.full_name, "id");
    });
}

export function scheduleEditorCandidateLabel(candidate: ScheduleEditorCandidate): string {
  const gender = candidate.genderRank === 2 ? "✓ gender sesuai" : candidate.genderRank === 0 ? "gender berbeda" : "gender netral";
  const conflict = candidate.hasConflict ? `⚠ bentrok: ${candidate.conflictLabels.join(", ")}` : "tersedia";
  return `${candidate.teacher.full_name} — ${gender} • ${conflict}`;
}
