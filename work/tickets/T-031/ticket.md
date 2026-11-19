# T-031: Auth and server tidy-ups from T-028

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P3 |
| Size | S |
| Areas | security |
| Gate | plan-approval |
| Depends on | BUG-008 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | — |
| PR | — |

## Goal
Small hardening and cleanup items left by the T-028 reviews, done in one pass.

## Scope reference
D50; follow-ups in T-028.1, T-028.3 and T-028.4 review.md / security-review.md (PRs #89, #91, #92).

## Scope
- `identityClient.accounts()`: cap the email length (~320 chars); drop longer entries.
- Remove the now-unreachable `email_unverified` banner + resend from `SignInScreen` (and its tests).
- `server/README.md`: list 401 `unauthorized` and 503 `auth_unavailable` in the error-code paragraph.
- `server/me.js` / `api.js`: narrow the `ownerSub` JSDoc to `UserId | null`; braces on the new `match()` entry.
- `server/app.test.ts`: move `vi.restoreAllMocks()` in the log test to `afterEach`.
- `jwks.js`: `isUsableKey` typed instead of `any`; the single-flight test on a warm cache.

## Out of scope
- Behaviour changes beyond the list; SPA use of `/api/auth/me` (no screen needs it yet).

## Acceptance criteria
- [ ] Each item above done, with a test where behaviour changes (email cap; banner removal).
- [ ] No other behaviour change (existing tests green).
- [ ] All checks pass.

## Technical notes
- Files: `src/features/auth/identityClient.ts`, `SignInScreen.tsx`, tests; `server/README.md`, `server/me.js`, `server/api.js`, `server/jwks.js`, server tests.
- High paths (`server/**`, `src/features/auth/**`): plan approval.

## Notes / answers from Ming

## Handoff
