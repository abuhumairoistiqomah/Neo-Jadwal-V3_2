# Install RC1.5.1

Start from **V3.20 RC1.5**. Stop work on sorting until editable copy is validated.

1. Apply SQL: `supabase/migrations/202610230005_v3_20_rc1_5_1_editable_incidental_copy.sql` (staging first).
2. Verify: `supabase/verifiers/202610230005_v3_20_rc1_5_1_readonly.sql`.
3. Unzip patch over RC1.5 root. It includes no `.env.local` or lockfile.
4. `npm.cmd run lint`, `npm.cmd run test:320`, `npm.cmd run build`.
5. Try one source JP → one target class. Check teacher names and room in target, click Edit, change one teacher, and save. Then try multiple target classes.
6. For old RC1.5 copies, enable `Perbarui` and repeat if you want source teachers to replace old target teachers. Check that source rooms do not overwrite target rooms.

The migration only installs a new RPC, not data backfill. No database changes are applied until the admin invokes the new copy action.
