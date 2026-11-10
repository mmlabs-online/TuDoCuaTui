# Consult — database-optimizer — T-012 (2026-11-10)

I read the T-012 and T-011 tickets, the T-011 consult, D23 to D25, `docs/data-model.md`, the three Supabase migrations, `src/data/repo.ts`, `mappers.ts` and the repo test grep, and `.github/workflows/ci.yml`. I did not read any `.env` file, and I did not read `plan.md` (the Glob and Read did not surface it). Nothing was run or changed.

## Findings

1. **Schema to port.** The Supabase init migration defines 3 enums, 4 tables, the `tudo_set_updated_at` trigger and the `tudo_items_with_stats` view. All of it is portable except `user_id`, the `auth.users` FKs, RLS, grants, the `storage.*` policies, `auth.uid()` and `security_invoker`. Per D23, `tudo_ai_settings` and `tudo_ai_calls` are not ported (D21/D22 are superseded and T-009 is paused).
2. **What the repo needs from the schema.**
   - **Location lookup or create.** `ensureLocation` does select-by-name and then insert. That race is real once an API serves it. Use `unique(name)` plus `INSERT … ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`.
   - **Item save.** An upsert by client-supplied uuid (`isUuid`), otherwise the server default.
   - **Wear +1.** Today it is `upsert … ignoreDuplicates` on `(item_id, worn_on)` and `already = no row returned`. The SQL equivalent is `INSERT … ON CONFLICT (item_id, worn_on) DO NOTHING RETURNING id`.
   - **Wear −1.** It deletes the latest row by `worn_on desc`. It should be one statement: `DELETE … WHERE id = (SELECT id … ORDER BY worn_on DESC LIMIT 1)`.
   - **Stats read.** The view returns `wear_count` and `last_worn`.
3. **Issues in the old schema, fixed in the port.**
   - `tudo_wear_logs_item_idx(item_id, worn_on desc)` duplicates the index behind `unique(item_id, worn_on)`. A btree scans backwards, so drop it.
   - `locations.parent_id` is an FK with no index, which breaks the "index every FK" rule. Add one. Also add `check (parent_id <> id)`.
   - `worn_on default current_date` uses the DB timezone (UTC in the container). The client sends `localToday()` (UTC+7), so a default would write the wrong day between 00:00 and 07:00 Vietnam time. Make it `not null` with no default, and the API always passes the date.
   - The view uses `i.*`, which freezes the column list at creation. A later `ALTER TABLE items ADD COLUMN` would not appear in the view. List the columns explicitly.
   - The grouped-subquery join is fine at personal scale. A `LEFT JOIN LATERAL (select count(*)::int, max(worn_on) from wear_logs where item_id = i.id)` is simpler and plans well for `fetchOne … where id = $1`.
4. **node-postgres type traps. These are driver-side, but the schema choices decide them.**
   - `date` comes back as a JS `Date`, which causes timezone shifts. The API must register `types.setTypeParser(1082, v => v)` (or cast `::text`). `mappers.rowToItem` expects `YYYY-MM-DD` strings.
   - `numeric(14,0)` comes back as a string. The mapper's `Number()` handles it.
   - `count(*)` is bigint and comes back as a string. Cast to `::int`, as the old view did.
   - `seasons tudo_season[]` (an enum array) is not parsed by `pg`. It arrives as the string `"{spring,summer}"`. Either make `seasons` a `text[]` with a check, or cast `seasons::text[]` in the view and in every query. I recommend `text[]` plus `check (seasons <@ array['spring','summer','autumn','winter'])`. Arrays of an enum are also painful under expand-then-contract.
   - Scalar enums (`category`, `status`) parse as text and are fine. Keep them as enums, as the ticket says.
5. **Extensions.** None are needed. `gen_random_uuid()` is built in since PG13, so drop `pgcrypto`. The app role is NOSUPERUSER and owns `public`, so avoid `CREATE EXTENSION`, `CREATE ROLE` and `GRANT` in migrations (the T-011 consult flagged the same).
6. **`items_with_stats` keeps its name.** It matches R5 and CLAUDE.md wording, and it is the view name without the `tudo_` prefix.

## Recommendations

**R1. Names and DDL (acceptance criterion 2, R5, D25).** The prefix `tudo_` existed only because of the shared stoktok project (D17). In an own DB it has no purpose. I recommend unprefixed `locations`, `items`, `item_photos`, `wear_logs` and view `items_with_stats`. The API (T-013) writes its own SQL, so only the Supabase `Database` types keep the old names until T-016. See open question 1.

Sketch of `db/migrations/20261110120000_init.sql`:
```sql
create type item_category as enum ('top','bottom','dress','outer','shoes','bag','accessory','sport','home','other');
create type item_status   as enum ('active','stored','laundry','lent','out');

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  parent_id uuid references locations(id) on delete set null check (parent_id <> id),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (name)
);
create index locations_parent_idx on locations(parent_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  category item_category not null default 'other',
  status item_status not null default 'active',
  brand text, size text, material text,
  price numeric(14,0) check (price is null or price >= 0),
  purchase_date date,
  location_id uuid references locations(id) on delete set null,
  colors text[] not null default '{}',
  seasons text[] not null default '{}'
    check (seasons <@ array['spring','summer','autumn','winter']),
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_location_idx on items(location_id);
create index items_colors_gin on items using gin (colors);  -- optional, see below
create index items_tags_gin   on items using gin (tags);    -- optional
create trigger items_updated_at before update on items
  for each row execute function set_updated_at();

create table item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  storage_path text not null unique,
  is_primary boolean not null default false,
  width int check (width is null or width > 0),
  height int check (height is null or height > 0),
  created_at timestamptz not null default now()
);
create index item_photos_item_idx on item_photos(item_id);
create unique index item_photos_one_primary on item_photos(item_id) where is_primary;

create table wear_logs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  worn_on date not null,                      -- no default, see Findings 3
  created_at timestamptz not null default now(),
  unique (item_id, worn_on)                   -- the only index needed
);
```
- The view lists columns explicitly, in this order, which matches the old `i.*` plus extras: `id, name, category, status, brand, size, material, price, purchase_date, location_id, colors, seasons, tags, notes, created_at, updated_at, wear_count, last_worn, location_name, primary_photo_path`.
  - `wear_count` and `last_worn` come from the lateral aggregate on `wear_logs`.
  - `location_name` comes from the `locations` join.
  - `primary_photo_path` comes from the lateral photo pick `order by is_primary desc, created_at limit 1`.
  - Nothing derived is stored (R5).
- Keep `storage_path` and `item_photos` as they are for now. The Drive design (T-005 re-plan) can add a nullable `drive_file_id` through an expand migration. Do not speculate in this ticket (R7). Note that R4's `{user_id}/...` path convention no longer applies, because there is no `user_id`. Flag it for the photo ticket.
- Keep the GIN indexes only because `docs/data-model.md` lists them. They are unused at hundreds of rows, so dropping them is also defensible. The planner decides.
- Add no `user_id`, RLS or grants (D25). Put a comment in the init file saying that a second user means `user_id` plus `ENABLE` and `FORCE ROW LEVEL SECURITY` in the same migration.
- Add no `CREATE EXTENSION`, `GRANT` or role statements.

**R2. Migration files and policy.**
- Name files `YYYYMMDDHHMMSS_name.sql`, matching the existing convention. The runner validates the pattern and sorts lexically.
- Files are forward-only. Each file carries a commented manual rollback, like the existing Supabase files. A DOWN migration is not needed, because deploy rollback only restores the image (D24).
- Add `db/migrations/README.md` with the expand-then-contract rules, since the previous image must run on the new schema:
  - no dropping or renaming of columns the previous release uses;
  - no `NOT NULL` without a default;
  - no narrowing of a type;
  - contract steps ship one release later.
- Files contain no `BEGIN` or `COMMIT`, and no statements that cannot run in a transaction (`CREATE INDEX CONCURRENTLY`, `ALTER SYSTEM`). Tables are tiny, so plain `CREATE INDEX` is fine. Do not build a no-transaction escape hatch now.
- Add `.gitattributes` with `*.sql text eol=lf`, so checksums are stable.

**R3. Tracking table.**
```sql
create table if not exists schema_migrations (
  version text primary key,        -- '20261110120000'
  name text not null,              -- 'init'
  checksum text not null,          -- sha256 hex
  applied_at timestamptz not null default now()
);
```
The runner creates it with `IF NOT EXISTS` under the advisory lock. It is not part of the SQL files, so the bootstrap has no chicken-and-egg problem.

**R4. Runner behaviour (`server/migrate.js`, contract D24).**
- **Dependencies.** Only `pg` (a single `Client`, not a `Pool`) plus `node:fs`, `node:crypto` and `node:path`.
- **Structure.** Export `runMigrations({ connectionString, dir, log })` and run `main()` only when invoked directly. Tests call the function against fixture directories. Resolve the default dir relative to `import.meta.url` (for example `../db/migrations`), so it works inside the image. Dockerfile follow-up for T-013/T-015: copy `server/`, `db/migrations/` and the `pg` dependency into the runtime image.
- **Order of operations.**
  1. Connect with `connectionTimeoutMillis` of about 5000. Pass no `ssl` option and no `sslmode` in the URL (D24, no SSL).
  2. Acquire a session-level advisory lock with a fixed bigint key. Poll `pg_try_advisory_lock` for up to about 30 s, then exit 1 with "another migration is running". A session lock survives per-file transactions and is released on disconnect even if the process dies. Also unlock in `finally`.
  3. Create `schema_migrations` if missing.
  4. Read the applied rows and the directory. Validate filenames.
  5. **Drift checks, each fatal (exit 1, nothing applied):**
     - an applied version whose file is missing;
     - an applied version whose checksum differs (sha256 of the file bytes with CRLF normalised to LF);
     - an unapplied file that sorts before the latest applied version (out-of-order).
  6. For each pending file in order, run `BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='5min'; <file SQL>; INSERT INTO schema_migrations …; COMMIT`. On error, `ROLLBACK`, log the version and the SQL error message, and stop. Do not apply later files.
     - `lock_timeout` matters because DDL otherwise queues behind a running app query, and then blocks every new app query behind it.
     - Send the file as one simple-protocol query (no parameters), so multi-statement files work.
  7. Log one line per applied file with its duration, and "up to date" for a no-op. Close the client and set `process.exitCode`. Do not call `process.exit()` before the client has ended.
- **Exit codes.** 0 for success or a no-op. 1 for any failure (connection, lock timeout, drift, SQL error). 2 for a configuration error (`DATABASE_URL` missing, migrations dir missing, bad filename). The deploy only needs non-zero. Install `unhandledRejection` and `uncaughtException` handlers that exit 1.
- **Never log `DATABASE_URL` or connection options (T-011 notes).**
  - Do not log `process.env`, the config object or `err` via `console.error(err)` or `util.inspect`. Log fixed messages plus `err.code` and `err.message` only.
  - Wrap URL parsing and connect in try/catch and print a fixed "invalid or unreachable DATABASE_URL (value not printed)" message, because parser errors can echo input.
  - Do not enable `pg` debug output.
  - SQL error `detail` is fine to log, since migrations carry no secrets.
- **Never migrate at API startup.** The API only runs `select 1` for `/readyz`.

**R5. Testing (acceptance criterion 3).**
- **CI job.** Add a separate `db` job to `ci.yml` with `services.postgres: image: postgres:17`, `POSTGRES_PASSWORD` set to a throwaway value, health options `pg_isready`, and port 5432. Pass `TEST_DATABASE_URL` pointing at it. The unit job stays Docker-free.
- **Locally.** `docker run --rm -e POSTGRES_PASSWORD=test -p 5432:5432 postgres:17`, then set `TEST_DATABASE_URL`.
- **Vitest settings.**
  - Add `// @vitest-environment node` to the DB test files, since the other suites likely run under jsdom.
  - Use `describe.skipIf(!process.env.TEST_DATABASE_URL)` locally, but **throw if `CI` is set and `TEST_DATABASE_URL` is missing**. Otherwise a skip shows as green and violates R8.
- **Isolation.** Create a fresh database per test file (`create database t_<rand>`, dropped afterwards) via an admin connection. At least one test should run the migrations as a `NOSUPERUSER NOCREATEDB NOCREATEROLE` owner role of its own database, to mirror production. That proves no extension or privilege is required.
- **Runner tests.**
  - fresh apply; re-run is a no-op (same row count and same `applied_at`);
  - checksum mismatch exits non-zero and changes nothing;
  - missing applied file is rejected;
  - an out-of-order file is rejected;
  - a failing file rolls back fully (no tables, no tracking row, later files not applied);
  - two concurrent runs (`Promise.all`) each apply every file once and both succeed;
  - `node server/migrate.js` via `child_process` returns non-zero with `DATABASE_URL` unset, with a wrong password, and with a bad host;
  - the captured stdout and stderr never contain the password or the URL;
  - a lint test: no `begin`/`commit` or `concurrently` in migration files, and filenames are well-formed.
- **Schema and repo-contract tests.**
  - the view column list and order equals the list in R1;
  - wear +1 twice returns `already`, and the stats show 1;
  - wear −1 deletes only the latest date, and after the last row `wear_count` is 0 and `last_worn` is null;
  - deleting an item cascades to wear logs and photos;
  - deleting a location nulls `location_id` and `parent_id`;
  - a second primary photo is rejected;
  - the `price < 0`, name-length, bad-enum, bad-season and `parent_id = id` constraints each reject;
  - the trigger bumps `updated_at`;
  - concurrent `ensureLocation` upserts return one row.

## Risks

- **node-postgres `date` and enum-array parsing** (Findings 4) will silently corrupt `lastWorn` and `seasons` in T-013 unless the type parser and the `text[]` choice are applied. Record them in the plan as constraints for T-013.
- **Failed migrations are safe only if every step is transactional.** A file that contains its own `COMMIT` defeats that, which is why the lint test exists.
- **`lock_timeout` makes a deploy fail rather than hang.** That is intended, and the old container keeps running. Re-run the deploy.
- **Rollback of the image after a contract migration breaks the previous release.** The README rule and review discipline are the only guard. An optional automatic lint that bans `drop` and `rename` without a `-- contract:` marker would help, but it is beyond this ticket.
- **A checksum mismatch hard-fails the deploy.** Editing an applied migration (forbidden by R2/D25) therefore breaks the release, which is intended.
- **The owner role runs both the API and migrate** (D24, accepted). An SQL injection in the API could drop tables, so T-013 must use parameterised queries only. The nightly dump plus the pre-migration backup bound the data loss.
- **Without a `user_id`, a later move to multi-user needs a backfill migration.** D25 already records this, so it is accepted.
- **Unicode.** Vietnamese location names in NFC and NFD forms are different strings under `unique(name)`. The API should normalise to NFC (T-013 note). Case-sensitive uniqueness matches the current behaviour.

## Open questions

1. **Unprefixed table names (`items`, `item_photos`, …) or keep `tudo_*`?** I recommend unprefixed. The cost is only a mapping in T-013 until T-016 removes the Supabase types.
2. **`seasons` as `text[]` plus a check, or keep the enum array?** The enum array needs a cast in every query. I recommend `text[]` plus a check, with `category` and `status` kept as enums.
3. **Is there real data in the Supabase project that must be moved?** If yes, who owns the data copy? It is not in T-012's scope. Photo paths would also be dead links until the Drive design lands.
4. **Keep the GIN indexes on `colors` and `tags`?** They match the data-model doc but have no current use.
5. **Is the runner ESM or CJS, and is `server/` compiled or plain JS?** The command is `node server/migrate.js`, so I assume plain JS. Check `package.json` `"type"` and the Dockerfile plan (T-013/T-015).
6. **Does Ming want exit code 2 for configuration errors, or is a single non-zero code enough?** I recommend the two codes, for readable CI logs.
7. **Where does the migrations folder live (`db/migrations/` as the ticket suggests) so the image can copy it?** Confirm with T-013/T-015, together with the `pg` runtime dependency.

Files referenced (absolute):
- /home/user/TuDoCuaTui/work/tickets/T-012/ticket.md
- /home/user/TuDoCuaTui/work/decisions.md (D23 to D25)
- /home/user/TuDoCuaTui/work/tickets/T-011/consult-database-optimizer.md
- /home/user/TuDoCuaTui/docs/data-model.md
- /home/user/TuDoCuaTui/supabase/migrations/20261106000000_init.sql
- /home/user/TuDoCuaTui/supabase/migrations/20261107120000_rls_hardening.sql
- /home/user/TuDoCuaTui/supabase/migrations/20261110000000_tudo_ai_settings.sql
- /home/user/TuDoCuaTui/src/data/repo.ts
- /home/user/TuDoCuaTui/src/data/mappers.ts
- /home/user/TuDoCuaTui/.github/workflows/ci.yml
