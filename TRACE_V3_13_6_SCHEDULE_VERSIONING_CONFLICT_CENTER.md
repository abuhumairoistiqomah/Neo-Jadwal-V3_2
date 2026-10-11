# TRACE V3.13.6 — Schedule Versioning + Conflict Center

## Tujuan

V3.13.6 menutup tiga kebutuhan setelah Schedule Mutation Core dan Mass Import Syaikh:

1. setiap publish/perubahan jadwal dapat dilihat sebagai versi;
2. operator dapat kembali ke versi lama tanpa menghapus audit history;
3. konflik jadwal dapat diperiksa dari satu pusat;
4. Dashboard Wali Kelas memperoleh Quick Edit canonical yang sama dengan Dashboard Guru.

---

## A. Schedule Versioning

### Source of truth

Versioning tidak membuat schedule database kedua. `schedule_master`, `schedule_incidentals`, dan `academic_events` tetap source of truth.

`schedule_versions.snapshot` hanya menyimpan checkpoint JSONB dari state canonical setelah perubahan berhasil.

### Satu transaction = satu version

Trigger berada pada `audit_logs`, bukan pada setiap schedule row.

Flow contoh combined session:

```text
Quick Edit 05 INTER + 05 MQ
        ↓
incidental row A
incidental row B
        ↓
2 audit insert dalam transaction yang sama
        ↓
txid_current() sama
        ↓
1 schedule_versions row
```

Trigger melakukan UPSERT berdasarkan `txid`. Snapshot terakhir di transaction menjadi final version state.

Ini juga berlaku untuk Mass Import Syaikh yang dapat menulis puluhan/ratusan incidental rows dalam satu RPC.

### Baseline

Saat migration `042` dipasang, current schedule state dicapture sebagai `VERSIONING_BASELINE`.

History sebelum V3.13.6 tidak direkonstruksi menjadi puluhan versi palsu. Baseline menyatakan dengan jujur: **ini adalah state awal ketika versioning resmi dinyalakan**.

---

## B. Rollback

Rollback mengembalikan:

```text
schedule_master
schedule_master_teachers
schedule_incidentals
schedule_incidental_teacher_overrides
academic_events
```

Rollback **tidak mengubah**:

```text
leave_requests
leave_request_periods
coverage_slots
learning_tasks
task_resources
substitute history
```

Alasannya: data izin/badal adalah histori kejadian nyata. Mengubah master schedule tidak boleh menghapus fakta bahwa guru pernah izin atau badal pernah ditugaskan.

### Rows yang lahir setelah target version

Master rows yang belum ada di target tidak di-hard-delete. Mereka dinonaktifkan/soft-deleted agar FK historis tetap aman.

Incidental rows tambahan juga di-soft-delete.

Academic event tidak mempunyai soft-delete semantic, sehingga event yang belum ada pada target dapat dihapus saat rollback. Trigger audit Kalender Akademik disuppress selama restore, kemudian satu audit `SCHEDULE_VERSION_ROLLBACK` ditulis pada akhir transaction.

Rollback itu sendiri menghasilkan **versi baru**, sehingga operator dapat melihat bahwa sistem pernah rollback ke vN.

---

## C. Conflict Center

### Master conflict

Conflict detector collapse inferred combined session berdasarkan:

```text
hari + JP + mapel + teacher-set
```

Karena itu:

```text
05 INTER 1 + 05 MQ IKHWAN
Math
Guru A
Rabu JP3
```

bukan double-booking Guru A.

Setelah collapse:

- satu class memiliki dua session berbeda pada slot sama → BLOCKER;
- satu room dipakai dua session berbeda → BLOCKER;
- satu teacher berada pada dua session berbeda → WARNING.

Teacher conflict tetap warning sesuai filosofi Quick Editor: Admin boleh melakukan deliberate override, tetapi sistem harus menampilkannya dengan jelas.

### Incidental conflict

Untuk setiap tanggal yang memiliki incidental, detector membangun **effective schedule**:

```text
Master
  ↓
Incidental override/additional
  ↓
Academic Calendar suppression
  ↓
scan conflict
```

Ini mencegah false positive seperti:

```text
Master:
Guru B → Class 6

Tanggal 14:
Class 6 override → Guru C
Class 5 override → Guru B
```

Pada tanggal 14 Guru B hanya mengajar Class 5, jadi tidak dianggap bentrok.

---

## D. Dashboard Wali Kelas Quick Edit

Tab `wali-kelas` pada Dashboard sekarang memiliki tombol Quick Edit di card KBM normal.

Saat diklik:

```text
Dashboard Wali Kelas
      ↓
canonical master items
      ↓
ScheduleQuickEditor
      ↓
PERMANENT / INCIDENTAL
      ↓
Supabase mutation RPC
      ↓
refreshFromSupabase()
```

Tanggal Dashboard diteruskan sebagai `initialDate`, sehingga jika operator memilih **Hanya Tanggal Ini**, tanggal konteksnya sudah tepat.

Untuk safety, card yang sudah menjadi incidental existing atau disuppress Kalender Akademik tidak menampilkan tombol Quick Edit ini. Edit existing incidental tetap dilakukan lewat menu Jadwal Insidental.

---

## E. Migration

Apply:

```text
042 — 202610100042_v3_13_6_schedule_versioning.sql
043 — 202610100043_v3_13_6_verify_schedule_versioning.sql
```

Expected verifier: **12 / 12 TRUE**.

---

## F. Smoke Test

### 1. Version creation

- Catat versi terbaru di `Versi & Konflik Jadwal`.
- Quick Edit satu jadwal permanen.
- Refresh control center.
- Expected: satu versi baru dengan source **Quick Edit Permanen**.

### 2. Combined session

- Quick Edit satu sesi gabung dua kelas.
- Expected: hanya satu version baru untuk transaction tersebut.

### 3. Incidental

- Quick Edit → `Hanya Tanggal Ini`.
- Expected: effective schedule tanggal itu berubah; master minggu berikutnya tetap; satu version baru.

### 4. Rollback

- Pilih versi sebelum perubahan tadi.
- Isi alasan rollback.
- Confirm.
- Expected: schedule state kembali, history leave/badal tidak berubah, dan history mendapat version baru bertipe **Rollback Jadwal**.

### 5. Conflict Center

- Teacher yang sengaja di-override pada dua session berbeda → WARNING.
- Dua session berbeda di room yang sama → BLOCKER.
- Inferred combined session guru/mapel sama → tidak muncul sebagai teacher conflict.

### 6. Dashboard Wali Kelas

- Dashboard → tab Wali Kelas → pilih kelas/tanggal.
- Card KBM normal harus memiliki `Quick Edit`.
- Klik dan pilih `Hanya Tanggal Ini`.
- Expected tanggal input sudah sama dengan tanggal yang sedang dilihat.
