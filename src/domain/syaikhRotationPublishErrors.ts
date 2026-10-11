import { formatOperationalError } from "./formatOperationalError";
import { isMissingRpcError } from "./errorMessage";

export interface RotationPublishErrorRow {
  scheduleDate: string;
  classId: string;
  className: string;
  period: number;
}

export function isSyaikhTeacherConflictRequired(error: unknown): boolean {
  return formatOperationalError(error).includes("TEACHER_SLOT_CONFLICT_CONFIRM_REQUIRED");
}

export function explainSyaikhPublishError(error: unknown, rows: RotationPublishErrorRow[]): string {
  const original = formatOperationalError(error);
  if (isMissingRpcError(error, "ejadwal_publish_syaikh_rotation_v1")) {
    return `${original}\nRPC Mass Import Syaikh belum tersedia di Supabase yang terhubung. Periksa migration 202610100040_v3_13_5_syaikh_rotation_import.sql dan koneksi project Supabase.`;
  }
  // A server-side conflict can reference a UUID instead of the class label;
  // resolve it against the very batch the user has previewed.
  const slot = original.match(/INCIDENTAL_SLOT_OWNED_BY_OTHER_CHANGE:(\d{4}-\d{2}-\d{2}):([0-9a-f-]{36}):(\d+)/i);
  if (slot) {
    const [, date, classId, rawPeriod] = slot;
    const row = rows.find((item) => item.scheduleDate === date && item.classId === classId && item.period === Number(rawPeriod));
    return `${original}\n${row ? `${row.className} • ${date} JP${rawPeriod}` : `Tanggal ${date} JP${rawPeriod}`} sudah punya insidental lain (bukan SYAIKH_ROTATION). Edit entri insidental tersebut dulu; Mass Import sengaja tidak menimpanya.`;
  }
  if (isSyaikhTeacherConflictRequired(error)) {
    return `${original}\nSupabase menemukan bentrok guru pada jadwal efektif. Periksa kelas gabungan atau jadwal guru yang sudah aktif pada tanggal dan JP tersebut.`;
  }
  return original;
}
