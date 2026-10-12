/** Private screenshot of explicit prior management permission (not a learning task). */
export const MANAGEMENT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const MANAGEMENT_EVIDENCE_BUCKET = "ejadwal-leave-evidence";

const allowedExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function evidenceExtension(file: Pick<File, "type" | "size">): string {
  const extension = allowedExtensions[file.type.toLowerCase()];
  if (!extension) throw new Error("Bukti harus berupa gambar JPG, PNG, atau WEBP.");
  if (file.size === 0 || file.size > MANAGEMENT_EVIDENCE_MAX_BYTES) {
    throw new Error("Ukuran bukti izin harus antara 1 byte dan 5 MB.");
  }
  return extension;
}

export function evidenceUploadMimeMatches(path: string, file: Pick<File, "type" | "size">): boolean {
  const extension = evidenceExtension(file);
  const existing = String(path).split(".").pop()?.toLowerCase();
  return existing === extension || (extension === "jpg" && existing === "jpeg");
}
