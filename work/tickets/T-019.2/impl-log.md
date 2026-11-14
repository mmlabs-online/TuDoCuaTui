# Implementation log — T-019.2

## Attempt 1 — 2026-11-14

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261114120000_user_ownership_contract.sql` (new) | AC1: PG guard, lock, owner assertion + straggler backfill, NOT NULL x4, per-user uniques, composite FKs, view join |
| `db/migrations/README.md` | A8: not-image-rollback-safe exception, owner requirement |
| `server/user.js` (new) | `UserId` brand and `toUserId` (A2, A11) |
| `server/inflight.js` (new) | per-user + total photo cap (A5) |
| `server/migrator.js` | `parseOwnerSub` uses `toUserId`; comment that only `err.message` is printed |
| `server/access.js` | `ownerSub` in config (both modes), `createAccessAuth`, `createFixedAuth` |
| `server/index.js`, `server/app.js`, `server/api.js` | `auth` object, `userId` from auth layer only, passed to items/photos |
| `server/items.js`, `server/photos.js` | `userId` first param, every statement scoped, guarded upsert -> 404, photo DELETE 404, per-user cap |
| `server/photo-sweep.js` | comment only (global on purpose) |
| `server/README.md`, `.env.example` | `TUDO_OWNER_SUB` docs |
| `scripts/check-image.sh` | `ACCESS` carries `TUDO_OWNER_SUB`; three new `expect_exit 2` lines (not run here: needs Docker) |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | `x-owner-sub` anchor feeding app and migrate (A12) |
| `server/test/auth.ts` (new) | test-only `OWNER_A/B`, `fixedAuth`, `headerAuth` |
| Tests: see below | R8 |

### Tests added / changed
- New: `server/user.test.ts`, `server/inflight.test.ts`, `server/scoping.test.ts`, `server/isolation.db.test.ts` (10 tests incl. runtime statement recorder, per-user cap over HTTP).
- `server/access.test.ts`: owner config, `createAccessAuth` (ignores header/query/body user), `createFixedAuth`.
- `server/index.cli.test.ts`: owner missing/malformed/nil -> exit 2 in both modes, value not printed.
- `server/app.test.ts`: `access` -> `auth`; success passes `userId` (header/query cannot override).
- `server/schema.db.test.ts`: "contract (T-019.2)" block (23502, per-user names, cross-owner 23503, set-null/cascade, constraint names), view definition, NOT NULL test; fixtures carry `user_id`.
- `server/migrator.db.test.ts`: "contract (T-019.2)" block (backfill, no-owner, all-owned-no-owner, two owners / differing owner / ai_settings owner with constant messages, empty DB, static PG-guard check); expand-state tests pinned to a temp dir with the first five files.
- `server/photo-sweep.db.test.ts`: both users' files kept, unreferenced still a candidate.
- `server/api.db.test.ts`: fixtures with `user_id`; photo DELETE on a missing item -> 404.
- Mechanical (`access: null` -> `auth: fixedAuth(OWNER_A)`, `userId`): `app.db.test.ts`, `api.test.ts`, `photos.test.ts`, `ai/routes.test.ts`, `ai/tagPhoto.test.ts`.

### Checks (actual output summary)
Throwaway local Postgres 16 cluster (password auth, under /tmp, port 5439), `TEST_DATABASE_URL` set, stopped and removed afterwards.
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: 81 files, 987 tests passed (DB tests ran, none skipped).
- test:coverage: 81 files, 987 tests passed; all files 95.06 % statements.
- build: `vite build` ok.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `scripts/check-image.sh` changes are verified only by CI's image job (Docker not available here).
- Only PG 16 was available locally; CI runs 17. The migration needs >= 15.
- Per plan: AI scoping (T-019.3), RLS (T-019.4), Drive `appProperties.userId`, photo cache header (T-019.6).

### Scope self-check
- Could the diff be smaller? No: production code is ~450 lines as estimated; the rest is tests, ~200 of them mechanical fixtures.
- Diff size: +1323 / -179 lines (33 files, includes tests).
