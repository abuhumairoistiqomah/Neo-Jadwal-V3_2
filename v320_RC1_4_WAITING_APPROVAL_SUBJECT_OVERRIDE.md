# E-JADWAL V3.20 RC1.4 — Edit Mapel saat Waiting List Persetujuan Izin

## Latar belakang

Pada RC1.3 operator **Input Inval (Admin)** sudah dapat mengubah mata pelajaran yang diajarkan badal secara *dated* (tanggal + kelas + JP). Namun pemilih badal dari **Persetujuan Izin → Waiting List** masih mengunci mapel meskipun guru pengganti mungkin mengajar mata pelajaran normal, bukan mapel khusus seperti Tahsin Syaikh/Syaikhoh atau Native Arabic.

## Implementasi

1. Form `InputGuruPengganti` juga memperlihatkan **✎ Edit Mapel** ketika dibuka dari Waiting List yang disetujui (JP1–JP6), kecuali saat `readOnlyPreview`. Mode **Aturan Guru Badal** masih sengaja tidak memiliki editor ini.
2. Mapel asli ditampilkan; editor menerima teks bebas atau opsi `datalist`, maksimal 120 karakter. Pilihan guru pengganti dan rekomendasi tetap dikalkulasi berdasarkan mapel aktual saat operator mengedit.
3. Pengajuan izin, guru yang izin, tanggal, JP, kelas dan tugas milik guru izin tidak bisa diubah di form ini. Editing mapel tidak membuat permohonan izin baru.
4. Kelas gabungan dikembangkan menjadi record per kelas dengan ID `coverage_slots` yang telah ada; hasilnya divalidasi satu-ke-satu terhadap pembacaan Waiting terbaru.
5. RPC **`ejadwal_assign_waiting_badal_v320_rc14(jsonb,text)`** memproses seluruh kelas pada satu sesi dalam satu transaksi PostgreSQL. Ia mempertahankan pemeriksaan hard/soft constraint dan audit penggantian guru melalui RPC lama `ejadwal_replace_inval_substitute_v1`; lalu menulis mapel baru ke `coverage_slots.subject_snapshot` dan `schedule_incidentals.override_subject` hanya untuk slot bertanggal yang diubah.
6. Apabila jadwal efektif sudah berbeda dari mapel asal saat operator membaca Waiting List, transaksi gagal dengan `BADAL_SUBJECT_STALE_REFRESH_REQUIRED`, dan seluruh perubahan badal dibatalkan. Demikian pula, bila salah satu kelas gagal divalidasi, tidak ada partial assignment.
7. Override lain pada insidental yang sudah ada — ruangan, waktu, guru, catatan, status kelas gabungan — **tidak ditimpa**. `schedule_master` tidak berubah. Koreksi mapel tersimpan dalam `audit_logs`.
8. Kegagalan refresh UI setelah RPC berhasil tidak diklaim sebagai kegagalan penyimpanan. UI memberi instruksi refresh, bukan submit ulang.

## Batasan

- Hanya slot `LEAVE_WORKFLOW` yang masih **WAITING** dan pengajuan `APPROVED`, tanggal sekolah saat ini/masa depan, JP1–JP6 untuk perubahan mapel. JP0 tetap bisa diproses sebagai penugasan badal tanpa pengubahan mapel, mengikuti perilaku lama.
- Mode **Aturan Guru Badal** masih memerlukan jalur implementasi tersendiri.
- Fitur ini tidak mendukung edit mapel setelah coverage sudah menjadi `ASSIGNED` melalui daftar log; gunakan Quick Edit bertanggal sesuai kontrol admin.
- Jika kegiatan yang ada tidak sesuai `schedule_master`/insidental efektif, editor meminta refresh atau koreksi jadwal sebelum mencoba lagi; tidak akan mengasumsikan mapel baru.

## Instalasi dari V3.20 RC1.3

1. Backup database dan source aplikasi RC1.3. Pastikan migrasi sebelumnya `202610230002_v3_20_rc1_3_badal_subject_override.sql` telah berhasil.
2. Pada Supabase **staging**, jalankan `supabase/migrations/202610230003_v3_20_rc1_4_waiting_approved_subject_override.sql`.
3. Jalankan `v320_RC1_4_READONLY_VERIFIER.sql`, pastikan `rpc_exists = true` dan grant sesuai.
4. Salin patch RC1.4 ke root source RC1.3, overwrite file yang ada. Jangan overwrite `.env.local` atau `package-lock.json`.
5. Jalankan `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`, `npm.cmd run dev` di laptop.
6. Uji pengajuan izin **APPROVED** yang Waiting pada JP1–JP6. Buka **Persetujuan Izin → Waiting List → Tentukan Badal**. Ubah Tahsin Syaikh menjadi Tahsin/Al-Qur'an; pilih pengganti; simpan. Pastikan Log Izin & WA, Jadwal Kelas/Guru efektif, snapshot coverage dan audit menggunakan mapel baru sementara master dan tanggal lain tetap.
7. Uji skenario gabungan dengan 2 kelas. Kedua kelas harus tercatat bersama (atomik) atau sama-sama gagal jika salah satu slot ternyata berubah. Coba pula simpan Waiting dengan mapel tidak diedit untuk memastikan alur lama tetap berfungsi.

## Verifikasi yang dilakukan pada source lokal

- Semua 263 berkas `.ts/.tsx` dapat diparsing.
- Tes domain V3.20 + Waiting List: 25/25 PASS memakai runner transpiler TypeScript global (bukan full npm suite).
- Tes regresi izin, penugasan, MQ/JP, pengeditan badal: 40/40 PASS (runner yang sama).
- **Belum** memverifikasi PostgreSQL langsung, `npm run lint`, atau full Vite build karena dependency runtime frontend tidak tersedia di lingkungan pemeriksaan.

## Rollback

Rollback source ke RC1.3 menonaktifkan editor Waiting dan mengembalikan mekanisme assignment lama. Fungsi baru bisa dibiarkan tidak terpanggil atau dihapus dengan `drop function if exists public.ejadwal_assign_waiting_badal_v320_rc14(jsonb,text);`. **Override mapel yang sudah tersimpan tidak otomatis kembali** dan harus dikoreksi per tanggal+kelas+JP menggunakan audit.

**Keamanan:** Full Source PERSONAL menyertakan `.env.local`. Jangan dibagikan atau diunggah ke repositori publik.
