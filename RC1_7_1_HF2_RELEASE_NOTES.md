# E-JADWAL V3.20 RC1.7.1 HF2 — Pendamping Kelas di Rekomendasi Badal

Baseline: RC1.7.1 HF1. Fokus: informasi kelas pendamping pada dropdown Penempatan Inval. Tidak menambah menu, tidak mengubah SQL/RLS, dan tidak menyentuh jadwal master.

## Perubahan
1. Badge `PENDAMPING` sekarang menampilkan kelas dari **jadwal efektif di tanggal + JP yang dipilih**, misalnya `PENDAMPING • 01 INTER 3 I`.
2. Kandidat yang benar-benar mendampingi **kelas tujuan** pada JP tersebut diberi badge `★ PENDAMPING KELAS INI` dan bonus skor `+160`, serta alasan ranking eksplisit. Bonus hanya berlaku untuk slot JP1–JP6, bukan JP0.
3. Nama kelas juga muncul setelah guru dipilih dan dapat dicari dari kolom pencarian dropdown.
4. Jadwal insidental dan pembatalan kalender mengikuti data *effective schedule*. Kelas dari slot nonaktif tidak menghasilkan label pendamping aktif.
5. Pencocokan prioritas menggunakan identitas kelas penuh: `01 INTER 3 I` tidak disamakan dengan `01 INTER 3 A` atau kelas lain.
6. Kriteria keamanan lama tetap berlaku: approved leave, bentrok tugas wajib, restriksi, serta prioritas kecocokan gender. Bonus skor tidak mengubah status eligibility dan tidak menetapkan badal secara otomatis.

**Catatan terminologi:** `PENDAMPING` dalam picker berarti peran pendamping/mengawas pada slot pembelajaran itu, bukan semata-mata `pendamping_kelas` homeroom guru pada profil. Nama kelas diturunkan dari jadwal efektif.

## Berkas diubah
- `src/domain/inval/recommendationPerformance.ts`
- `src/components/InputGuruPengganti.tsx`
- `src/__tests__/v3-20-rc1-7-1-hf2-pendamping-class.test.ts` (baru)
- `package.json` (`test:320` ditambah tes regresi)

## Pengujian
- 278 file TS/TSX lulus pemeriksaan sintaks TypeScript (AST parser).
- 3/3 tes baru lulus dengan runner CommonJS-transpilation lokal (menguji JP, kelas, nonaktif, keanggotaan guru2).
- Build/lint lengkap belum diuji, karena dependency npm tidak tersedia di lingkungan pembuatan paket.
- Tidak ada perubahan Supabase atau migrasi SQL baru.

## Instalasi
Untuk source RC1.7.1 HF1, ekstrak PATCH HF2 ke root proyek dan timpa file terkait. Atau gunakan FULL SOURCE PERSONAL dari rilis ini (sudah mengandung `.env.local` yang sama dengan PERSONAL HF1). **Jangan bagikan PERSONAL**.

Di Windows:
```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run test:320
npm.cmd run build
```

## UAT yang perlu dicek oleh admin
1. Cari guru izin KHORIHAH pada tanggal & JP di mana UNZILA bertugas sebagai pendamping pada kelas `01 INTER 3 I`.
2. Buka dropdown Penempatan Inval. Periksa kelas di badge, indikator `★ PENDAMPING KELAS INI`, dan ranking kandidat yang tetap memperhitungkan gender/beban.
3. Pindah ke JP atau kelas yang berbeda; badge cocok kelas **tidak boleh muncul** kecuali benar-benar cocok pada slot tersebut.
4. Uji calon yang sedang izin/bertabrakan: status blokir tidak boleh berubah oleh badge.
5. Pilih UNZILA; keterangan pendamping harus tetap terlihat pada item yang dipilih.
