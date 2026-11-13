# T-019.8: CSP and HSTS for the SPA

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security |
| Gate | none |
| Depends on | T-019.7 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
Protect the in-memory token from XSS with a Content Security Policy, and add HSTS.

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.8). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.8, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] CSP header on SPA responses as in plan A20 (`connect-src 'self' https://api.mmlabs.online`, `img-src 'self' blob: data:`, Google Fonts).
- [ ] `Strict-Transport-Security` header.
- [ ] App and fonts still load; `static.test.ts` checks the headers; all checks pass.

## Technical notes
- Files (likely): `server/http.js`, `server/static.js`, tests

## Test plan
- See the umbrella plan *Tests to write* (T-019.8 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan.

## Handoff
