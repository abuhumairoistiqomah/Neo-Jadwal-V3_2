import { requireSupabaseClient } from "../supabase/client";
import type { OfficialDutyAssignment } from "../../domain/officialDutyBadal";

export class OfficialDutyBadalRepository {
  async listAssignments(constraintId: string, date: string): Promise<OfficialDutyAssignment[]> {
    const { data, error } = await requireSupabaseClient()
      .from("coverage_slots")
      .select("id,schedule_date,period,class_id,class_name_snapshot,substitute_teacher_id,substitute_teacher_name_snapshot,status")
      .eq("official_duty_constraint_id", constraintId)
      .eq("schedule_date", date)
      .is("deleted_at", null)
      .neq("status", "CANCELLED");
    if (error) throw new Error(`Gagal memuat badal tugas resmi: ${error.message}`);
    return (data || []) as OfficialDutyAssignment[];
  }

  async listAllAssignments(): Promise<Array<OfficialDutyAssignment & { official_duty_constraint_id: string }>> {
    const client = requireSupabaseClient();
    const collected: Array<OfficialDutyAssignment & { official_duty_constraint_id: string }> = [];
    // Do not make an old date restriction look uncovered just because a result was truncated.
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data, error } = await client.from("coverage_slots")
        .select("id,official_duty_constraint_id,schedule_date,period,class_id,class_name_snapshot,substitute_teacher_id,substitute_teacher_name_snapshot,status")
        .eq("source", "OFFICIAL_DUTY").is("deleted_at", null).neq("status", "CANCELLED")
        .order("id").range(offset, offset + 999);
      if (error) throw new Error(`Gagal memuat status badal: ${error.message}`);
      collected.push(...(data || []) as Array<OfficialDutyAssignment & { official_duty_constraint_id: string }>);
      if ((data || []).length < 1000) return collected;
    }
    throw new Error("Jumlah coverage terlalu besar untuk diperiksa. Status Badal Aman belum dapat dipastikan.");
  }

  async assign(input: { constraintId: string; date: string; period: number; classId: string; substituteTeacherId: string }): Promise<void> {
    const { error } = await requireSupabaseClient().rpc("ejadwal_assign_official_duty_badal_v1", {
      p_constraint_id: input.constraintId,
      p_date: input.date,
      p_period: input.period,
      p_class_id: input.classId,
      p_substitute_teacher_id: input.substituteTeacherId,
    });
    if (error) throw new Error(`Gagal menyimpan badal tugas resmi: ${error.message}`);
  }
}
