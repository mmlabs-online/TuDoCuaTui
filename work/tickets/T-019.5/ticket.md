# T-019.5: Identity JWT verifier and TUDO_AUTH_MODE switch

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-019.2 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-13 |
| Claimed by | claude@2026-11-14T18:45:52Z |
| PR | — |

## Goal
The Node server can verify mmlabs Identity access tokens, selected by `TUDO_AUTH_MODE` (`access` stays the production default until M-21).

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.5). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.5, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] Verifier follows `consumers.md` (A11, A12): ES256 only, exact `iss`, `aud=tudocuatui`, `typ=at+jwt`, required claims, `email_verified === true`, UUID `sub`, a `tudocuatui:` role; unit tests for every failure case incl. unknown `kid` refetch cooldown.
- [ ] `TUDO_AUTH_MODE` validated; bad or missing config in production → exit 2.
- [ ] `/healthz` → `{status:"ok", auth}`; logs carry only the error `code`, never the token or claims.
- [ ] All checks pass.

## Technical notes
- Files (likely): `server/identity.js` (new), `server/app.js`, `server/index.js`, tests

## Test plan
- See the umbrella plan *Tests to write* (T-019.5 rows).

## Notes / answers from Ming
- 2026-11-14: **Plan approval waived** (Ming, in session: "bỏ qua bước xem plan T-019.5"). If plan.md comes back READY with no new High-tier decision beyond the approved umbrella plan (A4, A11, A12; D31, D33–D37) — in particular no new Ming step, secret or env var other than the planned `TUDO_AUTH_MODE` / `MM_IDENTITY_ISSUER`, and no choice among the F8/F9 options that the plan leaves to Ming — the loop goes straight to implement; otherwise it stops and asks.
- 2026-11-14 (T-019.4 security review): reject a non-canonical `sub` in the auth layer before any repo call (`withUser` throws → 500, not 401); any auth/session/provisioning table needs RLS + FORCE + a policy in the same migration (catalog test enforces), and pre-auth lookups must not use a broad permissive policy keyed on a request-influenced GUC; auth middleware must not open a `withUser` that a handler nests inside (nesting guard).
- 2026-11-14 (T-019.3 security review F8/F9): (1) with open sign-up ~15–20 accounts can exhaust the global AI ceilings (test 300/h, save 600/h, tag 2000/24h) and every user, Ming included, gets 429 — decide in this plan: owner budget, per-IP dimension, or a sign-up gate. (2) Two accounts with slow uploads can hold both tag-photo slots (body deadline 30 s, provider 45 s) — shorter tag body deadline (e.g. 10 s for ≤ 2 MiB), per-IP cap, or the same gate. (3) Change `initAi`'s `requestAuth` (`server/index.js`, comment `server/ai/config.js:22`) to "auth mode is access or identity".
- 2026-11-14 (T-019.2 security review): (1) map the JWT `sub` through `server/user.js` `toUserId`, never the raw claim. (2) Before identity mode, rate-limit photo PUTs per IP/user or shorten the body deadline: with the cap 2/user, 3 total and a 30 s body deadline, two stalled uploaders block everyone (503). (3) `scoping.test.ts` scans only `server/*.js` and `server/ai/*.js` — a new `server/auth/` must be covered.
- 2026-11-14 (T-019.2 plan A17, recommendation): do not switch production to identity mode (M-21) before T-019.3 is merged — until then `ai_settings` is one shared row, so every Identity user would use Ming's AI key. Keep `initAi`'s `requestAuth` meaning "requests are authenticated" when adding `TUDO_AUTH_MODE`.
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
