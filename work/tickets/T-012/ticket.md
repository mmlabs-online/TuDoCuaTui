# T-012: Postgres schema and migration runner for the self-hosted database

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db, architecture |
| Gate | plan-approval |
| Depends on | T-011 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/30 |

## Goal
A plain-Postgres schema for items, locations, photos (references) and wear logs, plus a migration runner the
`migrate` one-shot service runs on deploy.

## Feature reference
Decision **D23 (2026-11-10)**: TuDo moves its data from Supabase to the shared self-hosted Postgres in
`mmlabs-online/deployment` (`postgres/`, network `db`, one database + role per app), served by a small Node
API in the same image as the SPA. **No in-app login for now**; access is restricted by **Cloudflare Access** in
front of `tudocuatui.mmlabs.online` (Ming's dashboard step, M-11). Photos will go to Google Drive via the
backend (T-005 chain, re-planned). Supabase work (PR #28 / T-009, T-010, F-701, F-702, T-005.x) is paused and
re-planned on the new backend. Ming 2026-11-10: "move sang xài Postgre database có sẵn trên repo deployment,
tạm thời không cần authen nữa"; backend "Node API cùng image"; access "Cloudflare Access".
Reference (read-only): `/home/user/deployment` — `postgres/compose.yml`, `postgres/scripts/add-app-db.sh`,
`postgres/sql/app-db.sql`, `apps/org-admin-api/compose.yml`, `.github/workflows/deploy-org-admin-api.yml`.

## Scope
- New `db/migrations/` (or similar) with plain SQL: tables from the Supabase schema without `auth.uid()`,
  RLS policies or `user_id` (single user, D23); keep the `items_with_stats` view semantics (R5: derived values
  from wear logs, never stored) and the existing constraints/enums.
- A small, dependency-light migration runner (applied-migrations table, transactional, idempotent).
- Tests against a real Postgres in CI (service container).
- Supabase migrations stay untouched for now (removed in T-016).

## Acceptance criteria
- [ ] Fresh DB → all migrations apply; re-run is a no-op.
- [ ] Schema supports everything `WardrobeRepo` needs (items, locations, wear +1/−1 with one-per-day, stats view).
- [ ] CI runs the migration tests against Postgres 17.

## Notes / answers from Ming
Plan approved (Ming, 2026-11-10). Assumption 9 (Supabase data migration) not answered: default kept — no data migration in T-012; ask again before T-016.
- (2026-11-10, from T-011 review/security) Migration runner must be `node server/migrate.js` (D24), exit non-zero on failure, never log `DATABASE_URL` or connection options; schema follows D25 (no RLS while single-user/no-login).
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff

### 2026-11-10 — claude — BLOCKED
- Done: consults (database-optimizer, software-architect); plan.md READY — timestamped SQL migration, unprefixed schema, plain-ESM `server/migrate.js` runner (per-file tx, session advisory lock, checksums, exit 0/1/2), Postgres 17 tests in CI.
- In progress / next: Ming approves the plan (assumptions 1–10, incl. new `pg` dependency and whether Supabase holds real data to move). Then implement.
- Gotchas: never log DATABASE_URL; tests must not skip in CI; T-013 must set the pg `date` parser and keep `seasons` as text[].

### 2026-11-10 — claude — DONE
- Done: plan approved; attempt 1 PASS; attempt 2 fixed two 🟡 security items at Ming's request (tx guard, CI pipefail); re-review PASS, security no 🔴/🟡; PR #30 opened.
- In progress / next: Ming merges PR #30 (watch first CI run on Postgres 17). Next ticket T-013 (Node API).
- Gotchas: local tests ran on PG 16.15 (no Docker daemon); A9 (Supabase data to move?) still open before T-016.
