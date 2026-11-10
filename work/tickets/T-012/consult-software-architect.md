# Consult — software-architect — T-012 (2026-11-10)

I read the T-012 ticket, D23–D25, the T-013, T-014 and T-015 tickets, package.json, tsconfig.json, vite.config.ts, vitest.config.ts, Dockerfile, .dockerignore, ci.yml, src/data/repo.ts and mappers.ts, the three Supabase migrations, and deployment `postgres/compose.yml` and `postgres/sql/app-db.sql`. I did not read any .env file.

## Findings
1. **Build tooling.** Nothing in the repo builds server code today. `tsconfig.json` is set up for the browser only (`noEmit`, DOM lib, `moduleResolution: bundler`, `@/` paths, `include: src…`). `pnpm build` is `vite build`, and `pnpm typecheck` is `tsc --noEmit` on that one config. esbuild is not in the lockfile: Vite 8 bundles with rolldown. So any bundler would be a new devDependency.
2. **Files that already ship in the image.** `.dockerignore` excludes `supabase`, `scripts`, `docs`, `work` and `deploy`. A new top-level `db/` and `server/` would be included in the build context with no change. Migrations must not go under `scripts/` or `supabase/`.
3. **Database permissions.** The `tudocuatui` role owns its database and its `public` schema, and has no superuser, CREATEDB or BYPASSRLS. The current init migration runs `create extension pgcrypto`, which is not needed on PG13+ because `gen_random_uuid()` is built in. The deployed Postgres runs with `TZ: Asia/Ho_Chi_Minh`. A CI `postgres:17` service container defaults to UTC, so `worn_on default current_date` gives a different day in CI than in production.
4. **Supabase parts that drop out when porting:**
   - `auth.uid()` defaults and `user_id` columns; `unique(user_id, name)` becomes `unique(name)`
   - RLS policies, grants, the `tudo_private` helper and `security_invoker`
   - the storage bucket and its policies
   - the `tudo_ai_settings` / `tudo_ai_calls` tables. They are tied to `auth.users`, the service role and the paused T-009, and they are outside T-012's listed tables.
5. **What WardrobeRepo needs from the schema** (from the Supabase repo):
   - `items_with_stats` view with `wear_count::int`, `last_worn`, `location_name` and `primary_photo_path`
   - wear +1 as `on conflict (item_id, worn_on) do nothing` (no row returned means "already worn today")
   - wear −1 deletes the latest `worn_on`
   - get-or-create location by name
   - deleting an item cascades to its photos and wear logs
   - deleting a location sets `location_id` to null
6. **Client traps that will hit T-013 if the schema doesn't plan for them.** With node-postgres (`pg`):
   - arrays of custom enums (`season[]`) come back as the raw string `"{spring,summer}"`, because there is no parser for the custom array type
   - `date` columns become JS `Date` at local midnight, but the mappers expect `YYYY-MM-DD` strings
   - `numeric` comes back as a string (the mapper's `Number()` already handles this)

   postgres.js handles custom enum arrays itself, because it fetches the types when it connects.
7. **Deploy safety.** Per D24, the deploy workflow runs `migrate` only if the live compose file defines it. So merging T-012 does not change production; the nginx image stays as it is until T-015.

## Recommendations
- **R-1: Where the code lives (AC1, R7).**
  - Plain SQL migrations go in `db/migrations/NNNN_snake_name.sql`, zero-padded and applied in lexical order. The runner rejects file names that don't match `^\d{4}_[a-z0-9_]+\.sql$`.
  - Server TypeScript goes in `server/`: `server/migrate.ts` is a thin command-line entry, and `server/db/migrator.ts` holds the logic as `migrate({ client, dir, log })`.
  - Server code must not import from `src/` or `@/`, and `src/` must never import `pg` (R1, Vite bundle).
- **R-2: Build. Option A, recommended: esbuild bundle.** Add `esbuild` as a devDependency and a script `build:server` that does `esbuild server/migrate.ts --bundle --platform=node --format=esm --target=node22 --external:pg-native --outfile=build/server/migrate.js`. Pg is plain JS, so the bundle is a single file and needs no `node_modules` at runtime. That gives T-015 the smallest, cleanest runtime stage (`COPY build/server → /app/server`, `COPY db/migrations → /app/db/migrations`), and T-013 can import shared code from `src/` later if it wants to.
  - **Option B:** `tsc -p tsconfig.server.json` emits one file per source file. No new dependency, but the image then needs `node_modules` for production (`pnpm deploy --prod`), and `@/` aliases are not rewritten.
  - **Option C:** plain `server/migrate.js` with `// @ts-check` and JSDoc. No build step and the contract path exists literally in the repo, but it sets a weak precedent for T-013 (size L).
  - **Rejected:** Node 22 type-stripping, because it is still experimental on 22 and the contract says `.js`.
  - Leave `pnpm build` as `vite build` (Figma Make, R10). Add a separate CI step for `build:server`.
- **R-3: Typecheck.** Add a new `tsconfig.server.json`: `module`/`moduleResolution` `NodeNext` (or `bundler` with option A), lib ES2023 without DOM, `types: ["node"]`, `noEmit`, include `server/**`. Change the typecheck script to `tsc --noEmit && tsc -p tsconfig.server.json --noEmit`. Do not add `server/` to the root tsconfig; the DOM types would leak into server code.
- **R-4: Client library is `pg`.** Add `pg` to `dependencies` and `@types/pg` to devDependencies. Reasons: T-013's security note already says "pg pool max 5", it is the most widely used option, and with an empty parameter list `client.query(sql)` uses the simple protocol, which runs multi-statement migration files. Use one `pg.Client` for migrate, not a pool. The traps in Finding 6 need handling:
  - the view returns `seasons::text[]` (and any other enum arrays) explicitly, or T-013 registers type parsers
  - T-013 sets the `date` (OID 1082) parser to return the raw string
  - a T-012 contract test asserts the JS shape returned by `items_with_stats` through `pg`, so T-013 inherits a known shape

  postgres.js is the fallback if Ming prefers zero transitive dependencies. Its tagged templates are safe by construction, but you lose the "pg" alignment.
- **R-5: Runner semantics (AC1, D24, D25).**
  - Tracking table `schema_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now())`.
  - Take `pg_advisory_xact_lock(<constant>)`. Apply **all pending files in one transaction**, each followed by its insert into `schema_migrations`. A failed deploy then leaves the database exactly as the previous image expects.
  - Store the sha256 of each file. If an applied file's checksum no longer matches, fail with exit 1; this enforces "never edit an applied migration".
  - Set `lock_timeout` (e.g. 10s) and `application_name=tudocuatui-migrate`, and give the connection a timeout.
  - Exit 0 with "nothing to apply" on a re-run. Exit non-zero if `DATABASE_URL` is missing, if a migration fails, or on any error.
  - Log only file names, plus `err.code` and `err.message`. Never log `err` as a whole object, the config, or the URL.
  - Document in the migrations README two restrictions: no `CREATE INDEX CONCURRENTLY`, and no using a new enum value in the same file that adds it.
- **R-6: Locating the migration files.** Default to `path.resolve(dirname(fileURLToPath(import.meta.url)), "../db/migrations")`, overridable with `MIGRATIONS_DIR`. Write the image layout for T-015 into the plan: `/app/server/migrate.js` and `/app/db/migrations/*.sql`. Don't embed SQL in the bundle; files on disk stay inspectable.
- **R-7: Schema in `0001_init.sql` (AC2, R5, D25).**
  - Use unprefixed names (`locations`, `items`, `item_photos`, `wear_logs`, `items_with_stats`). The database belongs to TuDo, and R5 already says `items_with_stats`.
  - Keep the enums, checks, GIN indexes, the `updated_at` trigger, `unique(item_id, worn_on)` and the `(item_id, worn_on desc)` index.
  - No `pgcrypto`, no RLS, no `user_id` (D25).
  - Give the view an explicit column list instead of `i.*`, because `*` is frozen when the view is created.
  - Don't rely on `worn_on default current_date`. Keep the default, but tests and T-013 always pass the date explicitly (see Finding 3).
  - `item_photos`: keep it minimal as an opaque reference (`storage_key text not null unique`, `is_primary`, width/height, the one-primary partial index), so the Drive design in T-005 can change it with a later migration.
- **R-8: Tests (AC1–AC3, R8).**
  - Add a Vitest `projects` split in `vitest.config.ts`, which is not a Figma Make file: the `web` project stays jsdom, and a new `server` project runs in a node environment over `server/**/*.test.ts`. Alternative: a per-file `// @vitest-environment node`, which works because `src/test/setup.ts` is node-safe.
  - DB tests read `TEST_DATABASE_URL`, never `DATABASE_URL`, and are skipped with `describe.skipIf` when it is unset. When `CI=true` and the variable is unset, they fail, so CI can't pass by skipping.
  - Each test file creates and later drops its own throwaway database (`tudo_test_<random>`).
  - The tests cover:
    - fresh apply, then re-apply as a no-op
    - checksum tamper leads to failure
    - a bad file rolls the whole batch back
    - two concurrent runs serialise
    - the schema contract: wear +1 twice on the same day, −1, view counts, cascades, location set-null, `unique(name)`, price check
  - Keep pure helpers (file listing and validation, ordering, checksum) separate and unit-tested without a DB, so local coverage thresholds don't depend on Postgres being available. Add `server/**` to coverage with the standard thresholds.
  - CI: add `services: postgres: image: postgres:17` with a health check to the `ci` job, set `TEST_DATABASE_URL`, and add one command-line smoke step: `pnpm build:server`, then run `node build/server/migrate.js` twice against a fresh database and check the exit codes.
- **R-9: Scope boundary (R7).**
  - **T-012 owns:** `db/migrations`, the migrator plus its command-line entry and build script, `tsconfig.server.json`, the typecheck script, the Vitest server project, the CI Postgres service, and the `pg` dependency.
  - **T-012 does not touch:** `src/**`, `vite.config.ts`, the Dockerfile, `check-image.sh`, `release.yml`, compose, the pool, the HTTP server, `/readyz`, `/healthz`, runtime type parsers, or the Supabase migrations.
  - **Follow-ups:** the AI settings tables (T-009 re-plan); server row types replacing `src/types/database.ts` (T-013/T-016); a least-privilege runtime role (D24).

## Risks
- **Rolling back to an older image.** Its migrate will find applied versions it doesn't know. Failing on that blocks the rollback; ignoring it risks a schema mismatch. My suggestion is to warn and exit 0, and require migrations that stay backward-compatible with the previous image.
- **Ambiguous "today" in API mode.** It could be the browser's local day or the server's. A mismatch breaks one-wear-per-day around midnight (T-013 decision).
- **pg enum-array and date parsing (Finding 6).** If T-012 doesn't pin these down with a contract test, T-013/T-014 will ship subtly wrong `seasons` and `purchaseDate` values.
- **Migrating as the owner role.** Owner-role migrations and app access mean an API SQL bug could run DDL. This is accepted in D24 and tracked as a follow-up.
- **Coverage thresholds.** If DB-bound code counts toward thresholds while DB tests are skipped locally, `pnpm test:coverage` fails for developers without Postgres.
- **Bundling pg with esbuild.** `pg-native` must be marked external. The smoke step catches it if not.

## Open questions (for Ming or the planner)
1. Build: is a new esbuild devDependency acceptable (option A), or should it be tsc emit plus production `node_modules` (option B)?
2. Is there real data in Supabase that has to move to Postgres before T-016? Nothing currently owns that export/import. CSV import/export may be enough.
3. Photos: keep a minimal opaque `item_photos` table now (my recommendation, matches the ticket's "photos (references)"), or defer it entirely to the T-005 re-plan?
4. Rollback policy when the database has migrations the image doesn't know: warn and continue, or fail?
5. Who defines "today" for wear logs in API mode: the client sends a local date, or the server uses Asia/Ho_Chi_Minh?

Files read: /home/user/TuDoCuaTui/work/tickets/T-012/ticket.md, /home/user/TuDoCuaTui/work/decisions.md (D23–D25), /home/user/TuDoCuaTui/work/tickets/T-013/ticket.md, /home/user/TuDoCuaTui/work/tickets/T-014/ticket.md, /home/user/TuDoCuaTui/work/tickets/T-015/ticket.md, /home/user/TuDoCuaTui/package.json, /home/user/TuDoCuaTui/tsconfig.json, /home/user/TuDoCuaTui/vitest.config.ts, /home/user/TuDoCuaTui/Dockerfile, /home/user/TuDoCuaTui/.dockerignore, /home/user/TuDoCuaTui/.github/workflows/ci.yml, /home/user/TuDoCuaTui/src/data/repo.ts, /home/user/TuDoCuaTui/supabase/migrations/20261106000000_init.sql, /home/user/deployment/postgres/sql/app-db.sql, /home/user/deployment/postgres/compose.yml.
