Status: READY

# Plan — T-012: Postgres schema and migration runner for the self-hosted database

Gate: **plan-approval** (High tier: DB migrations). The implementer starts only after Ming writes "Plan approved" in ticket.md. Assumptions A1–A10 below are the choices Ming should confirm or override.

## Feature summary
This ticket is not in `docs/feature-list.md` (T-ticket). It implements decisions D23–D25 in `work/decisions.md`:

- **D23:** "TuDo moves its data from Supabase (D17) to the shared Postgres in `mmlabs-online/deployment` (`postgres/`, database + role `tudocuatui`, network `db`), accessed only by a Node API in the same image as the SPA … **No in-app authentication for now** (single user)."
- **D24:** "One owner role for both the app and `migrate` for now … `DATABASE_URL` is plain `postgres://tudocuatui:<pw>@postgres:5432/tudocuatui`, no SSL … Migrate command contract: `node server/migrate.js`." D24 also says the deploy workflow runs `migrate` only if the live `compose.yml` defines a `migrate` service, so merging T-012 changes nothing in production.
- **D25:** "schema changes are a new SQL file in the TuDo migrations folder, applied only by the `migrate` one-shot service; never edit an applied migration … While the app is single-user without login (D23), tables do not use RLS; when in-app auth or a second user arrives, every table gets a `user_id` and RLS (`ENABLE` + `FORCE ROW LEVEL SECURITY`) in the same migration that adds them."

From the ticket's Scope:
- "tables from the Supabase schema without `auth.uid()`, RLS policies or `user_id` … keep the `items_with_stats` view semantics (R5) and the existing constraints/enums"
- "A small, dependency-light migration runner (applied-migrations table, transactional, idempotent)"
- "Tests against a real Postgres in CI (service container)"
- "Supabase migrations stay untouched for now (removed in T-016)"

From the ticket's Notes (from T-011): the runner "must be `node server/migrate.js` (D24), exit non-zero on failure, never log `DATABASE_URL` or connection options".

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Fresh DB → all migrations apply; re-run is a no-op. | `server/migrator.db.test.ts` › "applies all migrations to a fresh database" and › "second run is a no-op (same rows, same applied_at)". The CI step "migrate CLI smoke" runs `node server/migrate.js` twice. The first run logs `applied 20261110120000_init`, the second logs `up to date`, and both exit 0. |
| 1a | Runner is transactional, rejects drift, serialises concurrent runs. | `migrator.db.test.ts` › "failing file rolls back fully and stops", › "checksum mismatch fails and applies nothing", › "missing applied file older than newest local file fails", › "out-of-order pending file fails", › "DB ahead of image warns and exits 0", › "two concurrent runs both succeed, each file applied once", › "lock held elsewhere times out with exit code 1". |
| 1b | CLI contract (D24 / T-011 notes): `node server/migrate.js`, non-zero on failure, never prints `DATABASE_URL` or connection options. | `server/migrate.cli.test.ts`: exit code 2 with `DATABASE_URL` unset (runs without Postgres); exit code 1 with a wrong password and with an unreachable host. In each case the captured stdout and stderr contain neither the URL nor the password. The reviewer also reads `server/migrate.js` and `server/migrator.js`: no `console.*(err)`, no logging of the config or env, and connection errors are printed as a fixed message plus `err.code`. |
| 2 | The schema supports everything `WardrobeRepo` needs: items, locations, wear +1/−1 with one per day, and the stats view. | `server/schema.db.test.ts` (list under Tests). It runs the exact SQL patterns T-013 will use: location get-or-create, item upsert by client uuid, wear +1 twice gives `already`, wear −1 deletes the latest day, `items_with_stats` values, cascades, constraints, and the JS shapes returned through `pg`. |
| 2a | D25: no RLS, `user_id` or `auth.*`. R5: nothing derived is stored. | `schema.db.test.ts` › "no table has RLS or a user_id column" (queries `pg_class.relrowsecurity` and `information_schema.columns`). The reviewer reads `db/migrations/20261110120000_init.sql`: `wear_count` and `last_worn` exist only in the view. |
| 2b | Migrations run as the production-like owner role (NOSUPERUSER, owns its DB, no extensions). | `migrator.db.test.ts` › "applies as a NOSUPERUSER database owner". |
| 3 | CI runs the migration tests against Postgres 17 and does not silently skip them (R8). | `.github/workflows/ci.yml` has a `services.postgres` with `image: postgres:17` on the `ci` job, and `TEST_DATABASE_URL` is set on the `pnpm test:coverage` step. `server/test/pg.ts` throws when `CI` is set and `TEST_DATABASE_URL` is missing. The CI log shows the DB test files as run, not skipped. |
| — | Checks green (R8). | `pnpm typecheck` (now includes `tsconfig.server.json`), `pnpm format:check`, `pnpm test`, `pnpm build` all pass, and the CI `ci` job is green. |
| — | R1/R10/R7: no behaviour change in the app. | `git diff --stat main` touches no `src/**`, `vite.config.ts`, `Dockerfile`, `docker/**`, `scripts/check-image.sh`, `.github/workflows/release*.yml`, or `supabase/**`. No file under `src/` imports `pg`. |

## Ming verification after merge
None required. Production is unchanged until T-015 adds the `migrate` service to compose (D24).

Optional local run: `docker run --rm -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:17`, then `TEST_DATABASE_URL=postgres://postgres:test@localhost:5432/postgres pnpm test`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261110120000_init.sql` | create | Schema: enums, `set_updated_at` trigger function, tables `locations`, `items`, `item_photos`, `wear_logs`, and view `items_with_stats` (AC2, D25, R5). |
| `db/migrations/README.md` | create | Naming, forward-only, expand-then-contract and in-transaction rules (D24/D25). |
| `server/migrator.js` | create | Runner logic plus pure helpers (`parseMigrationFilename`, `checksum`, `planMigrations`, `runMigrations`). Plain ESM JS with `// @ts-check` (AC1). |
| `server/migrate.js` | create | The literal D24 entry point. Reads `DATABASE_URL`, calls `runMigrations`, and maps errors to exit codes without printing secrets. |
| `server/test/pg.ts` | create | Test helper: reads `TEST_DATABASE_URL`, throws in CI if it is missing, and creates and drops throwaway databases and roles. |
| `server/test/fixtures/**` | create | Small fixture migration dirs: `ok/`, `bad/`, `tamper/` (built at runtime by copying), `out-of-order/`. |
| `server/migrator.test.ts` | create | Pure-helper unit tests with no DB. |
| `server/migrator.db.test.ts` | create | Runner tests against real Postgres. |
| `server/schema.db.test.ts` | create | Schema and repo-contract tests against real Postgres. |
| `server/migrate.cli.test.ts` | create | CLI exit codes and no-secret-output tests via `child_process`. |
| `tsconfig.server.json` | create | Typechecks `server/**` (JS via `checkJs`, plus the TS tests) with Node types, no DOM. |
| `package.json` | modify | Add `pg` to dependencies and `@types/pg` to devDependencies. `typecheck` becomes `tsc --noEmit && tsc -p tsconfig.server.json`. |
| `pnpm-lock.yaml` | modify | Lockfile for `pg` and `@types/pg`. |
| `vitest.config.ts` | modify | Add `server/**/*.js` to `coverage.include`, report only, no threshold (see A8). This is not a Figma Make file, so R10 does not apply. |
| `.github/workflows/ci.yml` | modify | `ci` job: `services.postgres` (`postgres:17`, health check), `TEST_DATABASE_URL` env on the test step, and a "migrate CLI smoke" step. |

Not touched (R7/R10): `src/**`, `vite.config.ts`, `Dockerfile`, `.dockerignore`, `docker/**`, `scripts/**`, release workflows, `supabase/**`, `docs/**`, `CLAUDE.md`, `.gitattributes` (it already has `* text=auto eol=lf`, so the checksums are stable).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/migrator.test.ts` › "parses `YYYYMMDDHHMMSS_snake.sql`, rejects other names" | Filename validation (exit 2 path) |
| `server/migrator.test.ts` › "checksum is sha256 hex and ignores CRLF vs LF" | Checksum |
| `server/migrator.test.ts` › "planMigrations: pending in lexical order" | Ordering |
| `server/migrator.test.ts` › "planMigrations: applied file missing (≤ newest local) → drift error" | Drift |
| `server/migrator.test.ts` › "planMigrations: checksum differs → drift error" | Drift |
| `server/migrator.test.ts` › "planMigrations: unapplied file older than newest applied → out-of-order error" | Drift |
| `server/migrator.test.ts` › "planMigrations: applied versions newer than newest local → `ahead` list, nothing pending" | Rollback to an older image |
| `server/migrator.test.ts` › "real `db/migrations` files: well-formed names; no `begin;`/`commit;`/`rollback;`/`start transaction`/`concurrently`; no `create extension`/`grant`/`create role`" | Migration lint |
| `server/migrator.db.test.ts` › "applies all migrations to a fresh database" | AC1 |
| `server/migrator.db.test.ts` › "second run is a no-op (same rows, same applied_at)" | AC1 idempotent |
| `server/migrator.db.test.ts` › "failing file rolls back fully and stops" | Fixture `bad/`: file 2 creates a table then errors. Its table and tracking row are absent, file 3 is not applied, file 1 stays applied. |
| `server/migrator.db.test.ts` › "checksum mismatch fails and applies nothing" | Drift at runtime |
| `server/migrator.db.test.ts` › "missing applied file older than newest local file fails" | Drift at runtime |
| `server/migrator.db.test.ts` › "out-of-order pending file fails" | Drift at runtime |
| `server/migrator.db.test.ts` › "DB ahead of image warns and exits 0" | A5 rollback behaviour |
| `server/migrator.db.test.ts` › "two concurrent runs both succeed, each file applied once" | Advisory lock |
| `server/migrator.db.test.ts` › "lock held elsewhere times out with exit code 1" | Lock timeout (`lockWaitMs` small) |
| `server/migrator.db.test.ts` › "applies as a NOSUPERUSER database owner" | D24 owner role, no extensions needed |
| `server/schema.db.test.ts` › "location get-or-create by name is race-free" | `insert … on conflict (name) do update set name = excluded.name returning id`, run concurrently, gives one row |
| `server/schema.db.test.ts` › "item insert with client uuid and with server default" | Item save |
| `server/schema.db.test.ts` › "wear +1 twice same day → second returns no row; view shows 1" | One wear per day |
| `server/schema.db.test.ts` › "wear −1 deletes only the latest day; after last row wear_count 0, last_worn null" | Wear −1 |
| `server/schema.db.test.ts` › "items_with_stats column list and order" | Explicit view columns |
| `server/schema.db.test.ts` › "pg JS shapes: seasons string[], wear_count number, price string; last_worn 'YYYY-MM-DD' with a per-client 1082 parser" | Contract for T-013 |
| `server/schema.db.test.ts` › "primary photo pick: is_primary first, else oldest" | View `primary_photo_path` |
| `server/schema.db.test.ts` › "deleting an item cascades photos and wear logs" | FK |
| `server/schema.db.test.ts` › "deleting a location nulls items.location_id and child parent_id" | FK |
| `server/schema.db.test.ts` › "constraints reject: price < 0, empty/too-long name, bad category/status, bad season, parent_id = id, second primary photo, duplicate location name, null worn_on" | Constraints |
| `server/schema.db.test.ts` › "update bumps updated_at" | Trigger |
| `server/schema.db.test.ts` › "no table has RLS or a user_id column" | D25 |
| `server/migrate.cli.test.ts` › "exit 2 when DATABASE_URL is unset" | CLI (no DB needed, never skipped) |
| `server/migrate.cli.test.ts` › "exit 1 on wrong password; output has no URL/password" | No secret logging |
| `server/migrate.cli.test.ts` › "exit 1 on unreachable host; output has no URL/password" | No secret logging (port 1 on 127.0.0.1, no DB needed) |
| `server/migrate.cli.test.ts` › "exit 0 twice on a fresh DB; second says up to date" | AC1 through the real entry point |

Every DB test file starts with `// @vitest-environment node` and uses `describe.skipIf(!dbAvailable)`. The `server/test/pg.ts` helper throws at import when `process.env.CI` is set and `TEST_DATABASE_URL` is not, so CI fails instead of skipping (R8). Each file creates `tudo_test_<random>` through an admin connection and drops it in `afterAll` (`drop database … with (force)`). Roles created for the owner-role test are dropped too.

## Approach
1. **Dependencies.** Run `pnpm add pg` and `pnpm add -D @types/pg` (A1). No other new packages.
2. **Schema, `db/migrations/20261110120000_init.sql`.** Port `supabase/migrations/20261106000000_init.sql` without the `tudo_` prefix (A2), and without `user_id`, `auth.*`, RLS, grants, `pgcrypto`, `security_invoker` and `storage.*`. Changes from the Supabase file:
   - `locations`: `unique (name)`; `check (parent_id <> id)`; index `locations_parent_idx(parent_id)`, so every FK has an index.
   - `items`: same columns and checks as before. `category` and `status` stay enums (`item_category`, `item_status`). `seasons` becomes `text[] not null default '{}' check (seasons <@ array['spring','summer','autumn','winter']::text[])` (A3). Indexes: `items_location_idx`, plus the GIN indexes on `colors` and `tags`, kept to match `docs/data-model.md`. Trigger `items_updated_at` uses `set_updated_at()` (`set search_path = ''`).
   - `item_photos`: `storage_path text not null unique` (A6), `is_primary`, `width` and `height` with `> 0` checks, `item_photos_item_idx`, and the `item_photos_one_primary` partial unique index.
   - `wear_logs`: `worn_on date not null` with **no default** (A4), and `unique (item_id, worn_on)`. The separate `(item_id, worn_on desc)` index is **not** recreated.
   - View `items_with_stats` has an explicit column list: `id, name, category, status, brand, size, material, price, purchase_date, location_id, colors, seasons, tags, notes, created_at, updated_at, wear_count, last_worn, location_name, primary_photo_path`.
     - `wear_count` and `last_worn` come from `left join lateral (select count(*)::int, max(worn_on) from wear_logs where item_id = i.id)`, with `coalesce(…, 0)` on the count.
     - `primary_photo_path` comes from the existing lateral pick.
   - Header comment: no RLS per D25; a second user means `user_id` plus `ENABLE` and `FORCE ROW LEVEL SECURITY` in the same migration. The commented manual rollback is a list of `drop` statements.
3. **Runner, `server/migrator.js`.** ESM, `// @ts-check`, JSDoc types. Imports only `pg`, `node:fs/promises`, `node:path`, `node:crypto` and `node:url`.
   - **Filenames.** `parseMigrationFilename`: `^(\d{14})_([a-z0-9_]+)\.sql$`. Any other `.sql` file in the dir is a config error (exit 2). Non-`.sql` files such as `README.md` are ignored.
   - **Checksum.** `checksum(buf)`: sha256 hex of the content with CRLF converted to LF.
   - **Planning.** `planMigrations(local, applied)` returns `{ pending, ahead }` or throws a `MigrationError` (exit 1) for:
     - a checksum mismatch;
     - an applied version that is missing locally and is ≤ the newest local version;
     - a pending version that is < the newest applied version that exists locally.
     - Applied versions newer than the newest local version go to `ahead` (A5).
   - **`runMigrations({ connectionString, dir, log, lockWaitMs = 30000 })`** steps:
     1. Create a `new pg.Client({ connectionString, connectionTimeoutMillis: 5000, application_name: 'tudocuatui-migrate' })` with no `ssl` option (D24), then connect. Wrap construction and connect in try/catch and rethrow `MigrationError('cannot connect to the database (DATABASE_URL not printed)', 1, err.code)`.
     2. Take a **session** advisory lock: poll `select pg_try_advisory_lock(<fixed bigint>)` every 500 ms until `lockWaitMs`, then fail with "another migration is running" (exit 1).
     3. `create table if not exists schema_migrations (version text primary key, name text not null, checksum text not null, applied_at timestamptz not null default now())`.
     4. Read the applied rows and the files, then plan. If `ahead` is non-empty, log a warning listing those versions, apply nothing more, and return.
     5. Apply each pending file in **its own transaction**:
        - `begin; set local lock_timeout = '10s'; set local statement_timeout = '5min';`
        - the file text as one simple-protocol `client.query(sql)` (no params, so multi-statement files work);
        - `insert into schema_migrations …; commit`.
        - On error: `rollback`, then throw `MigrationError` with the version, `err.code` and `err.message`. Stop; later files are not applied.
     6. Log one line per applied file with its duration, or `up to date`.
     7. In `finally`: `pg_advisory_unlock` (best effort), then `client.end()`.
   - The function never logs the connection string, the config, `process.env`, or a whole error object.
4. **Entry, `server/migrate.js`.**
   - If `DATABASE_URL` is missing or empty, print "DATABASE_URL is not set" and exit 2.
   - Set `dir` to `path.resolve(dirname(fileURLToPath(import.meta.url)), '../db/migrations')`. A missing dir is exit 2.
   - Call `runMigrations`. On a `MigrationError`, print `migrate failed: <message> [<code>]` and set `process.exitCode` to its code. Any other error prints `migrate failed: unexpected error [<code>]` and exits 1.
   - `unhandledRejection` and `uncaughtException` handlers print the same fixed text and exit 1.
   - Use `process.exitCode`, not `process.exit()`, on the normal path, so the client closes cleanly.
   - Image layout for T-015, recorded only and not implemented: `/app/server/migrate.js`, `/app/server/migrator.js`, `/app/db/migrations/*.sql`, and production `node_modules` containing `pg`.
5. **Typecheck.** Add `tsconfig.server.json`:
   - `allowJs`, `checkJs`, `noEmit`, `strict`;
   - `module` and `moduleResolution` `NodeNext`, `target` and `lib` `ES2023` (no DOM), `types: ["node"]`;
   - `include: ["server/**/*.js", "server/**/*.ts"]`.

   Update the `typecheck` script. Server code must not import from `src/` or `@/`, and `src/` must not import `pg` (R1, Vite bundle).
6. **Tests.** Write the tests in the table above. Fixtures are tiny SQL files. The tamper and missing-file cases copy the fixtures to a temp dir at runtime and edit them there.
7. **CI.** Changes to the `ci` job:
   - Add the Postgres service:
     ```yaml
     services:
       postgres:
         image: postgres:17
         env: { POSTGRES_PASSWORD: postgres }
         ports: ["5432:5432"]
         options: >-
           --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
     ```
   - Set `TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres` on the `pnpm test:coverage` step.
   - After it, add the step "migrate CLI smoke": run `node server/migrate.js` twice with `DATABASE_URL` set to the same URL, and check that the second run's output contains `up to date`.
   - The password is a throwaway CI value, not a secret.
   - The `image` job is unchanged.
8. **Format.** Run `pnpm format` and then all Checks.

Rules:
- **R1:** `src/` is untouched and local mode is unaffected.
- **R2/D25:** this ticket adds a new migrations folder with no RLS, by design, and leaves Supabase migrations untouched.
- **R3:** no `VITE_*` variable or secret is added; the CI password is a throwaway value.
- **R5:** wear stats exist only in the view.
- **R7:** scope is limited to the file list above.
- **R8:** tests run in CI and cannot be skipped there.
- **R10:** `vite.config.ts` is untouched.

## Specialist input used
Points where the two consults disagreed, and how each is resolved:

| Topic | database-optimizer | software-architect | Decision and why |
|---|---|---|---|
| File naming | `YYYYMMDDHHMMSS_name.sql` | `NNNN_name.sql` | **Timestamp.** It matches the existing `supabase/migrations` convention. Parallel branches cannot both claim `0002`, so there are no rename conflicts. The out-of-order check catches the rare bad merge. |
| Transaction scope | One transaction per file | The whole batch in one transaction | **Per file.** Expand-then-contract (D24) already requires every prefix of the sequence to work with the previous image, so a partial batch is safe. Per file also gives clear error attribution, lets the next deploy resume, and avoids the Postgres rule that an enum value added by `ALTER TYPE … ADD VALUE` cannot be used before that transaction commits. With a whole batch, a later file could never use a value added by an earlier file. |
| Advisory lock | Session lock (`pg_try_advisory_lock`, polled) | `pg_advisory_xact_lock` | **Session.** It follows from per-file transactions: a transaction-scoped lock would be released between files. Polling gives a bounded wait and a clear "another migration is running" error. The lock is released on disconnect, even if the process crashes. |
| `(item_id, worn_on desc)` index | Drop it | Keep it | **Drop.** The btree behind `unique(item_id, worn_on)` serves `where item_id = $1 order by worn_on desc limit 1` by scanning backwards. A duplicate index only costs writes. |
| `seasons` type | `text[]` plus a check | Keep the enum array and cast `::text[]` in the view | **`text[]` plus a check.** `pg` returns enum arrays as the raw string `"{…}"`, so every query would need a cast or a custom parser. Enum arrays are also awkward under expand-then-contract. The check keeps the same allowed values. `category` and `status` stay enums. Flagged as A3 because the ticket says "keep … enums". |
| `worn_on` default | No default | Keep `default current_date` but always pass the date | **No default.** Production Postgres runs in `Asia/Ho_Chi_Minh` and CI in UTC, so a default hides who owns "today". The current repo already sends `localToday()`. Adding a default later is a safe expand step; removing one is a contract step. |
| Photo column name | `storage_path` | `storage_key` | **`storage_path`.** It keeps the column and view (`primary_photo_path`) names that `src/data/mappers.ts` already reads, so T-013 can reuse the mappers unchanged. It is documented as an opaque reference: R4's `{user_id}/…` convention no longer applies, and the Drive design (T-005 re-plan) adds or reshapes columns in its own expand migration. See A6. |
| Build | Plain JS | esbuild bundle (option A) | **Plain ESM JS with `// @ts-check`, typechecked by `tsconfig.server.json`.** The literal `server/migrate.js` contract path exists with no build step, and there is no new devDependency. T-015's image copies `server/`, `db/migrations/` and production `node_modules` (`pg`). T-013 can still choose a TS/esbuild build for the API without changing this runner. See A7. |
| Older image and unknown applied versions | Fatal ("applied file missing") | Warn and exit 0 | **Split.** Applied versions **newer than the image's newest file** mean the DB is ahead: warn, apply nothing, exit 0, so a rollback deploy is not blocked. Expand-then-contract makes the older image compatible. A missing applied version **≤ the newest local file** is genuine drift (a deleted or renamed file) and stays fatal. |
| CI placement | Separate `db` job | Service on the existing `ci` job | **Existing `ci` job.** `pnpm test:coverage` runs there and must not skip in CI, so the database must be in the same job. |

Also adopted:
- From database-optimizer: `unique(name)` with on-conflict get-or-create; `check (parent_id <> id)` plus the parent index; explicit view columns with a lateral aggregate; no extensions, grants or roles; the tracking table shape with `name`; `lock_timeout` and `statement_timeout`; exit codes 0/1/2; fixed-message error logging; the owner-role test; the concurrency test; the migration lint test; and the README rules.
- From software-architect: `tsconfig.server.json` kept separate from the DOM config; `pg` as the client; `application_name`; the pg JS-shape contract test; a pure-helper split so some tests always run; the CLI smoke step; and the scope boundary.

Not adopted:
- The `MIGRATIONS_DIR` override: tests call `runMigrations({ dir })` directly, so there is no extra env surface.
- A Vitest `projects` split: a per-file `// @vitest-environment node` is the smaller change.
- Adding `.gitattributes` rules: the existing `* text=auto eol=lf` is enough.

## Assumptions
Numbered for Ming's plan approval:

- **A1 — New runtime dependency `pg` (node-postgres, ^8) plus devDependency `@types/pg`.** No esbuild and no other packages. `pg` is never imported from `src/`, so the SPA bundle is unchanged.
- **A2 — Unprefixed names** (`locations`, `items`, `item_photos`, `wear_logs`, `items_with_stats`, `item_category`, `item_status`, `set_updated_at`, `schema_migrations`). The `tudo_` prefix only existed for the shared stoktok project (D17); the database is now TuDo's own.
- **A3 — `seasons` is `text[]` plus a check, not a `season[]` enum array.** This deviates slightly from the ticket's "keep … enums". The allowed values are identical.
- **A4 — "Today" for wear logs is owned by the caller.** `worn_on` has no DB default. Default for T-013: the client keeps sending `localToday()` (UTC+7), as the Supabase repo does. If Ming prefers server-side Asia/Ho_Chi_Minh, T-013 does that; the schema needs no change either way.
- **A5 — Rollback policy.** Migrate on an older image warns and exits 0 when the DB has newer migrations. It fails on any other drift (edited applied file, deleted older file, out-of-order file). This relies on expand-then-contract discipline, documented in `db/migrations/README.md`.
- **A6 — `item_photos` is kept now as a minimal opaque reference table (`storage_path`).** No Drive-specific columns. The T-005 re-plan extends it with an expand migration.
- **A7 — `server/` is plain ESM JavaScript with JSDoc and `checkJs`**, not compiled. T-013 decides the API's build. If it introduces a bundler, `migrate.js` can stay as it is or be folded in, as long as the image keeps `server/migrate.js` (D24).
- **A8 — Coverage.** `server/**/*.js` is added to the coverage report without a threshold. Developers without Postgres can still run `pnpm test:coverage` locally, where the DB tests skip. CI always runs them, and R8 is met by the explicit test list, not by a percentage.
- **A9 — No data migration from Supabase in this ticket.** If the hosted Supabase project holds real wardrobe data, moving it (items via the existing CSV export/import; wear logs and photos need a separate step) is a follow-up before T-016. Ming to confirm whether real data exists.
- **A10 — The `ai_settings` / `ai_calls` tables are not ported.** They belong to the paused T-009 (D21/D22, superseded by D23).
- **Hotspot files** shared with upcoming tickets: `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` and `vitest.config.ts` (T-013 and T-015 will also edit these). `tsconfig.server.json` will be extended by T-013.
- **Exit codes:** 0 for success or a no-op, 1 for a runtime failure, 2 for a configuration error. The deploy only needs non-zero.

Follow-ups, recorded here and not part of the diff:
- **T-013:** register a `pg` type parser for `date` (OID 1082 → raw string), use parameterised SQL only, normalise location names to NFC, and use the get-or-create and wear SQL shown in the tests.
- **T-015:** add `server/`, `db/migrations/` and production `node_modules` with `pg` to the runtime image, and run `node server/migrate.js` as the `migrate` service.
- **`docs/data-model.md`** still describes the Supabase schema; update it in T-016.
- **`.github/risk-tiers.yml`:** add `db/migrations/**` and `server/migrat*.js` as High.
- **D24:** least-privilege runtime role.
- **CLAUDE.md R2 row:** Ming updates it per D25.

## Blocking questions
None. Every open point has a default above (A1–A10) for Ming to confirm at plan approval.

## Split proposal
None. Production code is about 350 lines (SQL about 110, runner and entry about 220, config and CI about 30). The tests are larger, but this is one cohesive piece (schema plus runner) and splitting it would leave an untestable half.
