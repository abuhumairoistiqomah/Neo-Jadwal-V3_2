import { requireSupabaseClient } from "../supabase/client";
import { MANAGEMENT_EVIDENCE_BUCKET, evidenceExtension, evidenceUploadMimeMatches } from "../../domain/managementLeaveEvidence";
import type { PublicLeaveSubmissionPayload } from "../../domain/leaveRequest";
import type {
  PublicLeaveRepository,
  PublicLeaveSubmitResult,
} from "./publicLeaveRepository";

interface PublicLeaveRpcRow {
  request_id?: string;
  request_code?: string;
  status?: string;
  slot_count?: number;
  period_count?: number;
  teaching_slot_count?: number;
  free_period_count?: number;
  task_upload_token?: string;
  task_upload_expires_at?: string;
  task_count?: number;
  evidence_path?: string;
  evidence_upload_token?: string;
}

export interface ExistingLeaveFreeCorrection {
  requestId: string;
  requestCode: string;
  status: "SUBMITTED" | "APPROVED";
  recordedPeriods: number[];
  missingFreePeriods: number[];
}

export interface PendingManagementEvidence extends PublicLeaveSubmitResult {
  evidencePath: string;
  evidenceUploadToken: string;
}

export class SupabasePublicLeaveRepository implements PublicLeaveRepository {
  /** Admin/Wakasek only. The DB lists only genuinely FREE unrecorded periods. */
  async findExistingFreeCorrection(teacherName: string, date: string): Promise<ExistingLeaveFreeCorrection | null> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_find_leave_free_amendment_v1", {
      p_teacher_name: teacherName, p_schedule_date: date,
    });
    if (error) throw new Error(`Gagal mencari izin lama: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      requestId: String(row.request_id || ""),
      requestCode: String(row.request_code || ""),
      status: row.status === "APPROVED" ? "APPROVED" : "SUBMITTED",
      recordedPeriods: Array.isArray(row.recorded_periods) ? row.recorded_periods.map(Number) : [],
      missingFreePeriods: Array.isArray(row.missing_free_periods) ? row.missing_free_periods.map(Number) : [],
    };
  }

  async appendExistingFreePeriods(requestId: string, periods: number[]): Promise<number[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_append_leave_free_periods_v1", {
      p_leave_request_id: requestId, p_periods: periods,
    });
    if (error) throw new Error(`Gagal mengoreksi JP izin: ${error.message}`);
    const result = (data || {}) as Record<string, unknown>;
    return Array.isArray(result.added_periods) ? result.added_periods.map(Number) : [];
  }

  async createEvidenceDraft(payload: PublicLeaveSubmissionPayload, file: File): Promise<PendingManagementEvidence> {
    const extension = evidenceExtension(file);
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_submit_public_leave_request_v4", {
      ...payload, p_evidence_extension: extension,
    });
    if (error) {
      const message = error.message || "Gagal membuat draft izin.";
      if (message.includes("DUPLICATE_ACTIVE_LEAVE_REQUEST")) {
        throw new Error("Guru sudah memiliki izin aktif untuk tanggal ini.");
      }
      throw new Error(`Gagal membuat draft izin: ${message}`);
    }
    const row = (data || {}) as PublicLeaveRpcRow;
    if (!row.request_id || !row.request_code || !row.evidence_path || !row.evidence_upload_token) {
      throw new Error("Supabase tidak mengembalikan akses upload bukti yang lengkap.");
    }
    return {
      requestId: row.request_id,
      requestCode: row.request_code,
      status: "PENDING_EVIDENCE",
      slotCount: Number(row.period_count ?? row.slot_count ?? payload.p_periods.length),
      teachingSlotCount: Number(row.teaching_slot_count ?? payload.p_slots.length),
      freePeriodCount: Number(row.free_period_count ?? payload.p_periods.filter((x) => x.period_type === "FREE").length),
      taskUploadToken: String(row.task_upload_token || ""),
      taskUploadExpiresAt: String(row.task_upload_expires_at || ""),
      taskCount: Number(row.task_count ?? payload.p_tasks.length),
      evidencePath: row.evidence_path,
      evidenceUploadToken: row.evidence_upload_token,
    };
  }

  async uploadEvidence(draft: PendingManagementEvidence, file: File): Promise<void> {
    if (!evidenceUploadMimeMatches(draft.evidencePath, file)) {
      throw new Error("Format bukti harus sama dengan file yang pertama kali dipilih untuk draft ini.");
    }
    const { error } = await requireSupabaseClient().storage
      .from(MANAGEMENT_EVIDENCE_BUCKET)
      .upload(draft.evidencePath, file, { contentType: file.type, upsert: false });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Upload bukti izin gagal: ${error.message}`);
    }
    // If the same path already exists (e.g. previous upload succeeded but
    // finalization timed out), finalize verifies the actual private object.
  }

  async finalizeEvidence(draft: PendingManagementEvidence): Promise<void> {
    const { error, data } = await requireSupabaseClient().rpc("ejadwal_finalize_leave_evidence_v1", {
      p_leave_request_id: draft.requestId,
      p_evidence_upload_token: draft.evidenceUploadToken,
    });
    if (error) throw new Error(`Bukti belum dapat diverifikasi: ${error.message}`);
    if ((data as {status?: string}|null)?.status !== "SUBMITTED") {
      throw new Error("Pengajuan belum berstatus SUBMITTED. Bukti masih menunggu verifikasi sistem.");
    }
  }

  async submit(_payload: PublicLeaveSubmissionPayload): Promise<PublicLeaveSubmitResult> {
    throw new Error("Pengajuan izin membutuhkan bukti dari manajemen. Gunakan alur upload bukti.");
  }
}
