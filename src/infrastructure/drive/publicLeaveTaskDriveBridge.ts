export interface PublicLeaveTaskUploadResult {
  resourceId: string;
  driveFileId: string;
  url: string;
  fileName: string;
  mimeType: string;
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

export async function uploadPublicLeaveTaskFile(args: {
  apiUrl: string;
  requestCode: string;
  uploadToken: string;
  period: number;
  scheduleDate: string;
  file: File;
}): Promise<PublicLeaveTaskUploadResult> {
  const target = String(args.apiUrl || "").trim();
  if (!target.startsWith("https://script.google.com/") || (!target.endsWith("/exec") && !target.includes("/exec?"))) {
    throw new Error("Upload file belum tersedia karena URL Drive Bridge tidak valid.");
  }
  if (!args.requestCode || !args.uploadToken) throw new Error("Token upload tugas tidak tersedia. Kirim ulang pengajuan izin.");
  if (args.file.size > 10 * 1024 * 1024) throw new Error("Ukuran file maksimal 10 MB.");

  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "upload_leave_task_file",
      request_code: args.requestCode,
      upload_token: args.uploadToken,
      period: args.period,
      schedule_date: args.scheduleDate,
      file_name: args.file.name,
      mime_type: args.file.type || "application/octet-stream",
      base64: await fileToBase64(args.file),
    }),
  });
  const json = await response.json();
  if (!response.ok || json?.status !== "success") {
    throw new Error(json?.message || `Upload tugas gagal (HTTP ${response.status}).`);
  }
  return {
    resourceId: String(json.resource_id || ""),
    driveFileId: String(json.drive_file_id || ""),
    url: String(json.url || ""),
    fileName: String(json.file_name || args.file.name),
    mimeType: String(json.mime_type || args.file.type || "application/octet-stream"),
  };
}
