Status: READY

# Plan — T-019.1: Ownership expand migration and owner backfill

## Feature summary
Not in `docs/feature-list.md` (T- ticket, slice of T-019). Ticket goal: "Every existing row gets an owner (`user_id` =
Ming's mmlabs `sub`) without breaking the running code."

Sources this plan implements (quoted):
- Umbrella plan `work/tickets/T-019/plan.md`, *Split proposal* → T-019.1: "(1) new file only, four applied migrations
  unchanged …; (2) after migrate with `TUDO_OWNER_SUB`, all five tables have `user_id` = owner on every pre-existing
  row; (3) rows exist + owner unset → migration fails, transaction rolled back; empty DB → passes; malformed owner →
  exit 2, value never printed; (4) the existing API code still passes all current db tests (inserts work with nullable
  `user_id`); (5) view keeps all old columns in order, `user_id` last; (6) checks green."
- Umbrella A1: "Expand (T-019.1): nullable `user_id`, backfill, indexes, view column; old code keeps working. Contract
  (T-019.2 / T-019.3 …): straggler backfill, NOT NULL, uniques, composite FKs, `ai_settings` PK."
- Umbrella A2: "Existing rows go to `TUDO_OWNER_SUB` …, passed by `migrate.js` as GUC `tudo.owner_sub`; the migration
  raises if rows exist and it is unset; empty DBs need nothing. … The value is non-secret and goes in `compose.yml`."
- Umbrella A13: "Production Postgres is ≥ 15 …; the contract migration raises on `server_version_num < 150000`" (so no
  version guard in this expand file).
- D32: "The change uses two migrations (expand T-019.1, contract T-019.2). RLS `ENABLE` + `FORCE` arrives in its own
  migration (T-019.4) …, not in the migration that adds `user_id`."
- D37: "T-019.x code is written and merged without Ming's mmlabs `sub`; `TUDO_OWNER_SUB` is supplied only when the
  T-019.1 migration runs in production. No release containing T-019.1 is cut until Ming has an Identity account
  (M-17), then M-18 (backup) and the release follow."
- Ticket note 2026-11-14: plan approval waived if this plan adds no High-tier decision beyond A1, A2, A13, D32, D37.

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "New migration file only; the four applied migrations are unchanged (`git diff --stat db/migrations`)." | `git diff --stat main -- db/migrations` lists exactly `20261113120000_user_ownership_expand.sql` (new) and `README.md`; the four applied `.sql` files show no change. `server/migrator.test.ts` › "real db/migrations files are well-formed and contain no forbidden statements" stays green with the new file. |
| 2 | "After migrate with `TUDO_OWNER_SUB`, all five tables (`locations`, `items`, `item_photos`, `wear_logs`, `ai_settings`) have `user_id` = owner on every pre-existing row." | `server/migrator.db.test.ts` › "ownership expand: rows in all five tables get the owner; updated_at unchanged; triggers re-enabled"; `server/schema.db.test.ts` › the two upgrade tests now pass `ownerSub` and assert `user_id`. |
| 3 | "Rows exist and owner unset → migration fails and the transaction rolls back; empty DB → passes; malformed owner → exit 2, value never printed." | `migrator.db.test.ts` › "rows + no owner rejects; nothing applied", "empty DB passes with and without owner", "garbage tudo.owner_sub GUC is rejected without echoing it"; `migrator.test.ts` › `parseOwnerSub` cases; `migrate.cli.test.ts` › "malformed TUDO_OWNER_SUB → exit 2, value not printed" (with unreachable and with unset `DATABASE_URL`). |
| 4 | "The existing API code still passes all current db tests (inserts work with nullable `user_id`)." | `pnpm test` with `TEST_DATABASE_URL` set: `api.db.test.ts`, `app.db.test.ts`, `photo-sweep.db.test.ts`, `ai/store.db.test.ts` pass **unchanged** (`git diff --stat` shows no edit to them); `migrator.db.test.ts` › "null user_id inserts still accepted". `schema.db.test.ts` changes are limited to the four tests listed under *Tests to write* (A6). |
| 5 | "View `items_with_stats` keeps all old columns in order, `user_id` last." | `schema.db.test.ts` › "items_with_stats columns: existing order kept, user_id last" (the existing list + `user_id`); "view still returns location_name for a null-user_id item". |
| 6 | "All checks pass." | `pnpm typecheck`, `pnpm format:check`, `pnpm test` (db tests run in CI with Postgres 17), `pnpm build`. |

## Ming verification after merge
Merging this ticket needs nothing from Ming (D37). At the **first production release that contains T-019.1** (after M-17,
with M-18):
- In the release PR on `mmlabs-online/deployment`, set `TUDO_OWNER_SUB` on the `migrate` service of
  `apps/tudocuatui/compose.yml` to Ming's `sub` (copied from the Identity login response), alongside `release.env`, the
  same way M-14 edited compose on the release branch. `pr-scope` must stay green.
- Deploy run: `backup` → `migrate` (log shows `applied 20261113120000_user_ownership_expand`) → `deploy` green.
- Read-only on the Mac: `select count(*) from <t> where user_id is null` is 0 for each of the five tables; the app
  behaves as before under Access.
- If the release is cut with the empty value on a populated DB, `migrate` fails ("rows exist but TUDO_OWNER_SUB is not
  set"), the deploy stops before replacing the app (verified in `deploy-tudocuatui.yml`, A4), nothing is changed.

The orchestrator should add the "set `TUDO_OWNER_SUB` in the release PR's compose" step to M-18's text in
`work/ming-todo.md` (not part of this diff).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261113120000_user_ownership_expand.sql` | New. Header (expand-only; owner from GUC `tudo.owner_sub` set by `migrate.js` from `TUDO_OWNER_SUB`; no-op backfill on an empty DB; RLS comes in T-019.4 per D32; manual rollback text). `alter table … add column user_id uuid` on the five tables (no default, no NOT NULL, no FK, no check). One `do $$ … end $$;` block: owner check + backfill with the two `updated_at` triggers disabled and re-enabled. Two indexes. `create or replace view items_with_stats` = the `20261112120000_item_photos_drive.sql` body verbatim + `, i.user_id` last. | AC1, AC2, AC3, AC5; A1, A2, D32 |
| `server/migrator.js` | Add `export function parseOwnerSub(raw)`; `runMigrations` gains optional `ownerSub`, validates it first (before reading files or connecting), and inside each migration transaction runs `select set_config('tudo.owner_sub', $1, true)` after `set local tudo.migrating = 'on'` when an owner is set. Never logs the owner. | AC3; A2 |
| `server/migrate.js` | Pass `ownerSub: process.env.TUDO_OWNER_SUB` to `runMigrations`; header comment lists the variable. The `DATABASE_URL`-unset check stays first and unchanged. Existing `fail()` maps the `MigrationError` exit code 2. | AC3; A2 |
| `db/migrations/README.md` | Replace the "No RLS while the app is single-user …" bullet with D32 (expand T-019.1, contract T-019.2/.3, RLS T-019.4); document `tudo.owner_sub` / `TUDO_OWNER_SUB` (rows + no owner → fail; empty DB → no-op; value is a UUID, never printed); note "no bare `end;` in DO blocks, use `end $$;`" (forbidden-statement test). | A1, R2 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | `migrate` service only: `environment: TUDO_OWNER_SUB: ""` with a comment (M-17/M-18: set Ming's `sub` in the release PR that first contains T-019.1; empty is valid only while the DB has no rows; the app service does not get it until T-019.2). Update the header comment (non-secret value; not in the env file). | A2, D37 |
| `docs/data-model.md` | Line 3 only: replace "no `user_id`/RLS until in-app auth arrives (D25)" with the D32 state (nullable `user_id` added by T-019.1, NOT NULL in T-019.2, RLS in T-019.4). | Keeps the doc true; A7 |
| `server/migrator.test.ts` | `parseOwnerSub` unit tests. | R8 |
| `server/migrator.db.test.ts` | Ownership-expand db tests; `run` helper accepts `ownerSub`. | R8, AC2–AC4 |
| `server/migrate.cli.test.ts` | `runCli(databaseUrl?, env?)` deletes inherited `TUDO_OWNER_SUB` and takes overrides; owner tests. | R8, AC3 |
| `server/schema.db.test.ts` | The four test changes listed below (consult findings 4 and 5). | AC2, AC5 |

Not changed (deliberately): the four applied migrations, `scripts/check-image.sh` (the `TUDO_` env prefix is already
allowed and CI migrates an empty DB; consult finding 9), `server/README.md` and `.env.example` (the app does not read
`TUDO_OWNER_SUB` until T-019.2, which lists them), `deploy-tudocuatui.yml`, any API/server runtime file.

## Tests to write
Fixed owner in tests: `const OWNER = "0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e"` (v7-shaped) and a v4 value in unit tests.

| Test (file › name) | Covers |
|---|---|
| `server/migrator.test.ts` › `parseOwnerSub`: `undefined`, `""`, `"   "` → `undefined` | AC3 (empty = unset) |
| `server/migrator.test.ts` › `parseOwnerSub`: trims and lowercases a valid uppercase UUID; accepts v4 and v7 | A2 |
| `server/migrator.test.ts` › `parseOwnerSub`: `"xyz"`, a 35-char UUID, a UUID with braces, `00000000-0000-0000-0000-000000000000` → `MigrationError` with `exitCode` 2, message `TUDO_OWNER_SUB is not a valid UUID`, message never contains the input | AC3 |
| `server/migrator.db.test.ts` › "ownership expand: rows in all five tables get the owner; updated_at unchanged; triggers re-enabled" — temp dir with the four applied files, run, insert one row in each of `locations`, `items` (with `location_id`), `item_photos`, `wear_logs`, `ai_settings`; record `updated_at` of `items` and `ai_settings`; run `realDir` with `ownerSub: OWNER`; assert every row's `user_id = OWNER`, both `updated_at` unchanged, `pg_trigger.tgenabled = 'O'` for `items_updated_at` and `ai_settings_updated_at`; a later `update items set name = …` bumps `updated_at` | AC2 |
| `server/migrator.db.test.ts` › "rows + no owner rejects; nothing applied" — same seed, run `realDir` without owner (and with `ownerSub: "  "`) → `MigrationError` exit 1 matching `/TUDO_OWNER_SUB is not set/`; `schema_migrations` still has exactly the four versions; `information_schema.columns` has no `user_id` | AC3 |
| `server/migrator.db.test.ts` › "empty DB passes with and without owner" — two fresh DBs, `realDir`, one without and one with `OWNER`; all five versions applied, `user_id` column present | AC3 |
| `server/migrator.db.test.ts` › "garbage tudo.owner_sub GUC is rejected without echoing it" — seed four files + rows; in a raw client: `begin`, `select set_config('tudo.owner_sub', 'not-a-uuid-SECRETISH', true)`, run the new file's SQL → error message matches `/not a valid uuid/` and does not contain `SECRETISH`; `rollback`. Repeat with the nil UUID. | AC3 (SQL-side defence) |
| `server/migrator.db.test.ts` › "null user_id inserts still accepted" — after the full migration, insert into all five tables without `user_id` succeeds | AC4 |
| `server/migrator.db.test.ts` › "applies as a NOSUPERUSER database owner" (existing) — extend: seed rows under the owned DB before the new file and pass `ownerSub`, so `disable trigger` is proven to work without superuser | AC2 (consult finding 2) |
| `server/migrate.cli.test.ts` › "malformed TUDO_OWNER_SUB + unreachable DATABASE_URL → exit 2, value not printed" | AC3 |
| `server/migrate.cli.test.ts` › "DATABASE_URL unset + malformed TUDO_OWNER_SUB → exit 2, value not printed" | AC3 |
| `server/migrate.cli.test.ts` › (with Postgres) "valid TUDO_OWNER_SUB on a fresh DB → exit 0, owner not in the output" | AC3, A3 |
| `server/schema.db.test.ts` › "migration applies over init data; a storage_path row survives" (line 229) — pass `ownerSub: OWNER` to the `realDir` run; also assert `row.user_id === OWNER` | AC2, consult 4 |
| `server/schema.db.test.ts` › "category v2 migration …" (line 253) — pass `ownerSub: OWNER` to both `realDir` runs; assert all five items have `user_id = OWNER` | AC2, consult 4 |
| `server/schema.db.test.ts` › "no table has RLS or a user_id column" (line 218) → "no table has RLS; user_id is a nullable uuid on exactly the five tables" | D32, consult 5 |
| `server/schema.db.test.ts` › "items_with_stats columns: existing order kept, user_id last" (line 83) — append `"user_id"` | AC5, consult 5 |
| `server/schema.db.test.ts` › "ownership indexes exist" — `pg_indexes` has `items_user_created_idx` and `locations_user_sort_idx` with the expected column order | A1 |
| `server/schema.db.test.ts` › "view still returns location_name for a null-user_id item" — insert a location and an item without `user_id` → `items_with_stats.location_name` is set, `user_id` null | AC4, consult 7 |

Unchanged and re-run: `api.db.test.ts` (its line-349 re-migration finds nothing pending), `app.db.test.ts`,
`photo-sweep.db.test.ts`, `ai/store.db.test.ts`.

## Approach
1. **Migration file** `db/migrations/20261113120000_user_ownership_expand.sql` (consult rec. 1):
   - `alter table locations add column user_id uuid;` and the same for `items`, `item_photos`, `wear_logs`,
     `ai_settings`.
   - One `do $$ declare raw text; begin … end $$;` block:
     `raw := nullif(btrim(current_setting('tudo.owner_sub', true)), '');` — if
     `exists (select 1 from locations) or exists (… items) or exists (… item_photos) or exists (… wear_logs) or exists (… ai_settings)`:
     `raw is null` → `raise exception 'rows exist but TUDO_OWNER_SUB is not set'`;
     `raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or raw = '00000000-0000-0000-0000-000000000000'`
     → `raise exception 'TUDO_OWNER_SUB is not a valid uuid'` (checked **before** any `::uuid` cast; the message never
     includes the value); then `alter table items disable trigger items_updated_at;`
     `alter table ai_settings disable trigger ai_settings_updated_at;` five
     `update <t> set user_id = raw::uuid where user_id is null;` then enable both triggers again. Empty DB: nothing
     happens, even if the GUC is set. No `raise notice` with counts (A2).
   - `create index items_user_created_idx on items (user_id, created_at desc, id);`
     `create index locations_user_sort_idx on locations (user_id, sort_order, name);` — no other index or unique now.
   - `create or replace view items_with_stats as` the item_photos_drive body verbatim, with `, i.user_id` after
     `p.id as primary_photo_id`. Do **not** add `and l.user_id = i.user_id` (T-019.2) and no `security_invoker`
     (T-019.4).
   - Header comment: purpose, GUC contract, D32 (no RLS here), manual rollback:
     `drop view items_with_stats;` → recreate it from `20261112120000_item_photos_drive.sql`; `drop index
     items_user_created_idx; drop index locations_user_sort_idx;` `alter table … drop column user_id` on the five tables.
   - Keep the forbidden-statement test green: no bare `begin;`/`end;`/`commit`/`rollback`/`concurrently` outside `--`
     comment lines (the DO block ends with `end $$;`; `end if;` is fine).
2. **`server/migrator.js`** (consult rec. 2): `parseOwnerSub(raw)` → trim; empty/undefined → `undefined`; lowercase;
   `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`; reject nil; else
   `throw new MigrationError("TUDO_OWNER_SUB is not a valid UUID", 2)`. `runMigrations({ …, ownerSub })` calls it as its
   first statement (exit 2 beats a connection error). In the per-file transaction, after `set local tudo.migrating`,
   `if (owner) await client.query("select set_config('tudo.owner_sub', $1, true)", [owner]);` — a bound parameter,
   transaction-local, not part of the checksum or `schema_migrations`. JSDoc type updated (`ownerSub?: string`).
3. **`server/migrate.js`** (consult rec. 3): pass `ownerSub: process.env.TUDO_OWNER_SUB`; header lists the variable
   and says it is never printed.
4. **README + compose + data-model** (consult rec. 4, 5): as in *Files*. Compose: `environment:` block only on
   `migrate` (the `x-app` anchor's `env_file` stays shared; the app service is untouched).
5. **Tests** as listed; run all checks.

Rules:
- R1: server/DB only; the SPA, local mode and `WardrobeRepo` are untouched.
- R2: new migration file only, applied files untouched. "RLS in the same migration" is amended by D32 (RLS in T-019.4);
  `src/types/database.ts` does not exist in this Node/Postgres setup (A18 stale wording), nothing to regenerate.
- R3: `TUDO_OWNER_SUB` is not secret and not a `VITE_*` variable; it is still never printed (a wrong value must not
  leak into logs either way).
- R5: no derived values stored; the view still derives `wear_count`/`last_worn`.
- R7: the contract steps (NOT NULL, uniques, FKs, view join clause, straggler backfill) stay in T-019.2/.3.
- R8: unit + db tests above. R9/R10: not affected (no UI, no Figma Make files).

## Specialist input used
- database-optimizer (`consult-database-optimizer.md`): adopted findings 1–9 and recommendations 1–6 as written:
  expand-only file and name, DO-block owner check before any cast, trigger-safe backfill with `disable/enable trigger`
  (not `session_replication_role`, which needs a superuser), the two indexes only, view column appended without the
  location-join clause, `parseOwnerSub` + bound `set_config`, compose `TUDO_OWNER_SUB: ""` on `migrate` only with no
  `CHANGE_ME` placeholder, README, tests including the `schema.db.test.ts` changes (lines 83, 218, 242, 274).
  Added: nil-UUID rejection also in the SQL check (keeps psql runs consistent with `parseOwnerSub`); extending the
  NOSUPERUSER test to cover `disable trigger` as the database owner.
  Not adopted: the optional `check-image.sh` malformed-owner assertion (CI already covers it in
  `migrate.cli.test.ts`; keeps the umbrella's "if needed" file out of the diff).
  Open questions 1–4 resolved as A2–A5 below.

## Assumptions
- **A1 — Migration version `20261113120000`** (consult name). It sorts after `20261112160000_ai_settings`; no other
  open ticket adds a migration.
- **A2 — No backfill count log** (consult Q1). The migration emits no `raise notice`; `migrate.js` logs only the usual
  `applied …` line. Ming's post-deploy `user_id is null` count (M-18) is the audit. Never the owner value.
- **A3 — Any UUID version is accepted, only the nil UUID is rejected** (consult Q2). Identity may issue v4 or v7 `sub`
  values; the format check is the canonical 8-4-4-4-12 hex form after trim + lowercase, no version/variant nibble check.
- **A4 — The deploy aborts on a non-zero migrate** (consult Q3, verified by reading
  `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`): the `migrate` step runs
  `docker compose … run --rm migrate` and `exit 1`s if it fails ("The app was not replaced; the old release is still
  running"); the `deploy` step's `if:` requires `steps.migrate.outcome == 'success'` when a migrate service exists, and
  `rollback` runs only when `deploy` failed. So a missing/malformed owner on a populated DB leaves the old app running
  and the DB unchanged (the whole file is one transaction). No workflow change.
- **A5 — Compose carries `TUDO_OWNER_SUB: ""` and Ming sets the real value in the release PR** (consult Q4, D37), as
  M-14 did for compose on a `release/tudocuatui-vX.Y.Z` branch. No `release.env` entry written by the release workflow
  (that would change `release.yml` and the deployment repo's `pr-scope` contract — out of scope). Empty = unset, so a
  populated DB fails safely; an empty DB (CI, `check-image.sh` db smoke) passes.
- **A6 — AC4 wording vs. `schema.db.test.ts`.** "Existing db tests pass" holds unchanged for `api.db`, `app.db`,
  `photo-sweep.db`, `ai/store.db` and `migrator.db` (existing tests). Four `schema.db.test.ts` tests must change
  because they assert the old schema ("no user_id", the view's last column) or seed rows before migrating without an
  owner (consult findings 4–5). These are test-only changes, not API changes.
- **A7 — `docs/data-model.md` line 3** is updated in this diff because it would otherwise state "no `user_id`" after
  merge; one sentence, no diagram change.
- **A8 — Straggler rows** written by the old image between the T-019.1 and T-019.2 releases keep `user_id` null; the
  T-019.2 contract migration backfills them with the same DO-block pattern and needs `TUDO_OWNER_SUB` again (consult
  finding 1). Recorded here so the T-019.2 plan picks it up.
- **A9 — Hotspots:** `deploy/deployment-repo/apps/tudocuatui/compose.yml` is also edited by T-019.2, T-019.9 and
  T-018.2 (all BACKLOG); `server/schema.db.test.ts` by T-019.2. No ticket in `IN_PROGRESS`/`REVIEW`/`DONE` touches
  these files today (only the T-019 umbrella row is `IN_PROGRESS`). `src/App.tsx` is not touched.
- **A10 — Size:** about 350–400 changed lines (migration ~70, migrator/migrate ~35, docs/compose ~25, tests ~250); one
  implement/review cycle.

**Decisions beyond the umbrella plan:** none. Every choice above is an implementation detail of A1, A2, A13, D32 and
D37 (or a consult default); no new High-tier decision is introduced.

## Blocking questions
None.

## Split proposal
None (this ticket is already the T-019.1 slice of the umbrella plan).
