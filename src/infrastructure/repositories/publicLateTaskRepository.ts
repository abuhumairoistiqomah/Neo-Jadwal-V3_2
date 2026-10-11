import { requireSupabaseClient } from "../supabase/client";
import type { InvalTaskResourceInput } from "../../domain/inval/invalWrite";

export interface RecoveredTaskAccess {
  requestCode: string;
  teacherName: string;
  scheduleDate: string;
  uploadToken: string;
  expiresAt: string;
}

export class PublicLateTaskRepository {
  async recoverAccess(args: { teacherName: string; requestCode: string; whatsappLast4: string }): Promise<RecoveredTaskAccess> {
    const client = requireSupabaseClient();
    const { data, error } = await client.rpc("ejadwal_recover_public_task_upload", {
      p_teacher_name: args.teacherName.trim(),
      p_request_code: args.requestCode.trim(),
      p_whatsapp_last4: args.whatsappLast4.trim(),
    });
    if (error) throw new Error(error.message || "Gagal memulihkan akses tugas.");
    const row = (data || {}) as Record<string, unknown>;
    if (!row.upload_token || !row.request_code) throw new Error("Supabase tidak mengembalikan akses tugas yang lengkap.");
    return {
      requestCode: String(row.request_code),
      teacherName: String(row.teacher_name || args.teacherName),
      scheduleDate: String(row.schedule_date || ""),
      uploadToken: String(row.upload_token),
      expiresAt: String(row.expires_at || ""),
    };
  }

  async completeTask(args: {
    requestCode: string;
    uploadToken: string;
    period: number;
    description: string;
    resources: InvalTaskResourceInput[];
  }): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client.rpc("ejadwal_complete_public_leave_task", {
      p_request_code: args.requestCode,
      p_upload_token: args.uploadToken,
      p_period: args.period,
      p_description: args.description.trim() || null,
      p_resources: args.resources.map((resource) => ({
        resource_type: "LINK",
        label: resource.label || null,
        url: resource.url,
      })),
    });
    if (error) throw new Error(error.message || "Gagal menyimpan tugas susulan.");
  }
}
