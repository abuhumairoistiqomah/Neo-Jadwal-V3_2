# TRACE V3.13.0 — Admin Master Data CRUD

## Scope

V3.13.0 starts the post-leave-workflow admin modernization phase.

### Added
- Supabase-native Master Data page for ADMIN role.
- CRUD-style create/edit/activate/deactivate flows for:
  - Teachers
  - Classes
  - Rooms
- Master-data changes remain relational: teacher/class UUIDs are preserved on edit.
- Rooms keep immutable IDs after creation because schedule rows may reference them.
- Automatic `audit_logs` entries for INSERT/UPDATE/DELETE on the three master tables.
- WhatsApp copy cleanup folded into the release:
  - `Ustadz` for IKHWAN
  - `Ustadzah` for AKHWAT
  - polite opening `Assalamu'alaikum warahmatullahi wabarakatuh`
  - friendlier `Afwan, ana ingin ...` tone
- Indonesian WhatsApp input accepts `08...`, `62...`, or `+62...` and stores canonical `+62...` in Supabase.

### Deliberately not included yet
- Schedule Master CRUD/editor
- Substitute constraint editor
- User/Auth account administration

Those move to V3.13.1+ to keep blast radius manageable.

## Data safety
- No hard delete button is exposed for teachers/classes/rooms.
- Deactivation is used instead, preserving historical foreign-key references and auditability.
- Existing V3.5 RLS remains the authority: only `ADMIN` may write master tables.
- `WAKASEK` may still operate leave/coverage workflows but Master Data renders read denial.

## Migrations
Run after V3.12.5 migrations through `027`:

1. `202610090028_v3_13_admin_master_data.sql`
2. `202610090029_v3_13_verify_admin_master_data.sql`

Verifier target: 8/8 `true`.

## Primary smoke tests
1. Login with ADMIN role and open `Master Data`.
2. Add a test teacher with `0812...` WhatsApp; verify Supabase stores `+62812...`.
3. Edit the teacher name; refresh and ensure current schedule consumers resolve the new teacher name.
4. Deactivate then reactivate the teacher.
5. Add/edit/deactivate/reactivate one class.
6. Add/edit/deactivate/reactivate one room; verify room ID cannot be edited after creation.
7. Inspect `audit_logs` for `MASTER_INSERT` / `MASTER_UPDATE` events.
8. Verify a WAKASEK session cannot modify master data.
9. Trigger a WhatsApp task/reminder flow and verify the friendlier gender-aware salutation.
