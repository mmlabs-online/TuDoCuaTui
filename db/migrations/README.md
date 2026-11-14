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
  whenever rows exist and checks that there is one owner equal to it.
- Ownership (D32): `user_id` is added nullable and backfilled in an expand migration (T-019.1), made NOT NULL with
  uniques and composite FKs in the contract migrations (T-019.2/.3), and RLS `ENABLE` + `FORCE` arrives in its own
  migration (T-019.4).
- `TUDO_OWNER_SUB` (a UUID, the owner's Identity `sub`) is passed by `server/migrate.js` as the transaction-local
  setting `tudo.owner_sub`. If rows exist and it is unset the migration fails and rolls back; on an empty database
  it is a no-op. A malformed value exits 2. The value is never printed.
- In `do $$ ... $$` blocks close with `end $$;`, never a bare `end;` (the runner rejects transaction-control
  statements); `end if;` is fine.
- Never store derived values (R5): `wear_count` and `last_worn` live in the view only.
