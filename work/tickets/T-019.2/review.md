# Review — T-019.2

## Attempt 1 — 2026-11-14
Verdict: PASS

### Checks (run by reviewer)
Throwaway local PostgreSQL 16.15 cluster (scram-sha-256 password auth, port 5441), `TEST_DATABASE_URL` set; stopped and
removed afterwards. Matches impl-log.md.
- typecheck: `pnpm typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json`) exit 0, no output.
- format:check: `pnpm format:check` exit 0.
- test: `pnpm test` — 987 passed (987), DB tests ran (isolation/migrator/schema/scoping re-run alone: 4 files, 59 passed, none skipped).
- build: `pnpm build` — `vite build` ok.
- `scripts/check-image.sh`: not runnable here (no Docker); reviewed by reading (see AC5).

### Hand-check on a seeded DB at the T-019.1 state
Fresh DB per case, first five migrations applied, then rows seeded (owned by A plus null-`user_id` stragglers in
`locations`, `items`, `item_photos`, `wear_logs`; a straggler item with a fixed `updated_at`), then `runMigrations` on
`db/migrations` with the GUC from `ownerSub`:
- GUC = A: applied; every row owned by A; straggler `updated_at` unchanged; `items_updated_at` `tgenabled = 'O'`;
  NOT NULL on the four tables, `ai_settings.user_id` nullable; constraints `locations_user_id_name_key`,
  `locations_user_id_id_key`, `items_user_id_id_key`, `locations_parent_fk … ON DELETE SET NULL (parent_id)`,
  `items_location_fk … SET NULL (location_id)`, `item_photos_item_fk`/`wear_logs_item_fk … CASCADE`; old `*_fkey` and
  `locations_name_key` gone; view def contains `l.user_id = i.user_id`; cross-owner item→location insert → 23503.
- Two owners (A + B rows, GUC A) → `migration 20261114120000 failed: rows belong to more than one owner`.
- Rows owned by A, GUC B → `… existing owner differs from TUDO_OWNER_SUB`.
- Rows, no GUC → `… rows exist but TUDO_OWNER_SUB is not set`.
- `ai_settings` row owned by B, GUC A → `… rows belong to more than one owner`.
- Every failure: no UUID in the message, no `detail`, contract version absent, `items.user_id` still nullable (rolled back).
- Empty DB, no GUC → applied.
- Guarded upsert: `saveItem(pool, B, <A's item id>, { …, location_name: "Tủ của B" })` → `null`; A's row byte-identical
  (incl. `updated_at`); location count unchanged (B's location rolled back); `getItem(pool, B, id)` → `null`;
  A saving its own id still works (`Áo dài mới`, `Tủ 1`).

### Acceptance criteria
- [x] Contract migration: NOT NULL, per-user uniques, composite FKs, PG ≥ 15 guard — evidence: new file only
  (`git diff --stat origin/main...HEAD -- db/migrations/2026111[0-3]*` empty); hand-check above; `schema.db.test.ts`
  "contract (T-019.2)" block and `migrator.db.test.ts` contract block green; PG guard at
  `db/migrations/20261114120000_user_ownership_contract.sql:30-35` (static test; cannot run PG < 15 here).
- [x] `ctx.userId` only from the auth layer; every query scoped — evidence: `server/app.js` passes `result.userId` from
  `auth.authenticate` only; `server/access.js` `createAccessAuth`/`createFixedAuth`; `access.test.ts` "createAccessAuth
  returns the owner and ignores x-user-id / query / body"; `isolation.db.test.ts` "body user_id is ignored"; branded
  `UserId` enforced by `pnpm typecheck`; `scoping.test.ts` (3 tests) and the runtime recorder test
  "every statement sent by the item and photo routes mentions user_id" green. Read every statement in `server/items.js`
  and `server/photos.js`: all carry `user_id = $n`.
- [x] PUT on another user's id → 404, original unchanged; photo GET/PUT/DELETE → 404 — evidence:
  `isolation.db.test.ts` tests at :122, :179, :193 green; guarded upsert hand-check above.
- [x] Per-user photo in-flight cap; sweep unscoped and keeps both users' files — evidence: `server/inflight.js`,
  `inflight.test.ts` (3 tests), `isolation.db.test.ts:207` (A's 3rd → 503 + Retry-After, B accepted),
  `photo-sweep.db.test.ts:100`; `photo-sweep.js` diff is a comment only.
- [x] Guard test fails on unscoped SQL; image check starts with `TUDO_OWNER_SUB` — evidence: `scoping.test.ts`
  negative fixtures + stale allow-list test; `scripts/check-image.sh:24` `ACCESS` carries a dummy v4 owner, so the app
  smoke (:119), db smoke (:160) and the Google/AI_KEK exit-2 cases (:108-109) start with an owner (and still fail for
  their own reason); new exit-2 cases :103-105 (no owner, malformed, nil). Read only; CI image job must confirm.
- [x] All checks pass — see Checks.

### Issues
None blocking.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: nothing under `src/` changed; local mode untouched. R2: one new migration, applied files
unchanged; RLS deferred to T-019.4 per D32 (plan); no `src/types/database.ts` in this setup. R3: `TUDO_OWNER_SUB` not
secret, not `VITE_*`, never printed (`index.cli.test.ts:49`). R4: photos served only after an owner-scoped lookup.
R5: view still derives stats. R6/R9/R10: no UI, no Figma Make files.

### Nits (do not block)
- `server/photos.test.ts` (+2 lines, `userId: OWNER_A`) is not in the plan's file table and impl-log says
  "Out-of-plan files: None"; it is a mechanical consequence of the `servePhoto` signature, so justified, but should be
  listed.
- The contract `lock table` covers four tables but not `ai_settings`, which the owner check also reads; harmless (the
  old app never writes `user_id`), could be added for symmetry.
- The SQL owner check does not lowercase the GUC; relies on `server/migrator.js` lowercasing via `toUserId` (it does).

### Ming verification after merge (carry into the PR)
- M-24: production Postgres ≥ 15 before the first release containing T-019.2.
- M-18: set the owner once in `x-owner-sub` (`deploy/deployment-repo/apps/tudocuatui/compose.yml`); take the `pg_dump`.
  With the anchor empty the app now exits 2, so no release from `main` may be cut before this (D37).
- After deploy: both migrations applied; `select distinct user_id` on the four tables = Ming's `sub`, no null;
  `\d items` shows `user_id not null` and `items_location_fk`; app works under Access.
- PR text: "not image-rollback-safe; rollback = fix forward or restore the M-18 backup".
- CI `image` job green (check-image.sh changes were not run locally).

### Follow-ups (out of scope)
- As in the plan: AI scoping (T-019.3), RLS (T-019.4), Drive `appProperties.userId`, photo cache header (T-019.6).
