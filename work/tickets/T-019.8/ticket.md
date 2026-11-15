# T-019.8: CSP and HSTS for the SPA

| Field | Value |
|---|---|
| State | DONE |
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
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/55 |

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
- [ ] `/verify-email` (and `/reset-password`) are served with `Referrer-Policy: no-referrer`; `static.test.ts` checks it (T-019.7 plan A5).
- [ ] CSP allows Cloudflare Turnstile (`https://challenges.cloudflare.com` in `script-src` and `frame-src`) for sign-up (A8 changed).
- [ ] App and fonts still load; `static.test.ts` checks the headers; all checks pass.

## Technical notes
- Files (likely): `server/http.js`, `server/static.js`, tests

## Test plan
- See the umbrella plan *Tests to write* (T-019.8 rows).

## Notes / answers from Ming
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan.

## Handoff

### 2026-11-15 — claude — DONE
- Done: plan (READY, no gate), implement attempt 1, review PASS, security no 🔴 (Y1–Y3 🟡 non-blocking). PR https://github.com/mmlabs-online/TuDoCuaTui/pull/55.
- In progress / next: Ming merges; release together with T-019.7; check Turnstile for `style-src` violations in a real network.
- Gotchas: Turnstile could not be reached from the sandbox; shared token-page path list belongs in T-019.12.
