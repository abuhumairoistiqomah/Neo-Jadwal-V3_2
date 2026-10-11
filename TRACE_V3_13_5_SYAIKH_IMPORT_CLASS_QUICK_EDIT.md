# TRACE V3.13.5 — Syaikh Rotation Import + Jadwal Kelas Quick Edit

## Goal

V3.13.5 menyelesaikan dua workflow operasional:

1. Rotasi mingguan Syaikh/Syaikhoh tidak lagi disusun manual satu-per-satu. Tabel `KELAS/ PEKAN` diubah menjadi batch `schedule_incidentals`.
2. Admin dapat Quick Edit langsung dari **Jadwal Kelas** menggunakan mutation engine yang sama dengan Dashboard Guru.

## Rotation semantics

Input matrix contoh:

```text
KELAS/ PEKAN                 5 - 9 OCT       12 - 16 OCT
02 INTER 1 I                 NATIVE ARABIC   NORMAL
02 INTER 3 I + 02 MQ IKHWAN NORMAL          NATIVE ARABIC
```

Parser mencari slot recurring master dari kelas berdasarkan guru Syaikh/Syaikhoh terpilih dan/atau `Pencocokan Mapel`.

Untuk setiap pekan:

- hari master kelas digunakan untuk menentukan tanggal konkret di dalam rentang pekan;
- `NATIVE` memastikan Syaikh/Syaikhoh masuk teacher-set;
- `NORMAL` menghapus Syaikh/Syaikhoh dan mempertahankan companion teacher;
- subject tetap mewarisi mapel master;
- room override dikosongkan sehingga effective schedule tetap mewarisi ruangan master;
- publish menggunakan `kind = OVERRIDE` dan `incidental_type = SYAIKH_ROTATION`.

Untuk row kelas gabung, union guru dari seluruh canonical row dibuat lebih dulu lalu teacher-set yang sama diterapkan ke setiap row. Ini mempertahankan inferred-combined-session semantics.

## Safety

Preview memblokir:

- kelas tidak ditemukan;
- slot master tidak ditemukan;
- lebih dari satu slot master kandidat untuk satu kelas;
- kelas dalam satu row gabung berada di hari/JP berbeda;
- mapel master berbeda di dalam satu row gabung;
- guru master tidak bisa di-resolve ke Master Guru;
- status NORMAL tidak menyisakan companion teacher;
- incidental non-`SYAIKH_ROTATION` sudah memiliki slot tersebut.

Double-booking guru antar-row import adalah warning. Publish warning memerlukan konfirmasi eksplisit dan diteruskan ke canonical incidental mutation sebagai `allow_teacher_conflict = true`.

Server-side `ejadwal_publish_syaikh_rotation_v1` tetap memanggil `ejadwal_upsert_schedule_incidental_v1`, sehingga validasi existing dan audit tidak diduplikasi.

## Connected Jadwal Kelas Quick Edit

Admin sekarang mendapatkan ikon pensil pada sel Jadwal Kelas (desktop/mobile) serta tombol **Quick Edit Jadwal** pada detail modal.

Flow:

```text
Jadwal Kelas cell
      ↓
ScheduleQuickEditor
      ├── Ubah Jadwal Tetap → ejadwal_update_schedule_master_v2
      └── Hanya Tanggal Ini → ejadwal_upsert_schedule_incidental_session_v1
                              / ejadwal_upsert_schedule_incidental_v1
      ↓
refreshFromSupabase()
      ↓
semua consumer membaca snapshot canonical terbaru
```

Old local-only companion editor tidak lagi menjadi entry point dari Jadwal Kelas; canonical Quick Editor adalah jalur edit operator.

## Database migrations

Prerequisite repair if not already applied:

- `038` restore `ejadwal_update_schedule_master_v2`
- `039` verify repair

V3.13.5:

- `040` create `ejadwal_publish_syaikh_rotation_v1`
- `041` verifier, target **8/8 TRUE**

## Offline regression notes

- TypeScript domain compile for `syaikhRotationImport.ts`: PASS.
- TypeScript syntax transpile scan: 119 TS/TSX source files, 0 syntax diagnostics.
- Focused Native/Normal + combined-session runtime assertions: PASS.
- Actual workbook `N.ARABIC`: 180 rotation cells parsed, 0 error, 0 warning.
- Actual workbook `N.QURAN`: 32 rotation cells parsed, 0 error, 1 intentional source-order warning (`4 - 7 JUL` after `28 - 31 JUL`).
- `npm install` could not be completed in the build environment before timeout, therefore full `npm test` / `npm run lint` / `npm run build` remain the local release gate.
