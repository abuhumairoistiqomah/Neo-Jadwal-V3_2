import { requireSupabaseClient } from "../supabase/client";
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
}

export interface ExistingLeaveFreeCorrection {
  requestId: string;
  requestCode: string;
  status: "SUBMITTED" | "APPROVED";
  recordedPeriods: number[];
  missingFreePeriods: number[];
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

  async submit(payload: PublicLeaveSubmissionPayload): Promise<PublicLeaveSubmitResult> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_submit_public_leave_request_v3", payload);

    if (error) {
      const message = error.message || "Gagal mengirim pengajuan izin.";
      if (message.includes("DUPLICATE_ACTIVE_LEAVE_REQUEST")) {
        throw new Error("Guru ini sudah memiliki pengajuan izin aktif pada tanggal tersebut.");
      }
      if (message.includes("TEACHER_NOT_SCHEDULED_FOR_SLOT")) {
        throw new Error("Jadwal berubah atau tidak cocok. Muat ulang E-Jadwal lalu coba lagi.");
      }
      if (message.includes("FREE_PERIOD_HAS_TEACHING")) {
        throw new Error("Salah satu JP yang ditandai free ternyata memiliki jadwal mengajar. Muat ulang lalu coba lagi.");
      }
      if (message.includes("TEACHING_PERIOD_HAS_NO_SLOT")) {
        throw new Error("Salah satu JP mengajar tidak memiliki kelas terdampak yang valid.");
      }
      if (message.includes("SLOT_ALREADY_HAS_ACTIVE_COVERAGE")) {
        throw new Error("Salah satu JP sudah memiliki catatan izin/badal aktif.");
      }
      if (message.includes("ACADEMIC_EVENT_SUPPRESSES_SLOT")) {
        throw new Error("Salah satu JP sudah dibatalkan oleh Kalender Akademik.");
      }
      if (message.includes("SCHOOL_PERIOD_NOT_ACTIVE")) {
        throw new Error("Salah satu JP bukan jam sekolah aktif pada tanggal tersebut.");
      }
      throw new Error(message);
    }

    const row = (data || {}) as PublicLeaveRpcRow;
    if (!row.request_id || !row.request_code) {
      throw new Error("Supabase tidak mengembalikan bukti pengajuan yang lengkap.");
    }

    const periodCount = Number(row.period_count ?? row.slot_count ?? payload.p_periods.length);
    return {
      requestId: row.request_id,
      requestCode: row.request_code,
      status: row.status || "SUBMITTED",
      slotCount: periodCount,
      teachingSlotCount: Number(row.teaching_slot_count ?? payload.p_slots.length),
      freePeriodCount: Number(row.free_period_count ?? payload.p_periods.filter((item) => item.period_type === "FREE").length),
      taskUploadToken: String(row.task_upload_token || ""),
      taskUploadExpiresAt: String(row.task_upload_expires_at || ""),
      taskCount: Number(row.task_count ?? payload.p_tasks.length),
    };
  }
}
