# TRACE V3.12.5.1 — Active Task Queue + Direct WA to Badal

## Why this patch exists

Live use showed that the late-task queue remained noisy with old dates (for example July, September and yesterday), and teachers needed a manual fallback when they could not recover the upload token.

## Behavior

### 1. Automatic task-queue expiry

`Lengkapi Tugas` now uses the school date in `Asia/Jakarta`. A missing-task item is actionable only when `schedule_date >= school_today`.

Example when school date is `2026-10-09`:

- `2026-10-08` and earlier → hidden from `Lengkapi Tugas` and excluded from the sidebar badge;
- `2026-10-09` → active;
- future dates → active.

The app checks the Jakarta date every minute so a browser left open across midnight updates without requiring a manual reload. Historical coverage/task rows are **not deleted from Supabase**; they remain available for audit and statistics.

### 2. Manual WhatsApp fallback to the substitute

Every active missing-task card includes `Hubungi Guru Badal`. The app looks up the substitute in `teachers.whatsapp_e164`, strips non-digits for `wa.me`, and prepares a message containing date, JP, subject and combined class.

This shortcut works before task-access recovery, so an absent teacher who lost the request code can still contact the assigned substitute directly.

## Infrastructure

- No SQL migration.
- No `Code.gs` change.
- No GAS redeploy.
- Supabase remains the source of truth; this is an actionable-queue/UI change only.

## Regression gate

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Smoke test with school date 9 October: verify 8 October and older disappear, 9 October remains, future rows remain, and `Hubungi Guru Badal` opens the correct `wa.me/62...` destination with a pre-filled message.
