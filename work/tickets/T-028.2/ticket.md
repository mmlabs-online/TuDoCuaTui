# T-028.2: Share the sign-in session across tabs and renew tokens before they expire

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Size | M |
| Milestone | M2 |
| Epic | E1 — Accounts |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-028.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-19T03:05:00Z |
| PR | — |

## Goal
Several TuDoCuaTui tabs stay in step: one renewal at a time, a token renewed in one tab is reused by the others, and signing out in one tab signs out all of them.

## Feature reference
"Sign in with mmlabs" consumer spec (reference ricotdin; contract org-admin-api `docs/consumers.md`, which wins on conflict); `work/decisions.md` D50 (what TuDoCuaTui adopts and where it differs), D31/D32 (rows keyed by `sub`), D37, D38 (owner sub), D46 (12 h tokens).

## Scope
- `/token` renewals serialised across tabs with a Web Lock (`navigator.locks.request("tudocuatui-auth-refresh", …)`), still single-flight per tab; fallback when Web Locks are missing.
- `BroadcastChannel("tudocuatui-auth")`: the renewing tab posts `{type:"token", accessToken, expiresAt, at}`; a tab that gets a 401 adopts a token another tab received in the last 10 s; `{type:"signedOut"}` signs out every tab. Messages are validated; tokens never leave memory.
- Proactive renewal timer 60 s before `exp` (tokens last 12 h, D46), plus the existing one retry after an API 401.
- Sign-out: drop the token, clear `mm_account_id`, broadcast, wait for a running renewal, then `POST /logout`; the epoch counter drops late answers; if `/logout` is not confirmed, the sign-in page warns (shared-computer note).
- 409 `email_already_verified` on resend → get a token.

## Out of scope
- Sign-in page account list (T-028.3); verifier (T-028.1).

## Acceptance criteria
- [ ] Two tabs (fake lock + channel): one `/token` call, both get the token.
- [ ] A 401 in one tab adopts a token broadcast within 10 s instead of signing out; older tokens are ignored.
- [ ] Sign-out in one tab signs out the other; a renewal answer arriving after sign-out is dropped.
- [ ] Renewal fires 60 s before expiry (fake timers).
- [ ] Unconfirmed `/logout` shows a warning on the sign-in page.
- [ ] Resend → 409 `email_already_verified` gets a token.
- [ ] No token in storage, URLs or logs; works when `localStorage`, Web Locks or BroadcastChannel are unavailable.
- [ ] 390px and dark mode for the warning; all checks pass.

## Technical notes
- High path (`src/features/auth/**`): plan approval; route to `security-ai-generated-code-auditor` at review.
- Files: `src/features/auth/tokenStore.ts`, `identityClient.ts`, `AuthGate.tsx`, new broadcast/lock helpers + tests.

## Notes / answers from Ming

## Handoff
