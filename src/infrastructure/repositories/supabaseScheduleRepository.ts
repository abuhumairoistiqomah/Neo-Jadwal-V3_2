import { requireSupabaseClient } from "../supabase/client";
import { fetchAllSupabasePages, type SupabasePageResult } from "../supabase/pagination";
import type { ScheduleDataSnapshot, ScheduleReadRepository } from "./scheduleRepository";
import {
  mapRelationalScheduleRows,
  type AcademicEventRow,
  type ClassRow,
  type CoverageSlotRow,
  type IncidentalTeacherOverrideRow,
  type LearningTaskRow,
  type RoomRow,
  type ScheduleIncidentalRow,
  type ScheduleMasterRow,
  type ScheduleTeacherRow,
  type TaskResourceRow,
  type TeacherRow,
} from "./supabaseScheduleMappers";

type RangeableQuery<T> = {
  range(from: number, to: number): PromiseLike<SupabasePageResult<T>>;
};

async function loadAllRows<T>(
  label: string,
  buildQuery: () => RangeableQuery<T>,
): Promise<T[]> {
  return fetchAllSupabasePages<T>(
    (from, to) => buildQuery().range(from, to),
    label,
  );
}

/**
 * Read-only Supabase adapter for the canonical schedule domain.
 *
 * V3.7.2 hardens every table read with explicit pagination. A normal
 * PostgREST response may be capped at 1,000 rows, while E-Jadwal already has
 * more than 1,000 schedule_master rows and more than 2,000 teacher relations.
 * Ordered pages ensure one complete, deterministic snapshot is assembled
 * before it reaches the domain mappers.
 */
export class SupabaseScheduleRepository implements ScheduleReadRepository {
  async loadSnapshot(): Promise<ScheduleDataSnapshot> {
    const client = requireSupabaseClient();

    const [
      teachers,
      classes,
      rooms,
      scheduleMaster,
      scheduleTeachers,
      scheduleIncidentals,
      incidentalTeacherOverrides,
      academicEvents,
      coverageSlots,
      learningTasks,
      taskResources,
    ] = await Promise.all([
      loadAllRows<TeacherRow>(
        "teachers",
        () => client.from("teachers").select("*").eq("is_active", true).order("id") as unknown as RangeableQuery<TeacherRow>,
      ),
      loadAllRows<ClassRow>(
        "classes",
        () => client.from("classes").select("*").eq("is_active", true).order("id") as unknown as RangeableQuery<ClassRow>,
      ),
      loadAllRows<RoomRow>(
        "rooms",
        () => client.from("rooms").select("*").order("id") as unknown as RangeableQuery<RoomRow>,
      ),
      loadAllRows<ScheduleMasterRow>(
        "schedule_master",
        () => client
          .from("schedule_master")
          .select("*")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("id") as unknown as RangeableQuery<ScheduleMasterRow>,
      ),
      loadAllRows<ScheduleTeacherRow>(
        "schedule_master_teachers",
        () => client
          .from("schedule_master_teachers")
          .select("*")
          .order("schedule_id")
          .order("position") as unknown as RangeableQuery<ScheduleTeacherRow>,
      ),
      loadAllRows<ScheduleIncidentalRow>(
        "schedule_incidentals",
        () => client
          .from("schedule_incidentals")
          .select("*")
          .is("deleted_at", null)
          .order("id") as unknown as RangeableQuery<ScheduleIncidentalRow>,
      ),
      loadAllRows<IncidentalTeacherOverrideRow>(
        "schedule_incidental_teacher_overrides",
        () => client
          .from("schedule_incidental_teacher_overrides")
          .select("*")
          .order("incidental_id")
          .order("position") as unknown as RangeableQuery<IncidentalTeacherOverrideRow>,
      ),
      loadAllRows<AcademicEventRow>(
        "academic_events",
        () => client.from("academic_events").select("*").order("id") as unknown as RangeableQuery<AcademicEventRow>,
      ),
      loadAllRows<CoverageSlotRow>(
        "coverage_slots",
        () => client
          .from("coverage_slots")
          .select("*")
          .is("deleted_at", null)
          .neq("status", "CANCELLED")
          .neq("status", "EXPIRED")
          .order("id") as unknown as RangeableQuery<CoverageSlotRow>,
      ),
      loadAllRows<LearningTaskRow>(
        "learning_tasks",
        () => client
          .from("learning_tasks")
          .select("*")
          .is("deleted_at", null)
          .order("id") as unknown as RangeableQuery<LearningTaskRow>,
      ),
      loadAllRows<TaskResourceRow>(
        "task_resources",
        () => client.from("task_resources").select("*").order("id") as unknown as RangeableQuery<TaskResourceRow>,
      ),
    ]);

    return mapRelationalScheduleRows({
      teachers,
      classes,
      rooms,
      scheduleMaster,
      scheduleTeachers,
      scheduleIncidentals,
      incidentalTeacherOverrides,
      academicEvents,
      coverageSlots,
      learningTasks,
      taskResources,
    });
  }
}
