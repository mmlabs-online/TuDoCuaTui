# T-016: Remove Supabase from the app

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-014, T-015 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

## Goal
No Supabase client, auth, Storage, Edge Function or `VITE_SUPABASE_*` code remains once the API mode is live.

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
- Remove `src/lib/supabase.ts`, the Supabase repo and tests, AuthGate (or keep behind a flag if the plan
  argues for it), Supabase types, `supabase/` folder (migrations, tests, functions) — decided in the plan;
  update README, risk tiers, CLAUDE.md wording proposal for Ming.
- Close/park PR #28 is Ming's call.

## Acceptance criteria
- [ ] `grep -ri supabase src` returns only intentional references (none in runtime code).
- [ ] All checks pass; local mode and API mode work.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- (2026-11-11, Ming) No data migration from Supabase to Postgres is needed (answers T-012 A9 / T-014 A11). T-016 can remove the Supabase path without a data-export step. Ming cuts the M-14 release himself.
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff

### 2026-11-11 — claude — BLOCKED
- Done: software-architect consult (+ orchestrator note: Ming did sign in on the Supabase-mode production); plan.md READY — remove all Supabase code/deps/scripts/CI/release args, two modes (local | api), legacy `sb-*` key cleanup, hand-written row types; one ticket.
- In progress / next: Ming approves A1–A6 (A3 lets T-016 edit .claude/commands/run.md + solo.md security triggers). Production is still nginx v0.1.4 until mmlabs-online/deployment#40 merges.
- Gotchas: never clear `tu-do-items` / `tu-do-theme`; don't touch deploy/, server/, db/; keep the release.env-only guard.
