# T-019.7: SPA sign-in and sign-out with the Identity token

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E1 — Auth & Account |
| Areas | security, ui, architecture |
| Gate | plan-approval |
| Depends on | T-019.5, T-019.6, T-019.11 |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-13 |
| Claimed by | claude@2026-11-15T03:36:51Z |
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
- [ ] Verify-email waits for a button press (D36): the page parses and clears `#token`, shows a "Xác minh email" button, and sends the POST only on click (adds a `ready` state to the T-019.11 `VerifyEmailScreen`). Link scanners that run JavaScript must not spend the single-use token.
- [ ] Reuses the T-019.11 screens; all checks pass; 390px and dark mode.

## Technical notes
- Files (likely): `src/features/auth/*` (new), `src/data/repo.http.ts`, `src/main.tsx`, `src/App.tsx`

## Test plan
- See the umbrella plan *Tests to write* (T-019.7 rows).

## Notes / answers from Ming
- 2026-11-15: **Plan approved** (Ming, in session: "duyệt T-019.7"; A1–A16 as in plan.md, one ticket).
- 2026-11-15 (Ming): **M-25 done.** Turnstile public site key: `0x4AAAAAAF_LLtCloZlzY0MY` (public by design; goes into `src/features/auth/config.ts` as a constant per consult R8). Hostname `tudocuatui.mmlabs.online` registered on the widget and in org-admin-api `TURNSTILE_ALLOWED_HOSTNAMES`.
- 2026-11-15 (Ming, after the architect consult):
  1. **Bootstrap (consult F8):** Ming gets his mmlabs account and `sub` **through another registered app** (or an org-admin-api staff step); TuDo needs no change for that (M-17).
  2. **Turnstile:** **wait for the site key before implementing** — no merge with an empty key. Ming supplies the public site key paired with org-admin-api's `TURNSTILE_SECRET_KEY` and registers `tudocuatui.mmlabs.online` in the widget hostnames and org-admin-api `TURNSTILE_ALLOWED_HOSTNAMES` (M-25). The key goes in as a public constant (consult R8).
  3. **Keep one ticket** (no 7a/7b split).
  4. **`/verify-email` works in both access and identity mode** (consult R4), so Ming can verify his email (M-20) before identity mode.
- 2026-11-15 (T-019.6 security review — must keep): (1) unmount App on sign-out and account switch (e.g. `key={userId}` under AuthGate) or call `wardrobe.photos.clear()` before the next user's token is used; (2) pass a stable `getToken` that reads the current token (not a closure over one value); (3) pass it on App's first render in API mode (a later getter leaves the loader `null`). Bearer only in `Authorization`, only to `apiPhotoId`-validated same-origin `/api/photos/<uuid>`, `redirect: "manual"`, no query/cookie fallback; a 401 retry uses a fresh token, never loops, never leaks the token in errors; `item.photo` never holds a `blob:` URL; never reintroduce `max-age`/`immutable` on photos.
- 2026-11-13 (Ming): verify-email waits for a button press ("chờ bấm nút"), D36.
- 2026-11-13 (Ming): screens come from T-019.11 (UI first); this slice integrates them with the Identity API once org-admin-api is ready.
- 2026-11-13: umbrella plan T-019 approved (A1–A20 defaults). This slice still gets its own plan; it stops for plan approval (High tier).

## Handoff

### 2026-11-15 — claude — BLOCKED
- Done: consult (software-architect); Ming's answers recorded (sub via another app, wait for Turnstile key, one ticket, verify-email in both modes).
- In progress / next: Ming does M-25 (Turnstile site key + hostnames) and writes the site key under *Notes / answers from Ming*; then `/run T-019.7` plans (plan-approval gate) and implements.
- Gotchas: replace `src/features/auth/boundary.test.ts` with a per-file allowlist; `createHttpRepo` signature change touches many tests; identity mode can't run in `pnpm dev`.

### 2026-11-15 — claude — BLOCKED
- Done: M-25 recorded (site key), plan.md (Status READY) as one ticket per Ming: identityClient, tokenStore, authFetch (bearer + one 401 retry), detectRuntime + boot.ts (`takeVerifyHash` before `/healthz`), AuthRoot/AuthGate, VerifyEmailPage (`ready` state, works in access and identity), Turnstile (site key constant), sign-out, boundary allowlist; A1–A16. Plan A1 refers to merge-conflict markers the planner saw mid-merge; they were resolved before this commit (no markers in ticket.md).
- In progress / next: Ming approves the plan, then implement → review → PR. Ship with T-019.8.
- Gotchas: ~700 product + ~900 test lines; identity mode not runnable in `pnpm dev`.
