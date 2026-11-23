## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| src/features/auth/tokenStore.ts | One `end(gone, broadcast)` teardown for signOut, forget, renew/join `session_invalid` (broadcast) and `onMessage` (no broadcast); `sessionAt` guard; `logoutOnce`; `signOut` returns `retry` when unconfirmed (AC1, AC3) |
| src/features/auth/authChannel.ts | `watchRemoved` fallback used only with no endpoint (AC2) |
| src/features/auth/accountId.ts | `ACCOUNT_ID_KEY`, `watchAccountIdRemoved` (AC2; boundary test allows localStorage only here) |
| src/features/auth/fakeTabs.ts | `createFakeStorageHub` for the fallback tests |
| src/features/auth/AuthGate.tsx | `onRetrySignOut` + `retryingSignOut`, retry ref guarded by `signOutSeq` (AC3) |
| src/features/auth/SignInScreen.tsx, types.ts, copy.ts | Retry button on the `logout_unconfirmed` notice, props, copy (AC3, R6) |
| src/features/auth/preview/AuthPreview.tsx | `logout_retrying` state and retry handler for the Playwright check (AC4) |
| tests (tokenStore, tabs, authChannel, accountId, AuthGate, SignInScreen) | T1-T20 |

### Tests added / changed
- tabs.test.ts: "session ends reach other tabs" (T1-T6), "no BroadcastChannel" (T12, T13); the `world().tab` helper gained a `fallback` option and a `join` mock.
- tokenStore.test.ts: "unconfirmed signOut: retry" (T7, T8 + the no-op-after-new-session guard), "session_invalid ends the epoch" (T14); two `toEqual({ confirmed })` false cases became `toMatchObject`.
- accountId.test.ts: watchAccountIdRemoved (T9, T10). authChannel.test.ts: storage fallback (T11).
- AuthGate.test.tsx: T15-T18. SignInScreen.test.tsx: T19, T20.
- T14 note: a "late token answer of the same epoch" cannot occur after renew's own rejection (single-flight), so the test asserts the observable result (id and storage cleared, no later /token request).

### Checks (actual output summary)
- typecheck: pass (tsc app + server).
- format:check: pass ("All matched files use the correct format").
- test: 2013 passed, 7 failed, 288 skipped. The 7 failures are the known pre-existing Windows ones on main: server/ai/tagPhoto.test.ts (3), server/api.test.ts (1), server/index.cli.test.ts (1), server/scoping.test.ts (1), src/features/auth/boundary.test.ts (1, path separator `src\main.tsx`), plus an unhandled `fetch failed` from tagPhoto.test.ts. Not touched. All new/changed auth tests pass.
- build: pass.

### AC4 one-off Playwright check (not committed)
- Playwright is not installed globally and has no downloaded browser here, so I installed `playwright` in the scratchpad (`scratchpad/pw`, outside the repo) and drove the installed Microsoft Edge (`channel: "msedge"`) against `pnpm dev --port 5199` at `/auth-preview.html`, sign-in screen, 390x844, light and dark, states `logout_unconfirmed` and `logout_retrying`. Dark was set by toggling the `dark` class on `<html>` (same as the preview checkbox).
- Result: button "Thử đăng xuất lại" 298x44 px (44 px target) inside the notice, no horizontal overflow (scrollWidth - innerWidth = 0) in all four cases; "Đang đăng xuất…" is disabled with opacity 0.6; dark text colour rgb(255,248,235) on the dark notice, light rgb(26,26,26).
- Screenshots (scratchpad, not committed): C:\Users\ttnminh\AppData\Local\Temp\claude\ad4729162467ccc8\0a20b6db-21ec-4934-96e5-07b6c81e7baa\scratchpad\{light,dark}-{logout_unconfirmed,logout_retrying}.png. The dev server was stopped afterwards.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- `.claude/loop.config.md` High paths omit `src/features/auth/**` (plan A11, already a BUG-008 follow-up).
- BUG-008 / T-031 overlap in AuthGate.tsx and SignInScreen.tsx: whichever lands second rebases (plan A6, A7). BUG-008 security finding 3 was not in the plan, so nothing was added for it.

### Scope self-check
- Could the diff be smaller? No; production changes are limited to the plan's file list.
- Diff size: see `git diff --shortstat` of the commit (production about +150, tests about +400).
