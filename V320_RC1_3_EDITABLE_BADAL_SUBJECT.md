# E-JADWAL V3.20 RC1.3 — Editable Subject During Substitute Assignment

## Tujuan

Ketika guru pengajar khusus (mis. Syaikh Tahsin atau Native Arabic) izin, pengganti dapat mengajarkan mapel normal pada **tanggal + kelas + JP tertentu** tanpa mengubah `schedule_master`.

## Perubahan

- Input Inval (Admin) menambahkan `Edit Mapel` per sesi JP1–JP6, dengan saran dari nama mapel yang sudah ada dan opsi mengetik bebas (maksimal 120 karakter).
- Mapel asli tetap diperlihatkan. `Kembalikan Mapel Asli` membatalkan edit.
- Kelas gabungan: satu perubahan diterapkan ke **setiap kelas** pada sesi tersebut; `coverage_slots` tetap satu record per kelas.
- Form mengirim `original_subject` **hanya untuk mapel yang benar-benar diubah**, bukan untuk seluruh penugasan biasa.
- `ejadwal_save_inval_bundle_v320_rc13` memanggil writer v319 RC4.2 (preserve constraints, task resources, role checks dan NO_SUBSTITUTE), kemudian menulis override mapel per tanggal+kelas+JP dalam **transaksi PostgreSQL yang sama**.
- Jika sebelumnya ada `schedule_incidentals` untuk slot tersebut, hanya `override_subject` dan `updated_at` yang diperbarui. Ruangan, tim guru, mode gabungan, waktu, dan keterangan lain dibiarkan utuh.
- `coverage_slots.subject_snapshot` juga disinkronkan, dengan audit untuk kedua perubahan. Jadwal master tidak disentuh.
- Bila jadwal efektif sudah berubah dibanding `original_subject` yang dibaca operator, RPC menolak seluruh penyimpanan dengan `BADAL_SUBJECT_STALE_REFRESH_REQUIRED`; perbarui data/refresh sebelum mencoba lagi.
- Perubahan pada mapel juga membatalkan cache peringkat rekomendasi supaya relevansi mata pelajaran mengikuti mapel baru, tetapi mengetik tugas tetap tidak mengulang ranking.

## Batasan yang disengaja

- Editor mapel baru aktif di **Input Inval (Admin)**, bukan pada pemilih WAITING dari Persetujuan Izin dan bukan pada alur khusus Aturan Guru Badal; dua alur itu memakai RPC penugasan berbeda. Menghindari perubahan yang tampak tersimpan tetapi tidak benar-benar masuk jadwal.
- JP0 Homeroom tidak boleh mengganti mapel lewat editor ini.
- Belum menyediakan pengubahan mapel setelah badal disimpan melalui menu Edit Badal; ubah mapel lewat Quick Edit dated yang sudah ada, atau penambahan fitur editing khusus berikutnya.
- Mengedit mapel badal tidak mengubah izin maupun klasifikasi PERSONAL/SCHOOL_DUTY.

## Instalasi (RC1.2 → RC1.3)

1. Backup database dan source.
2. Jalankan SQL `supabase/migrations/202610230002_v3_20_rc1_3_badal_subject_override.sql` di **staging**. Migration sebelumnya (RC1.2: `202610230001_...`) harus sudah terpasang.
3. Jalankan `v320_RC1_3_READONLY_VERIFIER.sql`.
4. Ekstrak patch zip ke root proyek V3.20 RC1.2 (jangan timpa `.env.local` atau `package-lock.json`).
5. Jalankan `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`.
6. Uji manual: input inval tanggal+kelas+JP yang ada mapel `Tahsin Syaikh` → ubah ke `Tahsin` → simpan → refresh → periksa Log Izin & WA, Jadwal Kelas, dan Jadwal Guru. Verifikasi satu hari sebelumnya/sesudahnya tidak berubah. Uji skenario ruangan insidental dan kelas gabungan.

## Pengujian yang sudah dijalankan saat paket disusun

- 262 file TypeScript/TSX lolos parsing.
- 44 tes domain/regresi berhasil menggunakan transpiler TypeScript lokal (7 baru + 37 regresi terkait), bukan full `npm test`.
- Full TypeScript checking, Vite build, dan eksekusi PostgreSQL belum diverifikasi di lingkungan ini karena dependency tidak tersedia.
- **Status: staging candidate**, bukan production-ready.

## Rollback / batas aman

- Mengembalikan source ke RC1.2 menghentikan UI fitur baru. Fungsi SQL baru bisa dibiarkan tidak terpanggil; jika ingin menghapusnya: `drop function if exists public.ejadwal_save_inval_bundle_v320_rc13(jsonb,jsonb,text);`.
- Perubahan mapel yang sudah **tersimpan** dalam `schedule_incidentals` tidak otomatis dihapus oleh rollback source. Gunakan tanggal+kelas+JP spesifik dan jejak audit sebelum mengembalikan `override_subject` ke nilai semula.
- Kredensial di Full Source PERSONAL bersifat privat: jangan upload ke GitHub atau bagikan ZIP ke pihak lain.
