# T-013: Node API server serving the SPA and `/api`

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P0 |
| Size | L |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | architecture, security, data |
| Gate | plan-approval |
| Depends on | T-012 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

## Goal
One Node/TypeScript server in the TuDo image serves the built SPA and a JSON `/api` backed by Postgres, covering
everything `WardrobeRepo` does today.

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
- Server (framework chosen in the plan; minimal deps) with endpoints for list/save/remove items, locations,
  wear ±1, import many; input validation; health/readiness (`/healthz`, `/readyz` with DB check).
- Parameterised SQL only; connection pool; no secrets in responses or logs.
- API tests against a real Postgres in CI.
- Photos: out of scope (T-005 re-plan); API returns no photo URLs yet.

## Acceptance criteria
- [ ] Every `WardrobeRepo` operation has an endpoint with tests.
- [ ] Invalid input → 400 with a code; DB errors never leak SQL or internals.
- [ ] Serves `dist/` with SPA fallback and correct caching (as nginx did in T-007).

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- (2026-11-10, orchestrator) Split per plan.md `## Split proposal`: this ticket delivers slice T-013.1 (server shell, static SPA serving = AC3, health, Access guard); AC1 + AC2 move to T-013.2.
- (2026-11-10, from T-011 security review) Validate the Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`: JWKS signature, `aud`, `iss`) — neighbours on the shared `web` network can reach the API directly. Provide `/readyz` with `select 1` on :3000, pg pool max 5, never log `DATABASE_URL`.
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff

### 2026-11-10 — claude — BLOCKED
- Done: software-architect consult; plan.md READY for slice T-013.1 (node:http server, static SPA, /healthz + /readyz, pool max 5, Cloudflare Access JWT via jose on /api/*, fail closed). T-013.2 created for the /api endpoints.
- In progress / next: Ming approves A1–A14 (A8–A14 fix the T-013.2 contract) and supplies the Access AUD + team domain via M-13 before T-015.
- Gotchas: never log DATABASE_URL/token; server must start without DATABASE_URL (T-015 smoke test); JWKS fetch needs container egress.
