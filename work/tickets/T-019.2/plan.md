Status: READY

# Plan — T-019.2: Scope items, locations, wear logs and photos by user_id (contract migration)

High tier (migration, deploy config, request auth context). `Gate: plan-approval`: the loop stops here until Ming
writes "Plan approved". A1–A7 below are the choices Ming should look at; everything else is implementation detail.

## Feature summary
Not in `docs/feature-list.md` (T- ticket, slice of T-019). Ticket goal: "Every item, location, wear-log and photo query
is scoped to the caller's `user_id`; under Access every request maps to `TUDO_OWNER_SUB`."

Sources (quoted):
- Umbrella plan `work/tickets/T-019/plan.md`, *Split proposal* → T-019.2: "contract migration (NOT NULL, per-user
  uniques, composite FKs, PG guard); `ctx.userId` only from the auth layer; every query scoped; PUT on another user's
  id → 404, original unchanged; photo GET/PUT/DELETE of another user → 404; per-user photo in-flight cap; sweep
  unscoped and keeps both users' files; SQL guard test; image check starts with `TUDO_OWNER_SUB`."
- Umbrella *Files* (T-019.2 rows): contract file = "backfill stragglers, `set not null` on 4 tables,
  `unique(user_id, name)` replaces `locations_name_key`, `unique(user_id, id)` on `items`/`locations`, composite FKs
  (`on delete set null (location_id)` / `(parent_id)`), PG ≥ 15 guard, location join `and l.user_id = i.user_id` in the
  view"; `items.js`/`photos.js`: "`userId` first parameter on every function; `where … user_id = $n` everywhere;
  guarded upsert `where items.user_id = excluded.user_id` → 404; per-user photo in-flight cap plus the global cap";
  `photo-sweep.js`: "stays unscoped; comment only".
- Umbrella A4: "`TUDO_AUTH_MODE=access` maps every Access request to `TUDO_OWNER_SUB`" (the mode switch itself is
  T-019.5). A13: "Production Postgres is ≥ 15 …; the contract migration raises on `server_version_num < 150000`".
  A7: "T-019.2 includes only the per-user photo in-flight cap (the global cap becomes a cross-user DoS)."
- D32: "Every table gets `user_id uuid` (mmlabs `sub`), scoped in every Node query plus composite FKs. The change uses
  two migrations (expand T-019.1, contract T-019.2). RLS … arrives in its own migration (T-019.4)".
- D37: "No release containing T-019.1 is cut until Ming has an Identity account (M-17), then M-18 (backup) and the
  release follow."
- Ticket note (T-019.1 security review, rec 2): "the straggler backfill must, before NOT NULL, raise with a constant
  message when `count(distinct user_id) where user_id is not null` > 1 or differs from the `tudo.owner_sub` GUC …; the
  migrator must keep printing only `err.message`, never PG `detail`".

## Acceptance criteria → verification
| # | Criterion (ticket) | How the reviewer verifies it |
|---|---|---|
| 1 | "Contract migration: NOT NULL `user_id`, per-user uniques (`locations (user_id, name)`), composite FKs, PG ≥ 15 guard." | `git diff --stat main -- db/migrations`: one new file `20261114120000_user_ownership_contract.sql` + `README.md`; the five applied files unchanged. `server/schema.db.test.ts` › "contract: …" tests (NOT NULL on four tables, `ai_settings.user_id` nullable, per-user location names, cross-owner FKs → 23503, `set null` keeps `user_id`, constraint names, view definition). `server/migrator.db.test.ts` › "contract: …" tests (straggler backfill, owner assertions, constant messages, empty DB). PG guard: `migrator.db.test.ts` › "contract file guards server_version_num < 150000 with a constant message" (static). |
| 2 | "`ctx.userId` comes only from the auth layer; every query in `items.js` and `photos.js` is scoped." | `server/access.test.ts` › "createAccessAuth returns the owner and ignores x-user-id / query / body"; `server/isolation.db.test.ts` › "body user_id is ignored"; `pnpm typecheck` (every exported function in `items.js` and every `photos.js` handler takes a branded `UserId`; a plain string fails); `server/scoping.test.ts` (static guard) and `isolation.db.test.ts` › "every statement sent by the item and photo routes mentions user_id" (runtime recorder). Reading `server/api.js`: `userId` comes only from `handleApi`'s ctx, which only `app.js` sets from `auth.authenticate`. |
| 3 | "PUT on another user's id → 404 and the original is unchanged; photo GET/PUT/DELETE of another user's id → 404." | `server/isolation.db.test.ts` › "B PUT on A's item → 404; A's row (incl. updated_at) and A's locations unchanged; no location created for B"; "B photo PUT / DELETE on A's item → 404, no Drive create/delete, A's row kept"; "B GET A's photo → 404 (also with If-None-Match, never 304)". |
| 4 | "Per-user photo in-flight cap; the Drive sweep stays unscoped and keeps both users' files." | `server/inflight.test.ts` (pure limiter: per-user 2, total 3, release, entry removed at 0); `isolation.db.test.ts` › "per-user photo cap: A's 3rd held upload → 503 + Retry-After, B's first passes"; `server/photo-sweep.db.test.ts` › "files referenced by two users' rows are both kept; an unreferenced file is still a candidate". `photo-sweep.js` diff is a comment only. |
| 5 | "A guard test fails when a SQL statement on a TuDo table lacks `user_id`; the image check starts with `TUDO_OWNER_SUB`." | `server/scoping.test.ts` › "negative fixture: an unscoped literal is reported", "server/*.js and server/ai/*.js have no unscoped SQL", "allow-list entries are not stale". `scripts/check-image.sh` diff: `ACCESS` array carries `-e TUDO_OWNER_SUB=<dummy uuid>`; new `expect_exit 2` lines (Access values without owner, malformed owner, nil owner); CI `image` job green. |
| 6 | "All checks pass." | `pnpm typecheck`, `pnpm format:check`, `pnpm test` (DB tests run in CI with Postgres 17), `pnpm build`; CI image check. |

## Ming verification after merge
Merging needs nothing from Ming. Release steps (this ticket ships in the first release that contains T-019.1, A1):

**Before the release (new step, proposed as M-24 in `work/ming-todo.md`):** check the production Postgres version on the
Mac, read-only: `select current_setting('server_version_num')::int >= 150000;` must be `t`. If it is `f`, do not cut
the release; tell the orchestrator (fallback: single-column FKs + a test, re-plan). Even if this check is skipped, a PG < 15
fails the contract cleanly: the expand file is already committed, the contract rolls back, the deploy stops, the old
app keeps running (it works on the expand schema).

**In the release PR (M-18, text to update by the orchestrator):** set Ming's `sub` **once** in
`apps/tudocuatui/compose.yml` (`x-owner-sub: &owner_sub "<sub>"`), which feeds `TUDO_OWNER_SUB` to both `migrate` and
the app. Take the manual `pg_dump` (M-18) before merging.

**After the deploy (read-only on the Mac):**
- Deploy log: `applied 20261113120000_user_ownership_expand`, then `applied 20261114120000_user_ownership_contract`;
  the app container is healthy (an empty or bad `TUDO_OWNER_SUB` makes it exit 2).
- `select distinct user_id from <t>` on `locations`, `items`, `item_photos`, `wear_logs` returns exactly Ming's `sub`
  (no null); `ai_settings` returns that value or nothing.
- `\d items` shows `user_id uuid not null` and `items_location_fk`; the app lists, saves, wears, uploads and shows
  photos as before under Access.
- Isolation between two users cannot be checked in production yet (Access admits one user); it is covered by the
  tests and checked again at M-21.

### Release and rollback (not image-rollback-safe)
- **Order inside one deploy run:** `backup` → `migrate` applies expand then contract, each in its own transaction →
  app replaced. Failure points:
  - Expand fails (no owner on a populated DB): nothing applied, old app keeps running (T-019.1 A4).
  - Contract fails (PG < 15, `lock_timeout` 10 s, owner mismatch, two owners): expand stays applied, contract rolled
    back, deploy stops before the app swap; the old app runs fine on the expand schema. Fix and re-release.
  - Both applied, new app fails to start (e.g. owner empty in the app only, which the shared anchor prevents): the
    deploy's automatic rollback starts the **old image on the contract schema**: reads work, writes fail
    (`on conflict (name)` → 42P10, inserts without `user_id` → 23502). This is a degraded, read-only app. Fix forward
    (correct compose value, new release) or restore.
- **During the swap** (seconds): the old container can still write and fails the same way; reads keep working.
- **Rolling back after the contract:** an older image does not work for writes. Options, in order:
  1. Fix forward with a new release (preferred).
  2. Restore the M-18 `pg_dump` (loses writes made since the release), then deploy the previous image.
  3. Manual down SQL from the migration header (drop the four `*_fk`, re-add the single-column FKs, drop
     `locations_user_id_name_key`, `items_user_id_id_key`, `locations_user_id_id_key`, re-add `unique (name)` only if
     names are still unique, `drop not null` on four tables, view without the `l.user_id` clause), then the previous
     image. The `schema_migrations` row stays; the old image's migrator then logs "database is ahead" and applies
     nothing, which is fine.
- The PR description must say "not image-rollback-safe; rollback = fix forward or restore the M-18 backup".

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `db/migrations/20261114120000_user_ownership_contract.sql` | New. Header: contract step, **not expand-only**, owner GUC contract, manual rollback SQL, D32/T-019.4. Body: PG guard; `lock table`; owner assertion + straggler backfill DO block; `set not null` on four tables; `unique (user_id, id)` on `items` and `locations`; `locations_name_key` → `locations_user_id_name_key unique (user_id, name)`; drop four single-column FKs, add four composite FKs; `create or replace view items_with_stats` with `and l.user_id = i.user_id`. See *Approach* 1. | AC1, A3, A7, A18 |
| `db/migrations/README.md` | Exception to the "every prefix works with the previous image" bullet: T-019.2's contract is not image-rollback-safe (fix forward / restore M-18 backup); the contract requires `TUDO_OWNER_SUB` whenever rows exist and checks there is one owner equal to it. | A8, R2 |
| `server/user.js` (new) | `/** @typedef {string & { readonly __brand: "UserId" }} UserId */`; `toUserId(raw)` → trim, lowercase, canonical 8-4-4-4-12 hex, not nil → `UserId`, else `null`. The only producer of `UserId` in production code. | AC2, A11 |
| `server/migrator.js` | `parseOwnerSub` uses `toUserId` (same behaviour, same `MigrationError` message/exit 2); the local `UUID_RE` goes. Comment near `err.message` (`:206`): only the message is printed, never `detail`. | A2 (one UUID rule), ticket note |
| `server/access.js` | `loadAccessConfig(env)` also returns `ownerSub: UserId` in `on` **and** `off` mode; missing → `AccessConfigError("TUDO_OWNER_SUB must be set")`, malformed/nil → `AccessConfigError("TUDO_OWNER_SUB must be a valid UUID")` (value never in the message). New `createAccessAuth({ verifier, ownerSub })` and `createFixedAuth(ownerSub)` returning `{ authenticate(req): Promise<{ ok: true, userId } \| { ok: false, code }> }`. `createAccessVerifier` unchanged. | AC2, A2, A10 |
| `server/index.js` | Build `auth` (Access on → `createAccessAuth`, off → `createFixedAuth` + existing "access check OFF (dev)" line); `initAi` `requestAuth: accessConfig.mode === "on"` (unchanged meaning); pass `auth` to `createApp`. | AC2, A9 |
| `server/app.js` | Replace nullable `access` with required `auth`; on `ok:false` keep `access_denied` log + 401 `unauthorized`; on `ok:true` pass `userId` into `handleApi`. Never reads a user from body, query or headers. | AC2 |
| `server/api.js` | `userId` in the ctx type; pass it to `listItems`, `listLocations`, `saveItem`, `removeItem`, `wearItem`, `handlePhoto`, `servePhoto`. AI routes unchanged (T-019.3). | AC2 |
| `server/items.js` | `userId: UserId` first after `pool` on every exported function; every statement scoped (see *Approach* 3); guarded upsert → `null` → 404. | AC2, AC3 |
| `server/inflight.js` (new) | Pure `createInFlight({ perUser, total })` → `{ tryAcquire(userId): (() => void) \| null, count(userId), total() }`; release is idempotent; map entry deleted at 0. | AC4, A5 |
| `server/photos.js` | Scoped `withLockedItem(pool, userId, itemId, fn)`; `putPhoto` pre-check, delete and insert carry `user_id`; DELETE answers 404 when `withLockedItem` returns false; `servePhoto` looks up by `id` **and** `user_id`; module-level `photoSlots = createInFlight({ perUser: 2, total: 3 })` replaces `inFlight`/`MAX_IN_FLIGHT`. | AC3, AC4 |
| `server/photo-sweep.js` | Comment only: global on purpose (one Drive folder, DB is the authority across all users); allow-listed in `scoping.test.ts`. | AC4 |
| `server/README.md` | `TUDO_OWNER_SUB` row (UUID, not secret, required in every mode, same value for app and migrate, never printed); local run line gains `TUDO_OWNER_SUB=<uuid>`; note on running the contract against a dev DB with rows. | docs |
| `.env.example` | Line 1 comment lists `TUDO_OWNER_SUB` among the server env names (no value). | docs |
| `scripts/check-image.sh` | `ACCESS` array adds `-e TUDO_OWNER_SUB=<fixed dummy v4 uuid>` (comment: not secret, dummy); new `expect_exit 2` for "Access values without TUDO_OWNER_SUB", "malformed TUDO_OWNER_SUB", "nil TUDO_OWNER_SUB". db smoke unchanged (empty DB needs no owner for migrate; the app run already uses `ACCESS`). | AC5 |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Top-level `x-owner-sub: &owner_sub ""`; `TUDO_OWNER_SUB: *owner_sub` on both `tudocuatui` and `migrate`; header comment rewritten (one value for both; empty = app exits 2 and a populated DB fails migrate; set in the release PR, M-18). | A2, A12 |
| `server/test/auth.ts` (new, test-only, not in the image) | `OWNER_A`, `OWNER_B` (valid UUIDs as `UserId`), `fixedAuth(userId)`, `headerAuth()` (`x-test-user: a\|b`, default A). | tests |
| `server/user.test.ts` (new), `server/inflight.test.ts` (new), `server/scoping.test.ts` (new), `server/isolation.db.test.ts` (new) | See *Tests to write*. | R8 |
| `server/access.test.ts`, `server/index.cli.test.ts`, `server/app.test.ts` | Owner config, auth objects, exit codes; `access` → `auth` in the app tests. | R8, AC2 |
| `server/schema.db.test.ts`, `server/migrator.db.test.ts`, `server/photo-sweep.db.test.ts`, `server/api.db.test.ts` | New contract tests; fixtures insert `user_id`; T-019.1 tests that assert expand-only state pinned to a temp dir with the first five files; photo DELETE on a missing item now 404. | R8, AC1, AC4 |
| `server/app.db.test.ts`, `server/api.test.ts`, `server/ai/routes.test.ts`, `server/ai/tagPhoto.test.ts` | Mechanical: `access: null` → `auth: fixedAuth(OWNER_A)`. | `createApp` signature |

Not changed: the five applied migrations, `server/ai/*.js` (T-019.3), `server/migrate.js`, `server/drive.js`,
`deploy-tudocuatui.yml`, `docs/data-model.md` (line 3 already says "becomes NOT NULL in T-019.2"), anything under
`src/`.

## Tests to write
Fixed values: `OWNER_A`, `OWNER_B` from `server/test/auth.ts`; in SQL fixtures pass `user_id` explicitly.

| Test (file › name) | Covers |
|---|---|
| `server/user.test.ts` › `toUserId`: trims and lowercases; accepts v4 and v7; rejects `""`, `"xyz"`, 35 chars, braces, nil → `null` | A2 |
| `server/access.test.ts` › `loadAccessConfig`: Access on + owner → `ownerSub` lowercased; off (non-production) + owner → `ownerSub`; on/off without owner → "TUDO_OWNER_SUB must be set"; malformed / nil → "must be a valid UUID", message never contains the input; off in production still refused | AC2, A2 |
| `server/access.test.ts` › `createAccessAuth`: verifier ok → `{ ok: true, userId: owner }` even with `x-user-id`, `?user_id=` and a JSON body naming another uuid; verifier fails → `{ ok: false, code }`, no userId | AC2 |
| `server/access.test.ts` › `createFixedAuth(owner)` always returns the owner | AC2 |
| `server/index.cli.test.ts` › Access on without `TUDO_OWNER_SUB` → exit 2; malformed → exit 2, value not in stdout/stderr; nil → exit 2; `TUDO_ACCESS_DISABLED=1` without owner → exit 2. Existing starts gain a valid owner and stay green | A2 |
| `server/app.test.ts` › failed `authenticate` → 401 `unauthorized` + `access_denied` log; success passes `userId` to the API (a stub route sees it) | AC2 |
| `server/inflight.test.ts` › per-user 2 / total 3: A,A ok, A 3rd null; B ok (total 3); B 2nd null (total full); release frees; double release counts once; `count(A)` 0 removes the entry | AC4 |
| `server/scoping.test.ts` › extracts string and template literals from `server/*.js` and `server/ai/*.js` (not tests); any literal matching `\b(from\|into\|update\|join)\s+(items\|locations\|item_photos\|wear_logs\|items_with_stats)\b` must contain `user_id`; allow-list entries `{ file, includes, reason }` for the two `photo-sweep.js` statements | AC5 |
| `server/scoping.test.ts` › negative fixtures: `"select * from items where id = $1"` and a template literal `` `delete from wear_logs …` `` without `user_id` are reported; a scoped one is not | AC5 |
| `server/scoping.test.ts` › every allow-list entry matches at least one literal (no stale entries) | AC5 |
| `server/isolation.db.test.ts` › lists: A and B each see only their items and locations | AC2 |
| `server/isolation.db.test.ts` › B PUT on A's item id → 404 `not_found`; A's row unchanged incl. `updated_at`; B's `location_name` did not create a location (rolled back); A's locations unchanged | AC3 |
| `server/isolation.db.test.ts` › body `user_id: OWNER_A` sent by B creates an item owned by B | AC2 |
| `server/isolation.db.test.ts` › same location name "Tủ 1" for A and B → two rows, each item points at its owner's row; NFC/NFD forms of one name for one user → one row | AC1 |
| `server/isolation.db.test.ts` › B DELETE A's item → 204 (same as a missing id) and A's item, photos and wear logs still exist, no Drive delete | A4 |
| `server/isolation.db.test.ts` › B wear +1 and −1 on A's item → 404; A's wear logs unchanged | A4 |
| `server/isolation.db.test.ts` › B photo PUT on A's item → 404, fake Drive got no create; B photo DELETE `?photo=<A's photo>` → 404, A's row and file kept; A DELETE with a stale photo id on own item → 204 | AC3, A4 |
| `server/isolation.db.test.ts` › B GET `/api/photos/<A's photo id>` → 404, also with `If-None-Match: "<id>"` (never 304); no Drive media request | AC3 |
| `server/isolation.db.test.ts` › per-user cap over HTTP: A opens two photo PUTs that stall mid-body; A's 3rd → 503 `photos_unavailable` + `Retry-After: 5`; B's first is accepted; sockets closed at the end | AC4 |
| `server/isolation.db.test.ts` › runtime recorder: wraps `pool.query` and `client.query` while the routes above run; every statement other than `begin`/`commit`/`rollback` contains `user_id` | AC2, AC5 |
| `server/schema.db.test.ts` › contract: insert without `user_id` → 23502 on `locations`, `items`, `item_photos`, `wear_logs`; `ai_settings.user_id` still nullable | AC1 |
| `server/schema.db.test.ts` › contract: same location name for two users OK; twice for one user → 23505 | AC1 |
| `server/schema.db.test.ts` › contract: cross-owner item→location, photo→item, wear→item, location→parent → 23503 | AC1 |
| `server/schema.db.test.ts` › contract: deleting a location nulls only `items.location_id` and children's `parent_id`; `user_id` unchanged; deleting an item cascades its photos and wear logs | AC1 |
| `server/schema.db.test.ts` › contract: constraints `locations_user_id_name_key`, `locations_user_id_id_key`, `items_user_id_id_key`, `locations_parent_fk`, `items_location_fk`, `item_photos_item_fk`, `wear_logs_item_fk` exist; `locations_name_key` and the four `*_fkey` are gone | AC1 |
| `server/schema.db.test.ts` › view: columns unchanged, `user_id` last; `pg_get_viewdef('items_with_stats')` contains `l.user_id = i.user_id` (the data case is impossible under the composite FK). Replaces "view still returns location_name for a null-user_id item" | AC1 |
| `server/schema.db.test.ts` › "no table has RLS; user_id is NOT NULL on four tables and nullable on ai_settings" (replaces the T-019.1 version) | AC1, D32 |
| `server/migrator.db.test.ts` › contract: from the T-019.1 state (temp dir with the first five files) with owned rows **and** null-`user_id` stragglers in the four tables, run `realDir` with `OWNER_A` → every row owned, `items.updated_at` unchanged, `items_updated_at` `tgenabled = 'O'`, columns NOT NULL | AC1 |
| `server/migrator.db.test.ts` › contract: stragglers + no owner → fails "rows exist but TUDO_OWNER_SUB is not set"; contract version absent; columns still nullable | A3 |
| `server/migrator.db.test.ts` › contract: all rows owned + no owner → same failure (owner required whenever rows exist) | A3 |
| `server/migrator.db.test.ts` › contract: rows owned by A and B → "rows belong to more than one owner"; rows owned by A + GUC B → "existing owner differs from TUDO_OWNER_SUB"; an `ai_settings` row owned by B counts; messages contain neither UUID | A3, ticket note |
| `server/migrator.db.test.ts` › contract: empty DB passes with and without owner; `ai_settings` with null `user_id` is ignored by the owner check | A3 |
| `server/migrator.db.test.ts` › "contract file guards server_version_num < 150000 with a constant message" (static: file contains `server_version_num`, `150000`, `'PostgreSQL 15 or newer is required'`) | AC1, A7 |
| `server/migrator.db.test.ts` › existing T-019.1 tests that assert expand-only state ("null user_id inserts still accepted", version counts) run on a temp dir with the first five files; "applies as a NOSUPERUSER database owner" also covers the contract (trigger disable as DB owner) | AC6 |
| `server/photo-sweep.db.test.ts` › files referenced by A's and B's rows are both kept; an unreferenced tagged file is still a candidate | AC4 |
| `server/api.db.test.ts` › "DELETE photo …; missing item 204" → "missing item 404"; fixtures insert `user_id`; direct calls to `items.js` pass `OWNER_A` | A4 |

## Approach
1. **Migration `db/migrations/20261114120000_user_ownership_contract.sql`** (DB consult A, adjusted by A3):
   1. `do $$ begin if current_setting('server_version_num')::int < 150000 then raise exception 'PostgreSQL 15 or newer is required'; end if; end $$;`
   2. `lock table locations, items, item_photos, wear_logs in access exclusive mode;` (app lock order; `lock_timeout`
      10 s from the migrator).
   3. One DO block: `raw := nullif(btrim(current_setting('tudo.owner_sub', true)), '')`. `rows_exist` = any row in the
      four tables or `ai_settings`. If `rows_exist`: `raw is null` → `'rows exist but TUDO_OWNER_SUB is not set'`;
      format/nil check before any cast → `'TUDO_OWNER_SUB is not a valid uuid'`; `count(distinct u)` over the non-null
      `user_id`s of the five tables > 1 → `'rows belong to more than one owner'`; = 1 and ≠ `raw::uuid` →
      `'existing owner differs from TUDO_OWNER_SUB'`; then, if any null `user_id` in the four tables:
      `alter table items disable trigger items_updated_at;` four `update … set user_id = raw::uuid where user_id is
      null;` `enable trigger`. Empty DB: nothing. All messages constant; no `raise notice`.
   4. `set not null` on the four tables (`ai_settings` stays nullable: T-019.3).
   5. `items_user_id_id_key unique (user_id, id)`, `locations_user_id_id_key unique (user_id, id)`; drop
      `locations_name_key`, add `locations_user_id_name_key unique (user_id, name)`.
   6. Drop `locations_parent_id_fkey`, `items_location_id_fkey`, `item_photos_item_id_fkey`, `wear_logs_item_id_fkey`;
      add `locations_parent_fk (user_id, parent_id) → locations (user_id, id) on delete set null (parent_id)`,
      `items_location_fk (user_id, location_id) → locations (user_id, id) on delete set null (location_id)`,
      `item_photos_item_fk (user_id, item_id) → items (user_id, id) on delete cascade`,
      `wear_logs_item_fk (user_id, item_id) → items (user_id, id) on delete cascade`.
   7. `create or replace view items_with_stats` = the expand body verbatim with
      `left join locations l on l.id = i.location_id and l.user_id = i.user_id`.
   8. Keep the forbidden-statement test green (`end $$;`, no `begin;`/`commit`). R5: stats still derived.
2. **Identity plumbing** (architect R1–R3): `server/user.js`; `access.js` owner config + auth objects; `index.js`
   builds `auth`; `app.js` requires `auth` and passes `userId`; `api.js` forwards it. No `TUDO_AUTH_MODE` (T-019.5).
3. **`items.js`** (DB consult B, architect R4), `userId` = `$n` bound parameter everywhere:
   - `listItems`: `select * from items_with_stats where user_id = $1 order by created_at desc, id`.
   - `listLocations`: `… from locations where user_id = $1 order by sort_order, name`.
   - `saveItem`: location `insert into locations (user_id, name) values ($1, $2) on conflict (user_id, name) do update
     set name = excluded.name returning id`; item insert lists `user_id`, `on conflict (id) do update set … where
     items.user_id = excluded.user_id returning id` (`user_id` never in `set`); `rowCount === 0` → rollback (undoes the
     location), release, return `null`; else commit and `getItem(pool, userId, id)`.
   - `getItem`: `where id = $1 and user_id = $2`.
   - `removeItem`: lock, photo refs and delete all `and user_id = $n`; foreign/missing → `[]` → 204.
   - `wearItem`: +1 `insert into wear_logs (user_id, item_id, worn_on) select $1::uuid, i.id, $3::date from items i
     where i.id = $2 and i.user_id = $1 on conflict (item_id, worn_on) do nothing returning id`; −1 `delete from
     wear_logs where user_id = $2 and id = (select id from wear_logs where item_id = $1 and user_id = $2 order by
     worn_on desc limit 1)`; stats `… from items_with_stats where id = $1 and user_id = $2`, empty → `null` → 404.
4. **`photos.js`** (architect R5): scoped `withLockedItem`; PUT pre-check `select 1 from items where id = $1 and
   user_id = $2`; replace-delete and insert carry `user_id`; DELETE → 404 when the item is not the caller's;
   `servePhoto` `where id = $1 and user_id = $2` (304 stays after the lookup). Cap: `const release =
   photoSlots.tryAcquire(userId)` with no `await` between the check and the acquire; `null` → same 503
   `photos_unavailable` + `Retry-After: 5`; `release()` in `finally`.
5. **Config and image:** compose anchor, `check-image.sh`, `server/README.md`, `.env.example`, sweep comment.
6. **Tests** as listed, then all checks.

Rules: R1 — server only; `src/`, local mode and the Figma Make preview untouched. R2 — new migration file only; RLS
stays in T-019.4 (D32); `src/types/database.ts` does not exist in this Node/Postgres setup (umbrella A18).
R3 — `TUDO_OWNER_SUB` is not secret, not `VITE_*`, never printed. R4 — photos stay private and served only after an
owner-scoped lookup (D27/D34). R5 — view unchanged in what it derives. R6/R9/R10 — no UI, no Figma Make files.
R7 — Drive `appProperties.userId`, AI scoping and photo cache headers stay out (follow-ups). R8 — tests above.

## Specialist input used
- software-architect: adopted F1–F11 and R1 (required `auth` object, T-019.5 shape), R2 (userId-first + branded
  type), R3 (owner required in every mode, shared UUID helper, exit 2), R4 (foreign == nonexistent, DELETE item 204),
  R5 (photo DELETE 404, cap 2 per user / 3 global), R6, R7 (exclude `ai_settings` from the guard table list instead
  of allow-listing `ai/store.js`), R8 (compose single value), R9, R10 (one ticket; fallback seam refined below).
- database-optimizer: adopted A (migration steps, constraint names, lock, trigger-safe backfill, rollback text),
  B (statement shapes, guarded upsert, `insert … select` for wear), C (schema/migrator test lists, runtime recorder).
  Not adopted: owner check only when stragglers exist (A3 is stricter, per the ticket note); per-user 3 / global 12
  (A5); allow-listing `ai/store.js` (architect R7 instead); `appProperties.userId` in this slice (A6); "user_id = $n
  per table reference" in the static guard (per-literal `user_id` check plus the runtime recorder, A14).
- T-019.1 security review rec 2 (ticket note) → A3; rec 3 → `migrator.js` comment.

## Assumptions
- **A1 — Bundled release.** T-019.1 and T-019.2 ship in the same first release (D37 holds every T-019.1 release
  until Ming has an Identity account); the migrator applies expand then contract in one run. This supersedes the
  ticket's technical note "Needs T-019.1 released to production … before its contract migration ships". T-019.2
  merges to `main` without waiting for a release. The M-18 backup is the rollback. If Ming instead wants T-019.1
  released alone first, nothing in this plan changes except the release text (stragglers are then backfilled).
- **A2 — `TUDO_OWNER_SUB` is required in every mode, including dev `TUDO_ACCESS_DISABLED=1`** (no built-in dev
  constant). Missing → "TUDO_OWNER_SUB must be set", malformed/nil → "TUDO_OWNER_SUB must be a valid UUID"; exit 2;
  lowercased at the boundary; never printed. Tests inject `auth` directly.
- **A3 — The contract requires the owner whenever rows exist**, even with no stragglers, and asserts that all non-null
  `user_id`s across the five tables are one value equal to it (ticket note, security rec 2; stricter than the DB
  consult). Because migrate and app read the same compose value (A12), a successful contract also proves the app
  will run as the data's owner. Empty DB: no owner needed (CI, db smoke).
- **A4 — Foreign id answers the same as a missing id.** PUT item: foreign → 404 (a missing id is still created,
  PUT is an upsert); DELETE item: foreign → 204, data untouched (same as missing; the ticket requires 404 only for PUT
  and photos; avoids an existence oracle; resolves architect 204 vs. the "404" reading); wear ±1: foreign → 404 (as
  missing); photo PUT/DELETE/GET: foreign or missing item/photo → 404; photo DELETE with a stale photo id on one's own
  item stays 204. Behaviour change: photo DELETE for a missing item goes 204 → 404; the SPA only calls it right after
  saving the item (`src/data/repo.http.ts:84`), so it is not affected.
- **A5 — Photo cap: 2 in flight per user, 3 in total** (architect). The total stays at today's 3 (memory bound
  3 × 2 MiB unchanged); per-user 2 keeps one user from taking every slot. DB consult's 3/12 rejected (would raise
  memory 4× on the home server). Same 503 `photos_unavailable` + `Retry-After: 5`.
- **A6 — Drive `appProperties.userId` stays a follow-up.** It is one line, but the approved umbrella lists it under
  follow-ups, the DB is the authority, and it is not needed for authorization.
- **A7 — Production Postgres ≥ 15 is checked by Ming before the release** (new Ming step, proposed M-24, see
  *Ming verification*). CI runs 17. The migration guard makes a lower version fail safely.
- **A8 — Not image-rollback-safe.** Stated in the migration header, `db/migrations/README.md` and the PR description;
  see *Release and rollback*.
- **A9 — AI stays shared until T-019.3.** `server/ai/*` unchanged and not scoped; `ai_settings` is not in the guard
  table list (T-019.3 adds it); `initAi` keeps `requestAuth` = "Access verifier is on", so dev off mode keeps AI off.
- **A10 — Auth object shape** `{ authenticate(req) }` matches what T-019.5 needs; no `TUDO_AUTH_MODE` here.
- **A11 — `userId`-first parameters with a branded JSDoc `UserId`**, not `forUser` closures (architect R2); the
  branded type is enforced by `pnpm typecheck` (`checkJs` over `server/**/*.js`).
- **A12 — One owner value in compose** via a top-level `x-owner-sub` YAML anchor used by both services, so the
  release PR edits one line and migrate/app cannot differ.
- **A13 — Two-user tests in a new `server/isolation.db.test.ts`** (refines the umbrella's "`api.db.test.ts`" file name);
  `api.db.test.ts` only gets mechanical fixture changes and the photo-DELETE status change.
- **A14 — The static guard is per string literal** (a literal mentioning a TuDo table must mention `user_id`); its
  per-literal limit is documented in the test; the runtime recorder, the composite FKs and later RLS (T-019.4) are
  the backstops.
- **A15 — Size above the guide, kept as one ticket.** Estimate ≈ 1,000 changed lines: ≈ 450 production (migration
  ≈ 110 with header, `items.js`/`photos.js` ≈ 140, auth/app/api/index/user/inflight ≈ 130, script/compose/docs ≈ 50)
  and ≈ 550 tests, of which ≈ 200 are mechanical fixture updates (`user_id` in inserts, `access` → `auth`). Not split
  because migration, conflict target and tests are coupled and both parts ship in one release anyway (architect R10).
  Fallback seam in *Split proposal*.
- **A16 — Hotspots:** `compose.yml`, `scripts/check-image.sh`, `server/index.js`, `server/app.js` are also edited by
  T-019.3/.5/.9 (BACKLOG); no `IN_PROGRESS`/`REVIEW`/`DONE` ticket touches them (only the T-019 umbrella row is
  `IN_PROGRESS`). `src/App.tsx` is not touched.
- **A17 — Recommendation, not scope:** T-019.3 (per-user AI) should precede identity mode: make T-019.3 a dependency
  of T-019.5, or a precondition of M-21, so a second user never shares Ming's AI key. Likewise T-019.4 (RLS) before
  any multi-user sign-up reaches production, and T-019.6 must replace the `private, max-age=31536000, immutable` photo
  cache header before identity mode (shared browsers).
- **A18 — Migration version `20261114120000`**, after `20261113120000_user_ownership_expand`; no other open ticket
  adds a migration.
- **A19 — Write failures during the deploy swap** (old container vs. contract schema, seconds long) are accepted and
  documented; reads keep working.

## Blocking questions
None. Every open point has a default above (A1–A19); Ming can overturn any of them at plan approval.

## Split proposal
None by default (A15). Fallback if the first implement/review cycle runs over: **T-019.2a** = everything except the
migration (auth/owner config, scoped SQL with `user_id` written on every insert, guarded upsert, per-user cap, guard
test, isolation tests that do not need per-user uniques, image check, compose) — it runs on the T-019.1 expand schema
because every row is already owned and new code always writes `user_id`; the location upsert keeps `on conflict
(name)` with `where locations.user_id = excluded.user_id`. **T-019.2b** = the contract migration, the switch to
`on conflict (user_id, name)`, schema/migrator tests and the "same name for two users" test. No third migration is
needed; both still ship in the same release.
