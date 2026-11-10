# Database migrations

Plain SQL applied by `node server/migrate.js` (the `migrate` one-shot service, D24).

- File name: `YYYYMMDDHHMMSS_snake_case.sql`. Any other `.sql` name is a configuration error.
- Forward-only. Never edit an applied migration (its checksum is recorded); add a new file.
- Each file runs in its own transaction. Do not write `begin`/`commit`, `create index concurrently`,
  `create extension`, `grant` or `create role`.
- Expand then contract: every prefix of the sequence must work with the previous app image, so a
  rollback to an older image stays safe. Add columns/tables first, remove them in a later release.
- No RLS while the app is single-user without login (D25). When auth or a second user arrives, add
  `user_id` and `ENABLE` + `FORCE ROW LEVEL SECURITY` in the same migration.
- Never store derived values (R5): `wear_count` and `last_worn` live in the view only.
