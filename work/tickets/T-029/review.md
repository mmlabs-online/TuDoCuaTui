## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
Run on `ticket/T-029` at f2dfc6a (includes the merge of origin/main 12cc5cb with BUG-008).
- `pnpm format:check`: green ("All matched files use the correct format", 353 files).
- `pnpm typecheck`: green (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- `pnpm test`: 2016 passed, 7 failed, 288 skipped; 1 unhandled error (`fetch failed` from server/ai/tagPhoto.test.ts). Every failure is Windows-specific and outside this diff:
  - server/ai/tagPhoto.test.ts (3) and server/api.test.ts (1): ECONNRESET / "other side closed" on the 413 body-limit tests.
  - server/index.cli.test.ts (1): SIGTERM exit code is `null` on Windows, not 0.
  - server/scoping.test.ts (1) and src/features/auth/boundary.test.ts (1): backslash paths (`ai\store.js`, `src\main.tsx`).
  - The diff changes no file under `server/` and does not touch boundary.test.ts. The boundary failure shows only `src\main.tsx` as a hit, so no new file outside the allowlist mentions features/auth. The failure lines match impl-log. I did not re-run origin/main separately (that needs a second checkout); the failure causes are platform-only and the diff cannot reach them, so they are not blockers.
  - The impl-log count (2013 passed) is 3 fewer than mine (2016). The difference comes from the BUG-008 tests merged after the implementer's run (the merge came after implementation). Not a mismatch in substance.
- `pnpm build`: green (vite build, 657 ms).
- `pnpm vitest run src/features/auth`: 407 passed, 1 failed (the boundary path-separator failure above).

### Acceptance criteria
- [x] AC1: a `session_invalid`, `forget()` or lost session in tab A signs out tab B on the same account. Evidence: tabs.test.ts › "session ends reach other tabs", 6 tests, all green:
  - "session_invalid on renewal in A signs out B on the same account"
  - "session_invalid from join in A signs out B; one signedOut posted"
  - "forget() in A signs out B"
  - "B on another account is not affected by A's session_invalid or forget"
  - "a received signedOut is not re-broadcast"
  - "a signedOut older than the tab's session start is ignored"
  - AuthGate.test.tsx › "T-029: lost sessions and retry sign-out" › "onAuthLost broadcasts signedOut for the lost account": green.
  - Code: tokenStore.ts `end()` is used by renew (`end(accountId, true)`), join (`end(id, true)`), forget, signOut, and onMessage (`end(id, false)`, guarded by `msg.at < sessionAt`).
- [x] AC2: with no BroadcastChannel, removing `mm_account_id` signs out only that account's tab via the storage event. Evidence, all green:
  - accountId.test.ts › watchAccountIdRemoved: "reports a removed UUID only" and "cleanup removes the listener; no window is a no-op".
  - authChannel.test.ts › "createAuthChannel without an endpoint (storage fallback) › subscribers get signedOut from watchRemoved; with an endpoint watchRemoved is not used; post writes nothing".
  - tabs.test.ts › "no BroadcastChannel": "A signing out / forgetting X signs out B on X via the storage event" and "X -> Y does not sign out B; removing Y leaves B on X alone".
  - `post` still writes nothing without an endpoint, so no token goes to storage (R3).
- [x] AC3: "Thử đăng xuất lại" calls `/logout` once per click and replaces the warning with "Bạn đã đăng xuất." on success. Evidence, all green:
  - tokenStore.test.ts › "unconfirmed signOut: retry" (3 tests: single-flight with parallel `retry()` gives one `logout`; storage is cleared only while it holds the id; a network failure means no post; `session_invalid` counts as confirmed; no-op once a session exists again).
  - AuthGate.test.tsx T16–T18 ("calls /logout once per click and shows Bạn đã đăng xuất. on success", "a failed retry keeps the warning and the button", "a late retry result after moving on changes nothing").
  - SignInScreen.test.tsx T19–T20.
- [x] AC4: 390 px and dark mode for the notice action (one-off Playwright). Evidence:
  - impl-log Attempt 1 › AC4 records 4 runs (light and dark × `logout_unconfirmed` and `logout_retrying`): button 298x44, no horizontal overflow, busy state disabled.
  - I opened `scratchpad/dark-logout_unconfirmed.png` and `scratchpad/light-logout_retrying.png`. The button sits inside the notice, the text is readable in dark mode, the busy label "Đang đăng xuất…" is dimmed, and nothing overflows at 390 px.
- [x] AC5: all checks pass. Evidence: format, typecheck and build are green. Test failures are only the pre-existing Windows/platform ones above, in files this diff does not touch.

Ming verification after merge (from plan.md; carry these in the PR):
- Two real tabs on the same account. In tab A, go Offline and sign out: tab A shows the warning with "Thử đăng xuất lại", and tab B shows "Bạn đã đăng xuất.". Go back online and press the button: the warning becomes "Bạn đã đăng xuất.", and after a reload the account is no longer offered under "Tiếp tục với …".
- Optional: "Dùng tài khoản khác" on the join or unverified screen in tab A sends tab B (same account) to "Bạn đã đăng xuất." (A1).

### BUG-008 interplay (orchestrator note 1)
- BUG-008 T1–T3 pass on the combined code (AuthGate.test.tsx › continue as):
  - "continue -> network -> retry -> not_member (no join) -> form + error, no list, accounts called once"
  - "restore: id cleared while the join lookup runs -> form + session_invalid + accounts re-listed"
  - "remote sign-out while the join lookup runs -> signed-out notice, no list, no re-list"
  - The whole file passes: 88/88.
- `offerJoin`'s `signOutSeq` guard (AuthGate.tsx:163-168) is still correct:
  - In the local tab, join's `session_invalid` now goes through `end(id, true)`. `end` posts only to other tabs and does not call this tab's `remoteListeners`, so it does not bump `signOutSeq`. The local `join` handler then calls `failTo(session_invalid)` as before (AuthGate.tsx:469).
  - In a second tab on the same account, the broadcast reaches `onRemoteSignOut`, which bumps `signOutSeq` and `joinSeq` (AuthGate.tsx:195-197). If that tab is inside `offerJoin`'s `accountEmail()` await, it sees `accountId() === null` with a changed seq and returns without `failTo`. That is exactly the case T3 guards.
  - `end()` now also bumps the store generation on join's `session_invalid`. So a pending `accountEmail()` in the same tab resolves `null` (tokenStore.ts `gen !== generation`), and `offerJoin` takes the `accountId() === null` branch. That path is unchanged and correct.
  - The `sessionAt` guard does not affect T3: setup restores through `renew` (not `adopt`), and the message carries `at: Date.now()`.
- Plan A6 said R1 would make BUG-008's race more reachable. The guard covers it.

### Scope
Every changed production and test file is in plan.md › Files to create / modify. Work files (`work/tickets/T-029/*`) are loop artefacts. No out-of-plan files. The diff changes no High path from loop.config.md (`server/**`, migrations, deploy). All production files are under `src/features/auth/**` (High per CLAUDE.md), and the plan gate covered that: Ming approved on 2026-11-23. The review-trigger list in loop.config.md does not include `src/features/auth/**`, so no security-review agent ran.

### Issues
None.

### Rules (CLAUDE.md)
No violations found.
- R1: `/logout` still goes only through `identityClient`, and no component calls `fetch`.
- R3: the storage fallback reads only the removal of the non-secret account id, and `post` without an endpoint writes nothing.
- R6: new copy is only in copy.ts (`retrySignOut`, `retryingSignOut`).
- R7: changes stay within the plan.
- R8: the new pure logic has unit tests (`end`, `logoutOnce`/`retry`, the watcher filter, the fallback).
- R9: AC4.
- R2, R4 and R5 do not apply.

### Blockers from review agents
None. The orchestrator ran `security-ai-generated-code-auditor` (Areas: security) in parallel; `security-review.md` attempt 1 has no 🔴 findings. 🟡 1 (retry completion after a same-tab re-sign-in, same race as nit 1 here) and 🟡 9 (BUG-008 finding 3, still latent) are follow-ups.

### Nits (do not block)
- tokenStore.ts `signOut` › `retry`: `id !== null` is checked only when the retry starts. Suppose this tab signs in again to the **same** account while a retry's `/logout` is still in flight (the sign-in form stays usable). Then the confirmed branch's `forgetStored(gone)` clears the new session's stored id, and the post signs out the other tabs. In practice the device-wide Identity logout invalidates that new session too, so the next renewal ends it anyway. A re-check of `id` before `forgetStored` would make this tidier.
- AuthGate.test.tsx T18 ("a late retry result after moving on changes nothing") covers only the `goto` path. Plan T18 also named a remote sign-out. The seq guard is the same code, so the risk is low.
- T14 asserts the observable result rather than the "late token answer" the plan described. impl-log explains why (renew is single-flight); that is acceptable.

### Follow-ups (out of scope)
- `.claude/loop.config.md` › High paths and Review triggers omit `src/features/auth/**`, which CLAUDE.md lists as High (already a BUG-008 follow-up; plan A11).
- T-031 must keep `onRetrySignOut`, `retryingSignOut` and T19–T20 when it edits SignInScreen (plan A7).
- With the new button, the `logoutUnconfirmed` text ("hãy kết nối mạng rồi đăng nhập và đăng xuất lại") now partly repeats the action. Copy review is for Ming (A5 kept it unchanged).
