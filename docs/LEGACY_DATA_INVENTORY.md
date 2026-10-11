# V3.4 Legacy Data Inventory

This inventory is derived from the current V3.3 source (`Code.gs` + domain contracts). It describes what the existing app actually consumes today.

## 1. `Master Guru`

Canonical fields consumed by the app:

- `nama`
- `mapel_utama`
- `rumpun`
- `jenjang`
- `tugas_tambahan`
- `keterangan`

V3.3 domain also has optional presentation/derived fields such as `panggilan`, `wali_kelas`, `pendamping_kelas`, and `is_manajemen`, but they are not first-class columns in the current Apps Script mapping.

### V3.4 additions that must be explicit

- teacher gender (`IKHWAN`, `AKHWAT`, `UNKNOWN`)
- WhatsApp number in E.164 format
- optional short/display name

Do not infer gender from teacher names.

## 2. `Jadwal`

Canonical fields:

- `kelas`
- `hari`
- `jam_ke`
- `mulai`
- `selesai`
- `mapel`
- `guru1` … `guru6`
- `kelasgabung`
- `selainguru1_mengawas`
- `keterangan_khusus`
- `ruangan`

### Source finding

The current `Code.gs` alias mapping contains a legacy landmine:

- `"ruang"` is mapped to `kelas`
- `"ruangan"` / `"room"` are mapped to `ruangan`

V3.4 migration must use canonical spreadsheet headers directly and must not preserve this ambiguity.

## 3. `Jadwal_Insidental`

Canonical fields:

- `tanggal`
- `kelas`
- `jam_ke`
- `mapel`
- `guru1` … `guru6`
- `ruangan`
- `keterangan_khusus`
- `alasan`
- `tipe_insidental`

The V3.3 canonical engine defines the matching identity as:

`tanggal + kelas + jam_ke`

Mapel is not part of matching identity.

Blank override values inherit from the master row. This applies to all teacher positions and room/mapel/note fields.

The Apps Script alias mapping has the same `ruang -> kelas` ambiguity as `Jadwal`; do not carry it into PostgreSQL.

## 4. `Log_Izin`

Canonical fields:

- `tanggal`
- `jam_ke`
- `guru_izin`
- `kelas`
- `mapel`
- `guru_pengganti`
- `alasan`
- `tugas`

This is historical operational coverage data. It does not encode approval workflow state, so it must not be retroactively presented as approved leave requests.

## 5. `Master Ruangan`

Canonical fields:

- `id_ruangan`
- `nama_ruangan`
- `alias`
- `kapasitas`
- `lokasi`
- `jenis`
- `status`

Canonical room IDs such as `LABKOM`, `LABIPA`, `RSG`, etc. are worth preserving as stable IDs in PostgreSQL.

Aliases are currently a delimited text value. V3.4 stores them as `text[]`.

## 6. `Kalender_Akademik`

Canonical fields:

- `id`
- `tanggal_mulai`
- `tanggal_selesai`
- `nama_kegiatan`
- `tipe`
- `cakupan`
- `kelas`
- `jp_mulai`
- `jp_selesai`
- `status`

Rules already locked by V3.1/V3.3:

- date range is inclusive
- both JP fields blank = full-day event
- both filled = inclusive partial JP range
- JP 0 is valid
- class-scoped rows only affect matching classes
- blank `cakupan` + filled `kelas` is legacy-safe class-specific behavior
- blank `cakupan` + blank `kelas` must not silently become global
- duplicate legacy event IDs can exist across multiple classes

Therefore PostgreSQL uses a UUID row ID and stores the old ID as non-unique `legacy_event_code`.

## 7. `akun`

Canonical fields:

- `id`
- `password`
- `nama`

This sheet is a security migration boundary.

**Do not import `password`.**

Supabase Auth will own credentials. Existing IDs/names may only be used as an account/role migration checklist.

## 8. Class master does not currently exist as a dedicated sheet

V3.4 introduces a `classes` table. Initial class rows should be generated from the union of class names found in:

- `Jadwal`
- `Jadwal_Insidental`
- `Log_Izin`
- class-scoped `Kalender_Akademik`

Class gender can be derived from the established class naming rule, but the generated result should be reviewed before import.

## 9. Files

Existing `Log_Izin.tugas` can contain plain instruction text or URLs.

V3.4 does not migrate file bytes to Supabase. Future Drive uploads return metadata that is stored in `task_resources`:

- URL
- `drive_file_id`
- file name
- MIME type

Actual bytes remain in Google Drive.
