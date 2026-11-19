# Impl log — T-028.2

## Attempt 1 — 2026-11-19

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/config.ts` | `AUTH_LOCK_NAME`, `AUTH_CHANNEL_NAME` |
| `src/features/auth/refreshLock.ts` (new) | Web Lock wrapper with fallback and wait timeout; also exports `Timers` / `defaultTimers` |
| `src/features/auth/authChannel.ts` (new) | BroadcastChannel wrapper + `parseAuthMessage` validation; exports `EndpointLike` for the test fakes |
| `src/features/auth/tokenStore.ts` | Lock-serialised renewal with double-check and broadcast, adopt, remote sign-out, proactive timer, `start()`, `signOut()` -> `{confirmed}`, `onRemoteSignOut` |
| `src/features/auth/identityClient.ts` | `/token` 15 s `AbortSignal.timeout` |
| `src/features/auth/AuthGate.tsx` | `store.start()`, remote sign-out handler, `logout_unconfirmed` notice with `signOutSeq` guard, resend 409 -> restore, `enterReady` only while `accountId()` is set |
| `src/features/auth/types.ts`, `SignInScreen.tsx`, `copy.ts`, `preview/AuthPreview.tsx` | Warning notice (R6 copy in `copy.ts`) and preview state |
| `src/features/auth/fakeTabs.ts` (new) | Test-only fake lock manager, channel hub, visibility doc |
| `src/features/auth/refreshLock.test.ts`, `authChannel.test.ts`, `tabs.test.ts` (new) | R8, AC1-AC4, AC7 |
| `src/features/auth/tokenStore.test.ts`, `AuthGate.test.tsx`, `AuthRoot.test.tsx`, `SignInScreen.test.tsx`, `identityClient.test.ts`, `boundary.test.ts` | New cases and the changes named in the plan |

### Tests added / changed
- refreshLock.test.ts: 6 cases (lock name, serialised, missing locks, throwing request, wait abort, rejection propagates).
- authChannel.test.ts: parseAuthMessage table (valid + 18 rejections, unknown fields not copied), subscribe/unsubscribe/close, no-op on missing/throwing channel.
- tabs.test.ts: 14 cases (AC1-AC4 incl. 900 s and 43200 s proactive renewal, hidden tab, transient retry, lifecycle).
- tokenStore.test.ts: waits for running renewal, `{confirmed}` table, broadcast before /logout, localStorage throws; extended no-token test; two changed cases as planned (`removes the id even when logout rejects`, `discards a late refresh`).
- AuthGate.test.tsx: remote sign-out (ready, restore, join), unconfirmed logout warning, confirmed logout has no warning, late unconfirmed logout ignored, resend 409; `logout failure still signs out` now expects the warning copy.
- SignInScreen.test.tsx, identityClient.test.ts, AuthRoot.test.tsx (BroadcastChannel stubbed), boundary.test.ts (two ALLOWED entries).

### Checks (actual output summary)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test: Test Files 135 passed | 11 skipped; Tests 1828 passed | 222 skipped
- build: built OK (vite)

### Out-of-plan files
None.

### Deviations from the plan
- `AuthGate.test.tsx` `setup()` injects only the fake channel hub, not the fake lock manager: with a real macrotask lock yield every existing sign-in case (microtask-only `act`) would need changing. Lock behaviour is covered in `tabs.test.ts`.
- `AuthGate.offerJoin` also returns when `store.accountId()` is null after the accounts lookup, so a remote sign-out during that lookup is not overwritten by a `not_member` error screen (one line, same feature).
- `join()` reuses a still-fresh token through the renewal double-check (no `/token`); in the real flow the token is null after `not_member`, so it still fetches.
- Auth preview 390 px / dark check (AC8) not run: no Playwright here; the notice reuses the existing themed `AuthNotice` (boundary test for theme variables is green). Ming/reviewer can open `/auth-preview` -> sign-in -> `logout_unconfirmed`.

### Follow-ups (noticed, not done)
- F1-F4 from plan.md unchanged.

### Scope self-check
- Could the diff be smaller? No; production code is about the planned size, the rest is tests.
- Diff size: see commit stat.

## Attempt 2 (REWORK at Ming's request: 3 yellow findings, PR stays one)

### Files touched
- `src/features/auth/copy.ts`: `logoutUnconfirmed` set to Ming's exact text (security S1).
- `src/features/auth/tokenStore.ts`: `arm()` waits at least `RETRY_MS` (15 s) before a proactive renewal, so a token with `expires_in <= 60 s` cannot renew at 0 ms in a loop (a token shorter than 15 s may expire first; `getToken` renews on demand). `onVisible` renews only when the tab has a token that went stale, not when `token === null`.
- `src/features/auth/AuthGate.tsx`: `offerJoin`, when the id is gone after the lookup, moves a still-`checking` view to sign-in (`session_invalid`); a remote sign-out has already moved the view and is left alone.
- `src/features/auth/boundary.test.ts`: `fakeTabs: []` in ALLOWED (security N4, one line).

### Tests added / changed
- copy.test.ts: exact text of the logout warning.
- tabs.test.ts: 30 s token makes no back-to-back `/token` calls (fake timers); visibility with no token does not renew.
- AuthGate.test.tsx: id cleared during the join lookup lands on sign-in, not a spinner.
- No test asserted the old copy literally (they use `AUTH_COPY`).

### Checks
- typecheck clean; format:check clean; test: Test Files 135 passed | 11 skipped, Tests 1832 passed | 222 skipped; build OK.

### Out-of-plan files
None. `work/tickets/T-028.2/ticket.md` (orchestrator's Notes/Attempts edit) included in the commit.

### Deviations
- The join-lookup test clears the id with `store.forget()` (no production path in the gate clears it there any more after the visibility fix).
