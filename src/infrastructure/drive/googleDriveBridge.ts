import { requireSupabaseClient } from "../supabase/client";
import type { InvalTaskResourceInput } from "../../domain/inval/invalWrite";

export interface DriveUploadContext {
  scheduleDate: string;
  period: number;
  classLabel: string;
  subject: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.onload = () => {
      const value = String(reader.result || "");
      const comma = value.indexOf(",");
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadTaskFileToDrive(args: {
  apiUrl: string;
  file: File;
  context: DriveUploadContext;
}): Promise<InvalTaskResourceInput> {
  const target = args.apiUrl.trim();
  if (!target.startsWith("https://script.google.com/")) {
    throw new Error("Google Drive Bridge membutuhkan URL Web App Apps Script yang valid.");
  }
  if (args.file.size > 10 * 1024 * 1024) {
    throw new Error("Ukuran file maksimal 10 MB untuk Drive Bridge.");
  }

  const client = requireSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Session Supabase tidak aktif. Login ulang sebelum upload file.");

  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "upload_task_file",
      auth_token: data.session.access_token,
      file_name: args.file.name,
      mime_type: args.file.type || "application/octet-stream",
      base64: await fileToBase64(args.file),
      schedule_date: args.context.scheduleDate,
      period: args.context.period,
      class_label: args.context.classLabel,
      subject: args.context.subject,
    }),
  });
  const json = await response.json();
  if (!response.ok || json?.status !== "success") {
    throw new Error(json?.message || `Drive Bridge gagal (HTTP ${response.status}).`);
  }
  return {
    resource_type: "DRIVE_FILE",
    label: json.file_name || args.file.name,
    url: String(json.url || ""),
    drive_file_id: String(json.drive_file_id || ""),
    file_name: json.file_name || args.file.name,
    mime_type: json.mime_type || args.file.type || "application/octet-stream",
  };
}
