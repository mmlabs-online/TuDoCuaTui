# Consult — database-optimizer (T-018)

## Findings

**Migration conventions (db/migrations/README.md, existing files)**
- File name must match `YYYYMMDDHHMMSS_snake_case.sql` (parseMigrationFilename; any other .sql fails). Use a timestamp later than 20261112140000, e.g. `20261112160000_ai_settings.sql`. The ticket's `<ts>_ai_settings.sql` fits.
- Existing files carry a header comment with the ticket, the decision (D25 "no RLS, no user_id") and a "Manual rollback (never run automatically)" block. Follow that. The Supabase file's rollback block is the same idea.
- Tables are unprefixed (`items`, `locations`, `item_photos`, `wear_logs`), not `tudo_*`. The updated_at trigger function is `set_updated_at()` (not `tudo_set_updated_at`), and triggers are named `<table>_updated_at`. Index names follow `<table>_<col>_idx`, and check constraints are `<table>_<what>_chk`. Types: `uuid`/`text` with `check` constraints, `timestamptz not null default now()`.
- Forbidden in migrations, and enforced by the test in `server/migrator.test.ts` ("real db/migrations files"): `begin/commit/rollback/end/abort`, `start transaction`, `concurrently`, `create extension`, `grant`, `create role`. The scan strips only lines that START with `--`. Do not put these words in SQL string literals or in trailing comments on code lines. Beware the `end` regex: `\bend\b` followed by `;`, end of line, `work`, `transaction` or `and` is rejected, so a `case ... end` at end of line would trip it. Avoid it (no need for it here).
- Each file runs in its own transaction, forward-only, with checksums. Expand-only: a new table is safe for the previous image.

**Roles and grants**
- The `grant` ban means no grant statements at all. There is one `DATABASE_URL`, and CI uses a single superuser for both the migrate step and the tests. The migrate role owns the tables and the app evidently connects with the same credentials, since no existing migration grants anything. So the new table needs no grants, and none are allowed. If Ming later splits app and migrate roles, that is a separate ticket (use `alter default privileges` outside the migrations).

**Test pattern**
- `server/migrator.test.ts` (pure, no DB) already scans all real migrations for the forbidden statements and the filename format. The new file is covered automatically.
- `server/migrator.db.test.ts` (real Postgres via `server/test/pg.ts`, `createTestDb`, `describe.skipIf(!dbAvailable)`, needs `TEST_DATABASE_URL`, mandatory in CI) applies all of `db/migrations` to a fresh DB. It also runs the "NOSUPERUSER database owner" case against the real dir, so the new migration must not need superuser (it doesn't).
- Gap: nothing asserts table shape. Add one DB test in this pattern, e.g. `server/ai/settings.db.test.ts` or a case in `migrator.db.test.ts`:
  - apply the real migrations, insert the singleton, a second insert must fail;
  - the check constraints reject a bad provider and a ciphertext without a hint;
  - the updated_at trigger fires.
  Use `createTestDb`. The "applies all migrations" test only checks `lines[0]`, so it is unaffected.

**Single-row table design (recommended)**
```sql
create table ai_settings (
  id             boolean primary key default true check (id),   -- one row enforced
  provider       text not null check (provider in ('claude','gemini')),
  model          text not null check (model ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  key_ciphertext text check (key_ciphertext is null or key_ciphertext ~ '^v[0-9]+:[A-Za-z0-9+/=]+$'),
  key_hint       text check (key_hint is null or key_hint ~ '^[!-~]{4}$'),
  key_updated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ai_settings_key_pair_chk check ((key_ciphertext is null) = (key_hint is null))
);
create trigger ai_settings_updated_at before update on ai_settings
  for each row execute function set_updated_at();
```
- `id boolean primary key default true check (id)` is the standard singleton idiom. The PK gives uniqueness and the check pins the value, so `insert ... on conflict (id) do update` is the natural upsert.
- Keep ONE text column `key_ciphertext` in the existing `v1:<base64(iv|ct|tag)>` format ported from `supabase/functions/_shared/crypto`. This is simpler than separate ciphertext/iv/tag columns or a bytea. The version prefix leaves room for KEK rotation later (out of scope). It also keeps the shared `crypto` port unchanged. The only reason to prefer bytea is a size or typing preference. It buys nothing here.
- Keep the key/hint pair check, so a key never exists without its mask hint.
- Check that the hint regex (4 printable ASCII chars) matches what `src/shared/ai/mask.ts` actually produces, and that the model regex matches `validate.ts` and the catalog. Keep the DB check looser than the app validation so catalog changes need no migration.
- The singleton row only exists after the first PUT. GET must handle "no row" with a defined default (e.g. provider/model from the catalog, hint null). Do not seed a row in the migration, because provider/model are NOT NULL and defaults belong in app code.
- Do not use `FORCE RLS` or any policy (D25).

## Recommendations (tied to ticket criteria)
1. Single table, no `user_id`, no RLS, no grants, file name and header as above (scope bullet 1, D25).
2. Do NOT carry over: `user_id uuid references auth.users`, `enable row level security`, `revoke ... from anon, authenticated`, `grant ... to service_role`, the `tudo_` prefix, `tudo_set_updated_at`, and the TUDO_AI_KEK name (use `TUDOCUATUI_AI_KEK`).
3. Drop `tudo_ai_calls`. It was per-user rate limiting keyed by user_id. For one user behind Cloudflare Access, prefer an in-memory throttle on `POST /ai-settings/test` (e.g. 1 call per few seconds) instead of a table. This is an expand-only decision, so it can be added later with a new migration if needed. State it in the plan.
4. Add a DB-level test for the singleton and check constraints (acceptance: "checks green, including the migration runner test"), plus a sentinel test that the stored column holds ciphertext, not the key.
5. Store ciphertext with the key-sentinel test at the repo layer: assert `select key_ciphertext` never contains the sentinel and decrypts to it with the test KEK.
6. Rollback block: `drop table ai_settings;` (manual, destroys the saved key). Add a note that the shared `set_updated_at()` is kept.

## Risks
- Words `grant` or `end` in a comment on a code line, or in a string literal, fail the pure test. Put prose comments on their own `--` lines.
- A name collision risk is low, but if T-016 or other branches add migrations, timestamps must stay ordered. An out-of-order pending file fails the runner. Pick a timestamp after the newest on `main` at rebase time.
- Losing the KEK makes the key unreadable. The decryption failure must map to a distinct error (e.g. "key unreadable, re-enter"), not a 500.
- The DB test skips locally without `TEST_DATABASE_URL`, but CI enforces it. Run it locally before PASS if a Postgres is available.

## Open questions
1. Include a rate-limit table? Proposed default: no, in-memory throttle.
2. Table name `ai_settings` (default) vs keeping `tudo_ai_settings`. Default: `ai_settings`, matching unprefixed existing tables.
3. Should `key_updated_at` stay? It is cheap and useful in the masked GET ("key saved on ..."). Default: keep.

Relevant files: D:\mmlabs\spaceM\projects\tudocuatui\db\migrations\README.md, db\migrations\20261110120000_init.sql, server\migrator.test.ts, server\migrator.db.test.ts, server\test\pg.ts, supabase\migrations\20261110000000_tudo_ai_settings.sql.
