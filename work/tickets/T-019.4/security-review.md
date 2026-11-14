# Security review — T-019.4

## Attempt 1 — 2026-11-14 (security-ai-generated-code-auditor, read-only; no git diff or tests run)

**Verdict: no 🔴.** Policies, FORCE, the view, the maintenance path, GUC handling and test non-vacuity are correct. Three 🟡 hardening items (best in this ticket or before T-019.5/T-019.7); the rest 🟢.

### Findings
**Policies and FORCE (AC1)**
- 🟢 `db/migrations/20261114200000_row_level_security.sql:18-46`: `enable` + `force` on all five tables; `owner_only` `for all`, USING = WITH CHECK `user_id = (select app_user_id())` (initplan). `:15-16` `nullif(current_setting('app.user_id', true), '')::uuid`: unset or pooled empty → NULL → 0 rows; malformed → 22P02 (closed). No `TO`, role or grant (D24).
- 🟢 `:51` `security_invoker = true`; view laterals on `wear_logs`/`item_photos` have no `user_id` predicate but are filtered per base table under invoker RLS, and composite FKs forbid cross-user children; `rls.db.test.ts:178-190` (incl. lookup by A's id as B).
- 🟢 Maintenance policy `:48-49`: permissive, OR-ed only into SELECT on `item_photos`; writes still need `owner_only` (`rls.db.test.ts:217-239`); `items_with_stats` under maintenance returns nothing; `withMaintenance` always `begin read only` (`db.js:90`).

**RI, cascades, existence leaks**
- 🟢 Composite `(user_id, …)` FKs (`20261114120000_user_ownership_contract.sql:98-105`); RI runs as owner, cascade and `set null (col)` work (`rls.db.test.ts:160-176`); cross-user child insert → 23503 → 404 without revealing anything.
- 🟢 42501 handling: `items.js:122-127` turns 42501 and `rowCount === 0` into `NotOwned` → `null` → 404, rolling back the location upsert (`rls.db.test.ts:143-158`); other 42501 → 500 `internal` + requestId; only `code/constraint/routine` logged (`errors.js:31,35-44`). PG evaluates the ON CONFLICT WHERE (`items.js:102`) first, so in practice `rowCount 0`; 42501 is defence in depth. Existing (not new) oracle: B can tell an existing foreign uuid (404) from a free one (create); random v4 ids, not exploitable.

**GUC binding and transaction scope**
- 🟢 `db.js:79`, `:90` bind `$1`, `is_local = true`; canonical userId checked before connect (`:76`, `db.test.ts:113-122`); task allow-list before connect (`:89`); on error rollback + `release(err)` destroys the connection (`:62-65`); residual-GUC test `rls.db.test.ts:90-103`.
- 🟢 `tudo.maintenance` only in `db.js` (`scoping.test.ts:105-114`); `withMaintenance` imported only by `photo-sweep.js:11` (CLI, not imported by the app).

**No path skips withUser**
- 🟢 Every user-table query in `items.js`, `photos.js`, `ai/store.js` runs on the `withUser` client; only `ping` (`db.js:37`, `select 1`) uses `pool.query`; `scoping.test.ts:98-103` forbids `pool.query(`/`pool.connect(` there; isolation suite runs the real app on the NOSUPERUSER owner pool (`isolation.db.test.ts:85-123`) → a forgotten `withUser` fails closed.
- 🟢 No tx spans Drive IO or a body read (`photos.js:175-238`, `:269-286`); sweep DB steps in short `withMaintenance`, Drive delete outside (`photo-sweep.js:86-141`); without maintenance the listing is empty and the sweep refuses (~`:251` test).

**Tests are non-vacuous**
- 🟢 `test/pg.ts:46-50` creates a `nosuperuser` (NOBYPASSRLS) owner; migrations run as it; guards `rls.db.test.ts:65-70`, `isolation.db.test.ts:118-123`; fixtures/direct reads use `adminUrl`. Catalog test (`rls.db.test.ts:192-205`) fails CI on a future table without RLS + FORCE + a policy.

**Migrator guard**
- 🟡 **The guard turns itself off if a later migration disables RLS on `items`** (`server/migrator.js:125` `if (!by.get("items")?.rls) return;`): `alter table items disable row level security;` would pass silently. Fix: activate by version (`schema_migrations` contains `20261114200000` / file ≥ that version) or by `to_regprocedure('app_user_id()')`; test that a `disable row level security` file fails.
- 🟡 **Neither the guard nor the catalog test checks policy content** (`rls.db.test.ts:203` only ≥ 1 policy): a later `create policy x on items using (true)` (permissive, OR-ed) opens the table and passes. Fix: assert the exact `pg_policies` set `(tablename, policyname, cmd, permissive, qual, with_check)` = five `owner_only` + `photo_sweep_read` (SELECT); optionally in `assertRlsForced`.
- 🟢 `includes("security_invoker=true")` (`migrator.js:131`) rejects `security_invoker = on` — fails closed; README note.
- 🟢 `no force … force` inside one tx holds ACCESS EXCLUSIVE until commit; no app session sees the unforced window.

**Hardening**
- 🟡 **A session-level `tudo.maintenance` default would open `item_photos` to every request.** `withUser` sets only `app.user_id`; a value from `ALTER ROLE/DATABASE … SET`, `options=-c tudo.maintenance=…` in `DATABASE_URL`/`PGOPTIONS`, or a stray session `set` would make `photo_sweep_read` true in every `withUser` tx (app SQL still filters `user_id = $2`, so no leak today, but the second layer is gone). Fix: `db.js:79` `select set_config('app.user_id', $1, true), set_config('tudo.maintenance', '', true)`; in `withMaintenance` (`:90`) also clear `app.user_id`; update `fake-pool.ts`, `db.test.ts`.
- 🟢 `inTx` commits even if `fn` swallowed a DB error (`db.js:57-58`; PG answers ROLLBACK, pg resolves). No current `fn` swallows. Guard: `if ((await client.query("commit")).command !== "COMMIT") throw …`.
- 🟢 Add a scoping assertion that `withMaintenance` appears only in `db.js` and `photo-sweep.js`.
- 🟢 `app_user_id()` has no pinned `search_path` (`migration:15-16`); not exploitable with one role; revisit with a role split.
- 🟢 `photo_sweep_read` evaluates `current_setting` per row (CLI path; perf only).

### Risks for T-019.5
1. Map the Identity `sub` through `toUserId`; a non-canonical id makes `withUser` throw → 500 not 401; auth must reject before any repo call.
2. Any auth/session/provisioning table needs RLS + FORCE + a policy in the same migration (catalog test enforces). Pre-auth lookups must not use a broad permissive policy keyed on a request-influenced GUC; use the `withMaintenance` allow-list pattern with a narrow command-specific policy, or a separate schema; write side stays `owner_only`.
3. The nesting guard means auth middleware cannot open a `withUser` that a handler nests inside; use sequential transactions.
4. Pool `max: 5`, one tx per request; per-user/per-IP photo PUT limit still needed before identity mode.

### Recommendations
1. 🟡 `assertRlsForced` activates by migration version; test a `disable row level security` file fails.
2. 🟡 Pin the exact `pg_policies` set in `rls.db.test.ts`.
3. 🟡 Clear `tudo.maintenance` in `withUser` and `app.user_id` in `withMaintenance` in the same `set_config` statement.
4. 🟢 `inTx` checks `COMMIT`; scoping test limits `withMaintenance` to `db.js` and `photo-sweep.js`.

### Open questions
- Is the `create or replace view` guard test (`migrator.db.test.ts:585-593`) green on PG 17 in CI (depends on CREATE OR REPLACE resetting reloptions)?
- Fix 1–3 here or as follow-ups? (auditor: fix 1 and 3 here)
