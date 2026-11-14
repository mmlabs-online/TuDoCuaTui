# Database migrations

Plain SQL applied by `node server/migrate.js` (the `migrate` one-shot service, D24).

- File name: `YYYYMMDDHHMMSS_snake_case.sql`. Any other `.sql` name is a configuration error.
- Forward-only. Never edit an applied migration (its checksum is recorded); add a new file.
- Each file runs in its own transaction. Do not write `begin`/`commit`, `create index concurrently`,
  `create extension`, `grant` or `create role`.
- Expand then contract: every prefix of the sequence must work with the previous app image, so a
  rollback to an older image stays safe. Add columns/tables first, remove them in a later release.
- Exception: `20261114120000_user_ownership_contract` (T-019.2) is not image-rollback-safe (an older image cannot
  write after it). Rollback = fix forward or restore the pre-release backup (M-18). It requires `TUDO_OWNER_SUB`
  whenever rows exist and checks that there is one owner equal to it. `20261114180000_ai_settings_per_user`
  (T-019.3) is not image-rollback-safe either (old AI code uses `where id`) and clears the stored AI key.
  `20261114200000_row_level_security` (T-019.4) needs the `withUser` image: an older image on that schema reads no rows.
- Ownership (D32): `user_id` is added nullable and backfilled in an expand migration (T-019.1), made NOT NULL with
  uniques and composite FKs in the contract migrations (T-019.2/.3), and RLS `ENABLE` + `FORCE` arrives in its own
  migration (T-019.4).
- RLS rules (T-019.4): a migration that reads or writes rows of the five tables wraps the work in
  `alter table <t> no force row level security;` ... `alter table <t> force row level security;` in the same file.
  Without that the owner sees 0 rows and the update silently changes nothing. The runner fails a file that leaves a
  table unforced. A new table gets `enable` + `force row level security` and an `owner_only` policy in the same
  migration (a catalog test enforces it). `create or replace view items_with_stats` must say
  `with (security_invoker = true)`; the runner checks that too.
- `TUDO_OWNER_SUB` (a UUID, the owner's Identity `sub`) is passed by `server/migrate.js` as the transaction-local
  setting `tudo.owner_sub`. If rows exist and it is unset the migration fails and rolls back; on an empty database
  it is a no-op. A malformed value exits 2. The value is never printed.
- In `do $$ ... $$` blocks close with `end $$;`, never a bare `end;` (the runner rejects transaction-control
  statements); `end if;` is fine.
- Never store derived values (R5): `wear_count` and `last_worn` live in the view only.
