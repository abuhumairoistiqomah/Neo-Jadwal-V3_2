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

export class SupabasePublicLeaveRepository implements PublicLeaveRepository {
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
