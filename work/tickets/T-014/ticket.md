# T-014: HTTP `WardrobeRepo` and no-login mode in the app

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | ui, data |
| Gate | none |
| Depends on | T-013.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | claude@2026-11-11T06:44:58Z |
| PR | — |

## Goal
The deployed app reads and writes through `/api` with no login screen; local mode (Figma Make preview) is
unchanged.

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
- `createHttpRepo` implementing `WardrobeRepo` (R1), chosen when the app is served by the API (build/runtime
  flag decided in the plan); local repo unchanged.
- No AuthGate / sign-out in API mode; photo upload disabled with a clear "Sắp có" message until T-005.
- Tests with a fake fetch.

## Acceptance criteria
- [ ] All existing app tests pass in local mode; new tests cover the HTTP repo.
- [ ] No login screen in API mode; 390px and dark mode unchanged (R9).

## Notes / answers from Ming
- (2026-11-11, from T-013.2) API contract: snake_case view-shaped rows (reuse `rowToItem`/`itemToRow`); `PUT /api/items/:id` replaces the whole item, so always send every field (A16); client generates the UUID when `item.id` isn't one; wear sends `{ delta, today: localToday() }`; validation errors are `{error:{code:'invalid_input', field, reason}}` with `validate.ts` reason codes. See `server/README.md`.
- 2026-11-10: see D23. Single user, no auth in the app; Cloudflare Access protects the site.

## Handoff
