# T-011: Register a `tudocuatui` database on the shared Postgres

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | db, security |
| Gate | plan-approval |
| Depends on | T-007 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

## Goal
The shared Postgres has a `tudocuatui` role + database, and the TuDo deploy gets a `DATABASE_URL` on the Mac
without any secret in the TuDo repo — the same way org-admin-api does.

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
- Drafts in `deploy/deployment-repo/` (like T-007): run `bash postgres/scripts/add-app-db.sh tudocuatui` in the
  deployment repo (Ming step or setup PR), update `apps/tudocuatui/compose.yml` to join the external `db`
  network and read `env_file: ~/.config/tudocuatui/tudocuatui.env`, and extend `deploy-tudocuatui.yml` to write
  `DATABASE_URL` from `postgres/secrets/apps/tudocuatui.password` (pattern of deploy-org-admin-api) and to run a
  one-shot `migrate` service before replacing the app.
- Ming runbook (new M-item) for the deployment-repo PR.

## Acceptance criteria
- [ ] The drafts follow org-admin-api's pattern (env file outside the checkout, `migrate` profile, `db` + `web`
      networks, no published ports).
- [ ] No password or URL value in the TuDo repo (R3).
- [ ] Runbook lists the exact deployment-repo steps.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff

### 2026-11-10 — claude — BLOCKED
- Done: database-optimizer consult; plan.md READY (drafts + M-12 runbook + D24; migrate guarded by compose `--profile migrate config --services`; new compose ships with T-015's first Node release).
- In progress / next: Ming approves the plan (A1–A9) and decides P1 (R2/RLS wording, proposed D25 — needed before T-012 is planned). Then implement.
- Gotchas: deployment repo already pins an nginx `release.env` (risk R-b); setup branch must not start with `release/`; never read `postgres/secrets/`. T-015 needs `Needs Ming: M-12`.
