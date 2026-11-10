# T-015: Switch the image and deploy from nginx to the Node server

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | T-013, T-011 |
| Needs Ming | M-11, M-12 |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

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
- (2026-11-10, from T-011) Needs M-11 (Cloudflare Access live) before the first Node release; image runs as a non-root `USER`; must honour `node server/migrate.js` + `/readyz` on :3000; add a Ming step to copy the draft `compose.yml` into the first `release/tudocuatui-v*` PR.
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff
