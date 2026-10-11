/**
 * Canonical data contracts for E-Jadwal.
 *
 * V3.2 extracts these interfaces from the former src/types.ts monolith.
 * Keep this file free of runtime/business logic.
 */

export interface Teacher {
  /** Supabase UUID when the snapshot comes from Postgres; absent on pure legacy fixtures. */
  id?: string | null;
  nama: string;
  panggilan?: string | null;
  gender?: "IKHWAN" | "AKHWAT" | "UNKNOWN" | string | null;
  whatsapp_e164?: string | null;
  mapel_utama: string;
  rumpun: string;
  jenjang: string;
  tugas_tambahan: string;
  keterangan: string;
  wali_kelas?: string | null;
  pendamping_kelas?: string | null;
  is_manajemen?: boolean;
}

export interface MasterRuanganItem {
  id_ruangan: string;
  nama_ruangan: string;
  alias?: string;
  kapasitas?: number;
  lokasi?: string;
  jenis?: string;
  status?: string;
  gedung?: string;
  lantai?: string | number;
}

export interface ResolvedRoomInfo {
  id_ruangan: string;
  nama_ruangan: string;
  alias?: string;
  lokasi?: string;
  kapasitas?: number;
  jenis?: string;
  status?: string;
  isKnown: boolean;
  rawValue?: string;
}


export interface ScheduleItem {
  id: string;
  kelas: string;
  hari: string;
  jam_ke: number;
  mulai: string;
  selesai: string;
  mapel: string;
  guru1: string;
  guru2: string;
  guru3: string;
  guru4: string;
  guru5: string;
  guru6: string;
  kelasgabung: string;
  ruangan?: string;
  selainguru1_mengawas?: string;
  keterangan_khusus?: string;
}

export interface LogIzinItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  guru_izin: string;
  alasan: string;
  jam_ke: number; // Single hour (0-6)
  kelas: string;
  mapel: string;
  guru_pengganti: string; // Name of replacement
  /** Persistence source; required to distinguish audited legacy amendments. */
  source?: string;
  /** Selected substitute UUID when loaded from Supabase. */
  substitute_teacher_id?: string | null;
  /** Dated public contact: populated only for active current/future coverage. */
  whatsapp_guru_izin?: string | null;
  whatsapp_guru_pengganti?: string | null;
  tugas?: string;
  created_at?: string;
}

export interface JadwalInsidentalItem {
  id: string;
  tanggal: string; // YYYY-MM-DD
  kelas: string;
  jam_ke: number;
  mapel: string;
  guru1: string;
  guru2: string;
  guru3: string;
  guru4: string;
  guru5: string;
  guru6: string;
  kelasgabung?: string;
  ruangan?: string;
  keterangan_khusus?: string;
  alasan?: string;
  tipe_insidental?: string;
  kind?: "OVERRIDE" | "ADDITIONAL" | string;
  /** Optional date-specific time override. Empty values inherit the master/JP clock. */
  mulai?: string;
  selesai?: string;
  /** True when Supabase explicitly SET a teacher team; empty trailing positions must not inherit master teachers. */
  replaceTeachers?: boolean;
}

export interface AdminAccount {
  id: string;
  password: string;
  nama: string;
}

export type ActivePage = 
  | "dashboard"
  | "ajukan-izin"
  | "lengkapi-tugas"
  | "approval-izin"
  | "action-center"
  | "management-analytics"
  | "jadwal-lengkap"
  | "jadwal-kelas"
  | "jadwal-ruangan"
  | "guru-pengampu-kelas"
  | "list-mapel"
  | "jam-kosong-individu"
  | "jam-kosong-semua"
  | "tabel-jam-kosong"
  | "input-pengganti"
  | "log-pengganti"
  | "statistik"
  | "rekap-guru"
  | "master-data"
  | "schedule-import"
  | "schedule-syaikh-import"
  | "schedule-incidental"
  | "substitute-constraints"
  | "academic-calendar"
  | "schedule-control-center";


export interface KalenderAkademikItem {
  id: string;
  tanggal_mulai: string; // YYYY-MM-DD
  tanggal_selesai: string; // YYYY-MM-DD
  nama_kegiatan: string;
  tipe: string; // e.g. "Libur" | "Pulang Cepat" | "Kegiatan"
  cakupan: string; // e.g. "Semua" | "Kelas" | "Jenjang"
  kelas?: string;
  jp_mulai?: number | null;
  jp_selesai?: number | null;
  status?: string; // "Aktif" | "Nonaktif"
  keterangan?: string;
}

export interface DBState {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  logs: LogIzinItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  masterRuangan?: MasterRuanganItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  apiUrl: string; // Configured Google Apps Script API URL
  apiConnected: boolean; // Is it currently fetching from the custom API
}

