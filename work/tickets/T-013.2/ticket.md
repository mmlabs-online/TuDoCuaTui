# T-013.2: `/api` endpoints for every WardrobeRepo operation

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | architecture, security, data |
| Gate | plan-approval |
| Depends on | T-013 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | claude@2026-11-11T03:32:24Z |
| PR | — |

## Goal
Second slice of T-013 (split per `work/tickets/T-013/plan.md` `## Split proposal`): the JSON `/api` endpoints on the
T-013.1 server shell, covering everything `WardrobeRepo` does today, against the T-012 Postgres schema.

## Feature reference
Decision D23 (self-hosted Postgres + Node API, no in-app login, Cloudflare Access). Contract fixed by T-013 plan
assumptions **A8–A14** (approved with the T-013 plan): no bulk import endpoint; snake_case view-shaped rows;
`GET /api/items`, `GET /api/locations`, `PUT /api/items/:id` (client UUID, idempotent upsert, NFC location
get-or-create in one transaction), `DELETE /api/items/:id` (204 also when gone), `POST /api/items/:id/wear`
`{ delta, today }`; CSRF via JSON content type + `Sec-Fetch-Site`; `today` within ±1 day of Asia/Ho_Chi_Minh;
extra length caps; reason codes from `validate.ts`.

## Scope
- API router mounted on the T-013.1 shell; input validation; central DB error mapping; CSRF checks.
- Parameterised SQL only; never return or log pg error text, `DATABASE_URL` or tokens.
- API tests against a real Postgres (CI rule from T-012: no skipping when `CI` is set), incl. location NFC race,
  wear ±1 / `already` / 404, and an enum-drift test against `pg_enum`.
- Out of scope: client `HttpRepo` (T-014), image/compose (T-015), photos (T-005 re-plan).

## Acceptance criteria
- [ ] Every `WardrobeRepo` operation has an endpoint with tests.
- [ ] Invalid input → 400 with a code; DB errors never leak SQL or internals.

## Notes / answers from Ming
Plan approved (Ming, 2026-11-11): A15–A27 as written.
- (2026-11-11, from T-013 security review) Route only from the same raw `pathname` computed in `server/app.js`, inside the guarded `/api` branch (`server/README.md:20`); percent-decode individual segments (ids) only after the access check — never decode-then-route.

## Handoff

### 2026-11-11 — claude — BLOCKED
- Done: consult reused from T-013 (contract A8–A14 already approved); plan.md READY — five `/api` endpoints, validation, CSRF, DB error mapping, Postgres API tests; ~400 lines, no new deps.
- In progress / next: Ming approves new assumptions A15–A27. Then implement.
- Gotchas: route only from the raw `pathname` inside the guarded branch; ids never decoded; tests must not skip in CI.
