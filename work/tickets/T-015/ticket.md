# T-015: Switch the image and deploy from nginx to the Node server

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | T-013, T-011 |
| Needs Ming | M-11, M-12, M-13 |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/33 |

## Goal
The release image runs the Node server on :3000 (non-root), passes `check-image.sh`, and deploys with the DB
env file and the `migrate` step.

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
- Dockerfile (build SPA + server, runtime Node), `check-image.sh` and CI `image` job updated (health,
  SPA fallback, no secrets in image), `release.yml` build args reviewed (no `VITE_SUPABASE_*` in API mode).
- README "Deploy", D20 notes, M-4/M-10 superseded by the new runbook.

## Acceptance criteria
- [ ] CI builds and checks the new image; release flow unchanged otherwise.
- [ ] Image has no secrets; DB URL only at runtime from the env file.

## Notes / answers from Ming
Plan approved (Ming, 2026-11-11): A1 = option A (keep `VITE_SUPABASE_*` build args in T-015; drop in T-016); A2 manual M-14; A3 T-014 may run in parallel within the stated limits; A4 DB-backed in-image CI smoke = yes; A5–A15 as written.
- (2026-11-11, orchestrator) M-12 PR opened on Ming's request: https://github.com/mmlabs-online/deployment/pull/38 (tudocuatui DB + new deploy workflow; compose.yml not included).
- (2026-11-11, Ming, M-13) Cloudflare Access values (not secret): `CF_ACCESS_TEAM_DOMAIN=figen.cloudflareaccess.com`, `CF_ACCESS_AUD=dc2cd11d34339393549e3d3325512e49d2f44f8ae2dd0403ccf701152d77cfa7`. Put them in the compose `environment:` (A5 of T-013).
- (2026-11-11, from T-013) Set exactly `NODE_ENV=production`, never `TUDO_ACCESS_DISABLED`; `check-image.sh` passes dummy `CF_ACCESS_*` and asserts `/api` → 401; container needs egress to `<team>.cloudflareaccess.com`; healthcheck via `node -e fetch`; start command `node server/index.js`. Needs M-13 (AUD + team domain).
- (2026-11-10, from T-011) Needs M-11 (Cloudflare Access live) before the first Node release; image runs as a non-root `USER`; must honour `node server/migrate.js` + `/readyz` on :3000; add a Ming step to copy the draft `compose.yml` into the first `release/tudocuatui-v*` PR.
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff

### 2026-11-11 — claude — BLOCKED
- Done: software-architect consult (with orchestrator correction: production was built in Supabase mode); plan.md READY — Node runtime image, check-image.sh rewrite, CI image job with DB smoke, compose draft env, M-14 runbook for the first Node release.
- In progress / next: Ming approves A1–A15; A1 (keep/drop `VITE_SUPABASE_*`) changes what production shows.
- Gotchas: the first Node release must carry compose.yml in the same merge (M-14); egress to figen.cloudflareaccess.com is only checkable in M-14.

### 2026-11-11 — claude — DONE
- Done: plan approved (A1 = A, A2–A4 defaults); attempt 1 PASS; security no 🔴/🟡; image built and checked locally (local + Supabase-mode variants, DB smoke); PR #33 opened.
- In progress / next: Ming merges PR #33 (first CI build of the Node image), then runs M-14 (first Node release v0.2.0+, compose.yml merged together with release.env). Next ticket: T-014.
- Gotchas: production stays in Supabase mode until T-014/T-016; only M-14 step 6 verifies JWKS egress and the AUD.
