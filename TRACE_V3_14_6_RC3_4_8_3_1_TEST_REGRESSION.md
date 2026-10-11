# TRACE — V3.14.6 RC3.4.8.3.1

Base: V3.14.6 RC3.4.8.3 dated public WhatsApp contacts.

## Bug

The existing `teacher-owned-task-admin-runtime.test.ts` expected the literal one-liner `!isAdmin) void refreshPublicSupabase()`. In RC3.4.8.3, guest refresh is correctly done in a scoped `if (!isAdmin) { ... }` effect with both (a) redaction of prior-date WhatsApp fields and (b) `void refreshPublicSupabase()`, depending on `[isAdmin, schoolToday]`. The old regex falsely fails.

## Change

- The assertion now checks the guest refresh effect including the Jakarta date rollover dependency and contact redaction.
- The existing Supabase-only and no-Apps-Script assertions remain.
- Updated package name and version to RC3.4.8.3.1.
- **No runtime changes and no new SQL.** Do not redeploy migration for this test-only fix.

## Verification

- `teacher-owned-task-admin-runtime.test.ts`: **5/5 PASS** using Node's type stripping + a local extension-resolution loader.
- `v3-14-6-rc3-4-8-3-dated-public-wa.test.ts`: **4/4 PASS**.
- Broader offline test run: **338 passing tests**; **2 modules could not load** with the alternative runner (TSX handling and missing Supabase dependency), not assertion failures.
- Full `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build` still need to pass on Windows with installed dependencies.
- Validate Admin ON/OFF and WhatsApp contact expiry at Jakarta day rollover in staging before deploying RC3.4.8.3.

## Upgrade

Apply the patch into RC3.4.8.3 root, or use the full source ZIP in a fresh folder. There are no database, GAS, or environment variable modifications.
