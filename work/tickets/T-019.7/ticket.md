# T-019.7: SPA sign-in and sign-out with the Identity token

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, ui, architecture |
| Gate | plan-approval |
| Depends on | T-019.5, T-019.6, T-019.11 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-13 |
| Claimed by | — |
| PR | — |

## Goal
In API + identity mode the app shows a sign-in screen, keeps the token in memory only and sends it to `/api`.

## Feature reference
Slice of T-019 (umbrella plan `work/tickets/T-019/plan.md`, approved by Ming 2026-11-13 with A1–A20 defaults; section *Split
proposal* → T-019.7). Decisions D31–D34. Ming items in the plan are numbered one lower (plan M-16 = M-17 here).

## Scope
- As in the umbrella plan's *Split proposal* entry for T-019.7, and its *Files to create / modify* and *Tests to write* rows.

## Out of scope
- Anything assigned to another T-019 slice; follow-ups listed at the end of the umbrella plan.

## Acceptance criteria
- [ ] Ticket T-019 AC1 and AC3: sign-in until a valid `tudocuatui` token; sign-out revokes the account session; token never in storage, URLs or logs.
- [ ] Vietnamese copy for `not_member`, `email_unverified`, `session_invalid`, `turnstile_required`, `rate_limited`, `network` (one copy file).
- [ ] Reload restores the session silently via `mm_account_id`.
- [ ] Auth code is lazy-loaded only in API + identity mode; local mode untouched.
- [ ] Sign-up (`POST /auth/signup` with Turnstile token), `/verify-email` (fragment token, `Referrer-Policy: no-referrer`, `history.replaceState`) and resend are wired per org-admin-api `docs/consumers.md` (A8 changed, Ming 2026-11-13).
- [ ] Verify-email token rules (T-019.11 security review S2): `history.replaceState` removes `#token` before any network call; the token goes only in the POST body; it is never logged or rendered; the page is served with `Referrer-Policy: no-referrer` (T-019.8). Server error bodies are normalised before reaching the screens (`reasons` must be an array; internal copy keys are never accepted as codes). The sign-up form is reset or unmounted after success.
- [ ] Reuses the T-019.11 screens; all checks pass; 390px and dark mode.

## Technical notes
- Files (likely): `src/features/auth/*` (new), `src/data/repo.http.ts`, `src/main.tsx`, `src/App.tsx`

## Test plan
- See the umbrella plan *Tests to write* (T-019.7 rows).

## Notes / answers from Ming
- 2026-11-13 (Ming): screens come from T-019.11 (UI first); this slice integrates them with the Identity API once org-admin-api is ready.
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff
