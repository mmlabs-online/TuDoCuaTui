# T-013.2: `/api` endpoints for every WardrobeRepo operation

| Field | Value |
|---|---|
| State | BACKLOG |
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
| Claimed by | — |
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

## Handoff
