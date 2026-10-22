import type {
  LeaveDecisionResult,
  LeaveReviewPeriod,
  LeaveReviewRequest,
  LeaveReviewSlot,
  LeaveReviewTask,
  WaitingCoverageRow,
} from "../../domain/leaveApproval";
import type { LeaveApprovalRepository } from "./leaveApprovalRepository";
import { requireSupabaseClient } from "../supabase/client";
import { MANAGEMENT_EVIDENCE_BUCKET } from "../../domain/managementLeaveEvidence";
import { normalizeAbsenceCategory } from "../../domain/leaveClassificationV320";
import { getSchoolTodayISO } from "../../domain/date";
import { getErrorMessage, isMissingRpcError } from "../../domain/errorMessage";

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export class SupabaseLeaveApprovalRepository implements LeaveApprovalRepository {
  async listSubmittedRequests(limit = 100): Promise<LeaveReviewRequest[]> {
    const client = requireSupabaseClient();
    const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    const { data: requests, error: requestError } = await client
      .from("leave_requests")
      .select("id,teacher_id,date_start,date_end,reason,detail,status,submitted_at,request_code,request_type,absence_category,evidence_path,evidence_uploaded_at")
      .eq("status", "SUBMITTED")
      .order("submitted_at", { ascending: true })
      .limit(safeLimit);
    if (requestError) throw new Error(`Gagal membaca antrean izin: ${requestError.message}`);

    const requestRows = requests ?? [];
    if (requestRows.length === 0) return [];

    const requestIds = requestRows.map((row: any) => String(row.id));
    const teacherIds = unique(requestRows.map((row: any) => String(row.teacher_id || "")));

    const [teacherResult, periodResult, slotResult, taskResult] = await Promise.all([
      teacherIds.length > 0
        ? client.from("teachers").select("id,full_name").in("id", teacherIds)
        : Promise.resolve({ data: [], error: null } as any),
      client
        .from("leave_request_periods")
        .select("id,leave_request_id,schedule_date,period,period_type")
        .in("leave_request_id", requestIds)
        .order("period", { ascending: true }),
      client
        .from("leave_request_slots")
        .select("id,leave_request_id,schedule_date,period,class_name_snapshot,subject_snapshot")
        .in("leave_request_id", requestIds)
        .order("period", { ascending: true }),
      client
        .from("leave_request_tasks")
        .select("id,leave_request_id,period,description")
        .in("leave_request_id", requestIds)
        .order("period", { ascending: true }),
    ]);

    if (teacherResult.error) throw new Error(`Gagal membaca guru izin: ${teacherResult.error.message}`);
    if (periodResult.error) throw new Error(`Gagal membaca JP izin: ${periodResult.error.message}`);
    if (slotResult.error) throw new Error(`Gagal membaca kelas terdampak: ${slotResult.error.message}`);
    if (taskResult.error) throw new Error(`Gagal membaca tugas guru: ${taskResult.error.message}`);

    const taskIds = (taskResult.data ?? []).map((row: any) => String(row.id));
    const resourceResult = taskIds.length > 0
      ? await client
          .from("leave_request_task_resources")
          .select("id,leave_request_task_id,resource_type,label,url,file_name")
          .in("leave_request_task_id", taskIds)
          .order("created_at", { ascending: true })
      : ({ data: [], error: null } as any);
    if (resourceResult.error) throw new Error(`Gagal membaca lampiran tugas guru: ${resourceResult.error.message}`);

    const resourcesByTask = new Map<string, any[]>();
    for (const row of resourceResult.data ?? []) {
      const taskId = String((row as any).leave_request_task_id || "");
      const list = resourcesByTask.get(taskId) || [];
      list.push(row);
      resourcesByTask.set(taskId, list);
    }

    const teacherMap = new Map<string, string>(
      (teacherResult.data ?? []).map((row: any) => [String(row.id), String(row.full_name || "")]),
    );
    const periodsByRequest = new Map<string, LeaveReviewPeriod[]>();
    for (const row of periodResult.data ?? []) {
      const requestId = String((row as any).leave_request_id);
      const list = periodsByRequest.get(requestId) || [];
      list.push({
        id: String((row as any).id),
        scheduleDate: String((row as any).schedule_date || ""),
        period: Number((row as any).period),
        periodType: String((row as any).period_type || "FREE") === "TEACHING" ? "TEACHING" : "FREE",
      });
      periodsByRequest.set(requestId, list);
    }
    const slotsByRequest = new Map<string, LeaveReviewSlot[]>();
    for (const row of slotResult.data ?? []) {
      const requestId = String((row as any).leave_request_id);
      const list = slotsByRequest.get(requestId) || [];
      list.push({
        id: String((row as any).id),
        scheduleDate: String((row as any).schedule_date || ""),
        period: Number((row as any).period),
        classCode: String((row as any).class_name_snapshot || ""),
        subject: String((row as any).subject_snapshot || ""),
      });
      slotsByRequest.set(requestId, list);
    }

    const tasksByRequest = new Map<string, LeaveReviewTask[]>();
    for (const row of taskResult.data ?? []) {
      const requestId = String((row as any).leave_request_id || "");
      const taskId = String((row as any).id || "");
      const list = tasksByRequest.get(requestId) || [];
      list.push({
        id: taskId,
        period: Number((row as any).period),
        description: String((row as any).description || ""),
        resources: (resourcesByTask.get(taskId) || []).map((resource: any) => ({
          resourceType: String(resource.resource_type || "LINK"),
          label: String(resource.label || resource.file_name || ""),
          url: String(resource.url || ""),
          fileName: String(resource.file_name || ""),
        })),
      });
      tasksByRequest.set(requestId, list);
    }

    return requestRows.map((row: any) => ({
      id: String(row.id),
      requestCode: String(row.request_code || row.id),
      teacherId: String(row.teacher_id || ""),
      teacherName: teacherMap.get(String(row.teacher_id || "")) || "Guru tidak ditemukan",
      scheduleDate: String(row.date_start || ""),
      requestType: String(row.request_type || "PARTIAL"),
      absenceCategory: normalizeAbsenceCategory(row.absence_category),
      reason: String(row.reason || ""),
      detail: row.detail ? String(row.detail) : null,
      status: String(row.status || "SUBMITTED"),
      submittedAt: String(row.submitted_at || ""),
      evidencePath: String(row.evidence_path || ""),
      evidenceUploadedAt: String(row.evidence_uploaded_at || ""),
      periods: periodsByRequest.get(String(row.id)) || [],
      slots: slotsByRequest.get(String(row.id)) || [],
      tasks: tasksByRequest.get(String(row.id)) || [],
    }));
  }

  async getManagementEvidenceUrl(path: string): Promise<string> {
    if (!path || path.includes("..") || path.startsWith("/")) throw new Error("Path bukti tidak valid.");
    const client = requireSupabaseClient();
    const { data, error } = await client.storage
      .from(MANAGEMENT_EVIDENCE_BUCKET)
      .createSignedUrl(path, 120); // Private access, expiring in 2 minutes.
    if (error || !data?.signedUrl) throw new Error(`Tidak dapat membuka bukti izin: ${error?.message || "URL kosong"}`);
    return data.signedUrl;
  }

  async decideRequest(input: {
    leaveRequestId: string;
    decision: "APPROVE" | "DECLINE";
    note?: string;
  }): Promise<LeaveDecisionResult> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_decide_leave_request", {
      p_leave_request_id: input.leaveRequestId,
      p_decision: input.decision,
      p_note: input.note ?? null,
    });
    if (error) throw new Error(`Gagal memproses keputusan izin: ${error.message}`);

    const row = asObject(data);
    return {
      requestId: String(row.request_id || input.leaveRequestId),
      requestCode: String(row.request_code || ""),
      status: String(row.status || ""),
      coverageSlotIds: Array.isArray(row.coverage_slot_ids) ? row.coverage_slot_ids.map(String) : [],
      waitingCount: Number(row.waiting_count || 0),
      freePeriodCount: Number(row.free_period_count || 0),
      teachingPeriodCount: Number(row.teaching_period_count || 0),
    };
  }

  async listWaitingCoverage(limit = 250): Promise<WaitingCoverageRow[]> {
    const client = requireSupabaseClient();
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    const schoolToday = getSchoolTodayISO();
    const { error: expireError } = await client.rpc("ejadwal_expire_stale_waiting_coverage", {
      p_school_today: schoolToday,
    });
    // Compatibility guard: V3.13.2 introduced this RPC, but older/staged databases
    // can miss it. The active query below still filters past rows with gte(today),
    // so the operator queue remains correct while migration V3.14.1 repairs the RPC.
    if (expireError && !isMissingRpcError(expireError, "ejadwal_expire_stale_waiting_coverage")) {
      throw new Error(`Gagal membersihkan Waiting List lama: ${getErrorMessage(expireError)}`);
    }
    const { data: coverage, error: coverageError } = await client
      .from("coverage_slots")
      .select("id,leave_request_id,schedule_date,period,class_name_snapshot,subject_snapshot,absent_teacher_id,absent_teacher_name_snapshot,reason_snapshot,status,source,created_at")
      .eq("source", "LEAVE_WORKFLOW")
      .eq("status", "WAITING")
      .gte("schedule_date", schoolToday)
      .is("deleted_at", null)
      .order("schedule_date", { ascending: true })
      .order("period", { ascending: true })
      .limit(safeLimit);
    if (coverageError) throw new Error(`Gagal membaca Waiting List Badal: ${coverageError.message}`);

    const rows = coverage ?? [];
    const requestIds = unique(rows.map((row: any) => String(row.leave_request_id || "")));
    const coverageIds = rows.map((row: any) => String(row.id));
    const codeMap = new Map<string, string>();
    if (requestIds.length > 0) {
      const { data: requests, error } = await client
        .from("leave_requests")
        .select("id,request_code")
        .in("id", requestIds);
      if (error) throw new Error(`Gagal membaca kode izin Waiting List: ${error.message}`);
      for (const row of requests ?? []) codeMap.set(String((row as any).id), String((row as any).request_code || ""));
    }

    const taskResult = coverageIds.length > 0
      ? await client
          .from("learning_tasks")
          .select("id,coverage_slot_id,description")
          .in("coverage_slot_id", coverageIds)
          .is("deleted_at", null)
      : ({ data: [], error: null } as any);
    if (taskResult.error) throw new Error(`Gagal membaca tugas Waiting List: ${taskResult.error.message}`);
    const taskIds = (taskResult.data ?? []).map((row: any) => String(row.id));
    const resourceResult = taskIds.length > 0
      ? await client
          .from("task_resources")
          .select("task_id,url")
          .in("task_id", taskIds)
      : ({ data: [], error: null } as any);
    if (resourceResult.error) throw new Error(`Gagal membaca resource Waiting List: ${resourceResult.error.message}`);

    const urlsByTask = new Map<string, string[]>();
    for (const resource of resourceResult.data ?? []) {
      const taskId = String((resource as any).task_id || "");
      const url = String((resource as any).url || "").trim();
      if (!url) continue;
      const list = urlsByTask.get(taskId) || [];
      if (!list.includes(url)) list.push(url);
      urlsByTask.set(taskId, list);
    }
    const taskByCoverage = new Map<string, { text: string; urls: string[] }>();
    for (const task of taskResult.data ?? []) {
      const coverageId = String((task as any).coverage_slot_id || "");
      const taskId = String((task as any).id || "");
      taskByCoverage.set(coverageId, {
        text: String((task as any).description || ""),
        urls: urlsByTask.get(taskId) || [],
      });
    }

    return rows.map((row: any) => ({
      id: String(row.id),
      leaveRequestId: row.leave_request_id ? String(row.leave_request_id) : null,
      requestCode: row.leave_request_id ? codeMap.get(String(row.leave_request_id)) || "" : "",
      scheduleDate: String(row.schedule_date || ""),
      period: Number(row.period),
      classCode: String(row.class_name_snapshot || ""),
      subject: String(row.subject_snapshot || ""),
      absentTeacherId: String(row.absent_teacher_id || ""),
      absentTeacherName: String(row.absent_teacher_name_snapshot || ""),
      reason: String(row.reason_snapshot || ""),
      status: String(row.status || "WAITING"),
      source: String(row.source || ""),
      createdAt: String(row.created_at || ""),
      taskText: taskByCoverage.get(String(row.id))?.text || "",
      taskUrls: taskByCoverage.get(String(row.id))?.urls || [],
    }));
  }
}
