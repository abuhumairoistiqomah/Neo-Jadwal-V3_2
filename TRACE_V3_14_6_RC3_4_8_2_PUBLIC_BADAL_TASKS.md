# V3.14.6 RC3.4.8.2 — Public substitute-task visibility

**Problem:** Supabase guest RPC v1 returned `learningTasks: []` and `taskResources: []`. Dashboard therefore displayed "Tugas belum dikirim" despite tasks being stored in Supabase.

**Change:** Add **read-only RPC v2**, with instructional descriptions and Google Drive/resource URLs joined only to active, non-deleted coverage slots dated today or later in `Asia/Jakarta`. Reuse original sanitized v1 schedule/teacher projection; private reasons, teacher phone, raw notes, and unrelated tasks remain hidden. Guest and Admin continue reading Supabase. No Apps Script fallback.

**Security trade-off:** Admin OFF is currently accessible without login, so these substitute-task descriptions/links are readable by any visitor who can reach the site. Do not put passwords, confidential student data, or private files in instructional task text. Google Drive's own file access control still applies. Restrict to authenticated staff in a future enhancement if needed.

**Migration:** `supabase/migrations/202610120004_v3_14_6_public_badal_tasks.sql` after `202610120003`; existing v1 stays intact. Apply to staging first.

**Checks:** compare the same upcoming assigned JP on Admin ON/OFF. Both should show **Lihat Kegiatan Siswa / Tugas**, identical text and Drive link. Other JPs with genuinely empty tasks must still show "Minta Tugas". A canceled coverage and a deleted task must not surface resources. Test on localhost and on an incognito/phone browser.

**Release gate:** `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, plus SQL smoke in Supabase staging. Neither live migration nor npm dependency installation is verified by package preparation.
