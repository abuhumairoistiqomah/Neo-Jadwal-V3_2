/** Supabase PostgrestError is an object and String(error) becomes [object Object]. */
export function formatOperationalError(value: unknown): string {
  if (typeof value === "string") return value.trim() || "Kesalahan tidak diketahui.";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const main = typeof record.message === "string" ? record.message : "";
    const detail = typeof record.details === "string" ? record.details : "";
    const hint = typeof record.hint === "string" ? record.hint : "";
    const code = typeof record.code === "string" ? record.code : "";
    const parts = [main, detail, hint].filter((v, i, all) => v && all.indexOf(v) === i);
    if (parts.length) return `${parts.join(" • ")}${code ? ` (kode: ${code})` : ""}`;
    try { return JSON.stringify(value); } catch { /* cyclic error object */ }
  }
  return value instanceof Error ? value.message : "Gagal memproses perubahan. Periksa koneksi atau izin akses Supabase.";
}
