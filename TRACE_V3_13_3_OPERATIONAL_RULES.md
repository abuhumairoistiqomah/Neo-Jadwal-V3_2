# TRACE V3.13.3 — Operational Rules

## Scope

V3.13.3 turns two existing Supabase foundations into operator-facing tools and adds a pre-decision WhatsApp handoff:

1. **Aturan Guru Badal** — manage `substitute_constraints` from Admin UI.
2. **Kalender Akademik** — manage `academic_events` from Admin UI, including multi-class events and JP ranges.
3. **Hubungi Guru sebelum keputusan izin** — WhatsApp shortcut on each SUBMITTED leave request.

## Substitute constraints

The editor supports:

- DATE restrictions for one concrete school date.
- WEEKLY recurring restrictions.
- JP0–JP6 ranges.
- HARD BLOCK (`override_allowed=false`) — candidate cannot be selected and the server writer rejects the assignment.
- SOFT WARNING (`override_allowed=true`) — staff may deliberately override with the existing acknowledgement flow.
- Active/inactive toggle and audit history.

Typical outing-class setup: DATE + event date + JP0–JP6 + HARD BLOCK + reason `Panitia Outing Class`.

## Academic Calendar

The editor writes canonical `academic_events` and supports:

- date start/end;
- event type (`Libur`, `Kegiatan`, `Pulang Cepat`, `Ujian`, `Agenda Sekolah`);
- all classes or multiple selected classes;
- full day or JP0–JP6 range;
- active/inactive lifecycle;
- edit-as-revision so old rows remain INACTIVE for audit.

A new `admin_group_code` groups the per-class rows of one multi-class event. Existing imported legacy events remain readable.

Academic calendar write policy is now staff-operational (`WAKASEK` or `ADMIN`) while authenticated read access remains unchanged.

## Pre-decision WhatsApp

Every SUBMITTED request now has `Hubungi Guru`. It opens `wa.me` using the teacher master WhatsApp number and a gender-aware friendly template before staff approves or declines the request.

## Migration

Run in order after V3.13.2:

- `202610100034_v3_13_3_operational_rules.sql`
- `202610100035_v3_13_3_verify_operational_rules.sql`

Expected verifier: **9/9 true**.

## No Apps Script change

`Code.gs` is unchanged. No GAS redeploy or OAuth reset is needed for V3.13.3.
