# E-JADWAL V3.20 RC1.5.2 — Faithful Copy Details

- Copy **subject, teachers (default enabled), visible reason, incidental type, effective special note, combined/alternating class mode, and optional source time** to date-specific incidental rows.
- Preserve target class identity, room, existing active coverage protections and master schedule. Teachers remain individually editable per resulting incidental row.
- Store copy provenance in `copied_from_incidental_id` instead of leaking `COPY_INCIDENTAL_RC15*` or `Salin jadwal insidental dari…` to Dashboard descriptions.
- Keep the admin's “Lihat hasil salin” working by using provenance rather than visible incidental type.
- Normalize only untouched legacy copy labels with audit-confirmed provenance, including their combined-class metadata. No guesswork for untraceable copies; no teacher-team overwrites during migration.
- Requires PostgreSQL migration `202610230006_v3_20_rc1_5_2_faithful_incidental_copy.sql` before deploying frontend. Staging candidate until database and full project checks pass.
- Sorting requested earlier remains aborted.
