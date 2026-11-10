# T-012: Postgres schema and migration runner for the self-hosted database

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db, architecture |
| Gate | plan-approval |
| Depends on | T-011 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

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
- (2026-11-10, from T-011 review/security) Migration runner must be `node server/migrate.js` (D24), exit non-zero on failure, never log `DATABASE_URL` or connection options; schema follows D25 (no RLS while single-user/no-login).
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff
