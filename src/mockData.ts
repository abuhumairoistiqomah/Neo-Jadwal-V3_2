import { Teacher, ScheduleItem, LogIzinItem, AdminAccount, JadwalInsidentalItem, MasterRuanganItem, KalenderAkademikItem } from "./types";

export const INITIAL_ACCOUNTS: AdminAccount[] = [
  { id: "admin", password: "admin", nama: "Administrator" },
  { id: "admin01", password: "321123", nama: "Istiqomah As Sayfullooh" }
];

export const INITIAL_TEACHERS: Teacher[] = [
  {
    nama: "OSY BENU ISMAIL, S.Pd.",
    panggilan: "OSY",
    mapel_utama: "English",
    rumpun: "English",
    jenjang: "SD",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "ISTIQOMAH ASY SAYFULLOH, M.Pd",
    panggilan: "ISTIQOMAH",
    mapel_utama: "Math",
    rumpun: "Math",
    jenjang: "SD",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "MUHAMAD JAKI FARHANSYAH, S.H.",
    panggilan: "FARHAN",
    mapel_utama: "SKI, Akidah Akhlaq",
    rumpun: "Diniyah",
    jenjang: "SD, SMP",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "HAFASH UBAIDILLAH, Lc., M.S.I.",
    panggilan: "HAFASH",
    mapel_utama: "Akidah",
    rumpun: "Diniyah",
    jenjang: "SMP",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "ADJI HAERUN MUTAKIN, M.Pd",
    panggilan: "ADJI",
    mapel_utama: "Arabic",
    rumpun: "Diniyah",
    jenjang: "SMP, SMA",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "JAVIER NOVAL ATHALLAH, S.Si.",
    panggilan: "JAVIER",
    mapel_utama: "Math",
    rumpun: "Math",
    jenjang: "SD, SMA",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "ENDANG IRAWAN, S.Pd",
    panggilan: "ENDANG",
    mapel_utama: "English",
    rumpun: "English",
    jenjang: "SMP, SMA",
    tugas_tambahan: "Manajemen",
    keterangan: "",
    is_manajemen: true
  },
  {
    nama: "MUHAMMAD RIJAL ABDURAHMAN, S.M.Gr.",
    panggilan: "RIJAL",
    mapel_utama: "Math, Tematik Indo",
    rumpun: "Math",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "01 INTER 1 I",
    wali_kelas: "01 INTER 1 I"
  },
  {
    nama: "HUDZAIFAH AZZAM, B.A.",
    panggilan: "AZZAM",
    mapel_utama: "SKI, Akidah Akhlaq, Fiqh, Akhlaq, Arabic",
    rumpun: "Diniyah",
    jenjang: "SD, SMP",
    tugas_tambahan: "Wali kelas",
    keterangan: "02 INTER 2 I",
    wali_kelas: "02 INTER 2 I"
  },
  {
    nama: "BINTANG PARAMITHA",
    panggilan: "BINTANG",
    mapel_utama: "English",
    rumpun: "English",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "01 INTER 4 A",
    wali_kelas: "01 INTER 4 A"
  },
  {
    nama: "NURLAILY APRIANI, S.Pd.",
    panggilan: "LAILY",
    mapel_utama: "Al-Qur'an",
    rumpun: "Al-Qur'an",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "01 INTER 5 A",
    wali_kelas: "01 INTER 5 A"
  },
  {
    nama: "MASYAUMUL JUM'AH DANIBAO, S.Ag.",
    panggilan: "UMUL",
    mapel_utama: "Al-Qur'an, Fiqh",
    rumpun: "Al-Qur'an",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "02 INTER 1 I",
    wali_kelas: "02 INTER 1 I"
  },
  {
    nama: "AGIL AL GHOZALI, S.Pd.",
    panggilan: "AGIL",
    mapel_utama: "Arabic, Fiqh",
    rumpun: "Diniyah",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "01 INTER 2 I",
    wali_kelas: "01 INTER 2 I"
  },
  {
    nama: "RAFI ILYASA SYUJA, S.Pd.",
    panggilan: "SYUJA",
    mapel_utama: "Al-Qur'an, Tematik Indo",
    rumpun: "Al-Qur'an",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "02 INTER 3 I",
    wali_kelas: "02 INTER 3 I"
  },
  {
    nama: "AIDAH FAUZIAH, B.A.",
    panggilan: "AIDAH",
    mapel_utama: "Arabic, Fiqh, Akidah Akhlaq",
    rumpun: "Diniyah",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "02 INTER 4 A",
    wali_kelas: "02 INTER 4 A"
  },
  {
    nama: "IDA NURJELITA SANI, M.Pd",
    panggilan: "IDA",
    mapel_utama: "Science",
    rumpun: "Science",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "02 INTER 5 A",
    wali_kelas: "02 INTER 5 A"
  },
  {
    nama: "LALU MUHAMAD FATHONI, S.Pd",
    panggilan: "LALU",
    mapel_utama: "Al-Qur'an",
    rumpun: "Al-Qur'an",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "03 INTER 1 I",
    wali_kelas: "03 INTER 1 I"
  },
  {
    nama: "SALMAN AL FARISI, S.Pd.",
    panggilan: "SALMAN F",
    mapel_utama: "SKI, Al-Qur'an",
    rumpun: "Al-Qur'an",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "03 INTER 2 I",
    wali_kelas: "03 INTER 2 I"
  },
  {
    nama: "AMATURRAHIM, B.Sh.",
    panggilan: "AMA",
    mapel_utama: "Akidah Akhlaq, Arabic, SKI",
    rumpun: "Diniyah",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "03 INTER 3 A",
    wali_kelas: "03 INTER 3 A"
  },
  {
    nama: "SYIFA NABILA NAJLA PUTRI, S.Pd",
    panggilan: "SYIFA",
    mapel_utama: "Al-Qur'an, Fiqh",
    rumpun: "Al-Qur'an",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "03 INTER 4 A",
    wali_kelas: "03 INTER 4 A"
  },
  {
    nama: "MUHAMMAD DAHYAL AFKAR, S.Pd.",
    panggilan: "AFKAR",
    mapel_utama: "Al-Qur'an, SKI, Akidah Akhlaq",
    rumpun: "Al-Qur'an",
    jenjang: "SD, SMP",
    tugas_tambahan: "Wali kelas",
    keterangan: "04 INTER 1 I",
    wali_kelas: "04 INTER 1 I"
  },
  {
    nama: "SALMAN ALVARIZI, S.Pd.",
    panggilan: "SALMAN V",
    mapel_utama: "Fiqh, Akidah Akhlaq, SKI",
    rumpun: "Diniyah",
    jenjang: "SD",
    tugas_tambahan: "Wali kelas",
    keterangan: "04 INTER 2 I",
    wali_kelas: "04 INTER 2 I"
  }
];

export const INITIAL_SCHEDULES: ScheduleItem[] = [
  {
    id: "s1",
    kelas: "01 INTER 1",
    hari: "Senin",
    jam_ke: 1,
    mulai: "07:40",
    selesai: "08:40",
    mapel: "Al-Qur'an",
    guru1: "AHMAD ZAKI",
    guru2: "MR QUR'AN 1",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  },
  {
    id: "s2",
    kelas: "01 INTER 1",
    hari: "Senin",
    jam_ke: 2,
    mulai: "08:40",
    selesai: "09:40",
    mapel: "Math",
    guru1: "MUHAMMAD RIJAL ABDURAHMAN, S.M.Gr.",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  },
  {
    id: "s3",
    kelas: "01 INTER 1",
    hari: "Senin",
    jam_ke: 3,
    mulai: "10:00",
    selesai: "11:00",
    mapel: "English",
    guru1: "OSY BENU ISMAIL, S.Pd.",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  },
  {
    id: "s4",
    kelas: "02 INTER 2",
    hari: "Senin",
    jam_ke: 1,
    mulai: "07:40",
    selesai: "08:40",
    mapel: "SKI",
    guru1: "HUDZAIFAH AZZAM, B.A.",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  },
  {
    id: "s5",
    kelas: "02 INTER 2",
    hari: "Senin",
    jam_ke: 2,
    mulai: "08:40",
    selesai: "09:40",
    mapel: "Arabic",
    guru1: "ADJI HAERUN MUTAKIN, M.Pd",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  },
  {
    id: "s6",
    kelas: "01 INTER 4",
    hari: "Senin",
    jam_ke: 1,
    mulai: "07:40",
    selesai: "08:40",
    mapel: "English",
    guru1: "BINTANG PARAMITHA",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  },
  {
    id: "s7",
    kelas: "01 INTER 1",
    hari: "Selasa",
    jam_ke: 1,
    mulai: "07:40",
    selesai: "08:40",
    mapel: "Math",
    guru1: "ISTIQOMAH ASY SAYFULLOH, M.Pd",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    kelasgabung: "Tidak"
  }
];

export const INITIAL_LOGS: LogIzinItem[] = [
  {
    id: "log1",
    tanggal: "2026-07-06",
    guru_izin: "MUHAMMAD RIJAL ABDURAHMAN, S.M.Gr.",
    alasan: "Sakit (Flu berat)",
    jam_ke: 2,
    kelas: "01 INTER 1",
    mapel: "Math",
    guru_pengganti: "ISTIQOMAH ASY SAYFULLOH, M.Pd"
  }
];

export const INITIAL_INCIDENTALS: JadwalInsidentalItem[] = [
  {
    id: "inc1",
    tanggal: "2026-07-21",
    kelas: "01 INTER 1",
    jam_ke: 3,
    mapel: "Science Lab",
    guru1: "ISTIQOMAH ASY SAYFULLOH, M.Pd",
    guru2: "",
    guru3: "",
    guru4: "",
    guru5: "",
    guru6: "",
    ruangan: "LABIPA",
    keterangan_khusus: "Lab IPA Lt. 2",
    alasan: "Pindah Ruang Sementara",
    tipe_insidental: "Pindah Ruang"
  }
];

export const INITIAL_MASTER_RUANGAN: MasterRuanganItem[] = [
  { id_ruangan: "RSG", nama_ruangan: "Ruang Belajar Serba Guna", alias: "Ruang Transit MQ|RSB|RSG", kapasitas: 13, lokasi: "Lantai 1 Gedung B", jenis: "Ruang Multifungsi", status: "Aktif" },
  { id_ruangan: "LABKOM", nama_ruangan: "Laboratorium Komputer", alias: "Ruang Laboratorium Komputer|Lab Komputer|Labkom", kapasitas: 25, lokasi: "Lantai 3 Gedung A", jenis: "Laboratorium", status: "Aktif" },
  { id_ruangan: "LABIPA", nama_ruangan: "Laboratorium Sains", alias: "Ruang Laboratorium Science|Lab IPA|Lab Sains", kapasitas: 25, lokasi: "Lantai 3 Gedung A", jenis: "Laboratorium", status: "Aktif" },
  { id_ruangan: "PERPUS", nama_ruangan: "Perpustakaan", alias: "Ruang Perpustakaan|Library", kapasitas: 20, lokasi: "Lantai 3 Gedung A", jenis: "Perpustakaan", status: "Aktif" },
  { id_ruangan: "MUSHALASD", nama_ruangan: "Mushala Lantai 5", alias: "Ruang Mushala SD|Mushala SD|Mushola SD", kapasitas: 20, lokasi: "Lantai 5 Gedung A", jenis: "Ruang Ibadah", status: "Aktif" },
  { id_ruangan: "MQSDRENDAHIKH", nama_ruangan: "Kelas 1 dan 2 MQ Ikhwan", alias: "Ruang Kelas 1 dan 2 MQ Ikhwan", kapasitas: 25, lokasi: "Lantai 2 Gedung A", jenis: "Ruang Kelas", status: "Aktif" },
  { id_ruangan: "MQSMPSMAIKH", nama_ruangan: "Kelas SMP-SMA MQ Ikhwan", alias: "Ruang Kelas SMP-SMA MQ Ikhwan", kapasitas: 25, lokasi: "Lantai 3 Gedung A", jenis: "Ruang Kelas", status: "Aktif" },
  { id_ruangan: "MQSMPSMAAKH", nama_ruangan: "Kelas SMP-SMA MQ Akhwat", alias: "Ruang Kelas SMP-SMA MQ Akhwat", kapasitas: 25, lokasi: "Lantai 4 Gedung B", jenis: "Ruang Kelas", status: "Aktif" },
  { id_ruangan: "KLS1INTER3", nama_ruangan: "Kelas 1 Inter 3", alias: "Ruang Kelas 1 Inter 3", kapasitas: 25, lokasi: "Lantai 1 Gedung A", jenis: "Ruang Kelas", status: "Aktif" }
];

export const INITIAL_KALENDER_AKADEMIK: KalenderAkademikItem[] = [
  {
    id: "LIB001",
    tanggal_mulai: "2026-08-17",
    tanggal_selesai: "2026-08-17",
    nama_kegiatan: "Hari Kemerdekaan RI",
    tipe: "Libur",
    cakupan: "Semua",
    kelas: "",
    jp_mulai: null,
    jp_selesai: null,
    status: "Aktif"
  },
  {
    id: "LIB002",
    tanggal_mulai: "2026-09-10",
    tanggal_selesai: "2026-09-10",
    nama_kegiatan: "Pulang Lebih Awal",
    tipe: "Pulang Cepat",
    cakupan: "Semua",
    kelas: "",
    jp_mulai: 4,
    jp_selesai: 6,
    status: "Aktif"
  },
  {
    id: "LIB003",
    tanggal_mulai: "2026-10-05",
    tanggal_selesai: "2026-10-05",
    nama_kegiatan: "Kegiatan Kelas 1",
    tipe: "Kegiatan",
    cakupan: "Kelas",
    kelas: "01 INTER 1",
    jp_mulai: 3,
    jp_selesai: 4,
    status: "Aktif"
  }
];

