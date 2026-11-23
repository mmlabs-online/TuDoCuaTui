## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check`: green ("All matched files use the correct format", 353 files).
- `pnpm typecheck`: green (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- `pnpm build`: green (built in 654ms).
- `pnpm test` on the branch: 7 failed | 1995 passed | 288 skipped. All 7 failures are pre-existing and environmental (Windows), not caused by this diff:
  - Reviewer ran the full suite on a clean `git archive origin/main` copy, same machine: 6 failed | 1993 passed. The failing tests are the same files and the same tests: `server/api.test.ts` (256 KB body), `server/ai/tagPhoto.test.ts` (2 MB upload guards, in-flight cap), `server/index.cli.test.ts` (entry point), `server/scoping.test.ts` (file list), `src/features/auth/boundary.test.ts` (`expected [ 'src\main.tsx' ] to deeply equal []`, a Windows path separator problem).
  - The one extra failure on the branch run (`tagPhoto.test.ts › 413 for a declared length over 2 MB`) is flaky. Run alone, `tagPhoto.test.ts` fails the same 3 tests on both the branch and origin/main, twice each. `git diff origin/main...HEAD -- server` is empty.
  - `src/features/auth/AuthGate.test.tsx`: 84 passed.
  - The implementer's numbers match the reviewer's branch run (7 failed | 1995 passed). Their "8 failed" stash baseline is within the same flakiness.

### Acceptance criteria
- [x] Case 1 regression test fails on `main` before the fix. Evidence: test T1, `AuthGate.test.tsx › continue as › continue -> network -> retry -> not_member (no join) -> form + error, no list, accounts called once`. It passes on the branch. Against origin/main's `AuthGate.tsx` it fails with `AssertionError: expected <button …> to be null` (stale list). Reviewer ran this.
- [x] Case 2 regression test (id cleared during the join lookup → accounts re-listed). Evidence: test T2, `… › restore: id cleared while the join lookup runs -> form + session_invalid + accounts re-listed`. It passes on the branch. Against origin/main's `AuthGate.tsx` it fails with `Unable to find role="button" and name "Tiếp tục với me@b.co"`. Reviewer ran this.
- [x] Plan criterion 3 (no A2 regression from the reroute). Evidence: test T3, `… › remote sign-out while the join lookup runs -> signed-out notice, no list, no re-list`. It passes on the branch and on main. With the `seq === signOutSeq.current` guard removed (branch `AuthGate.tsx` with only that line changed), T3 fails. Reviewer ran this.
- [x] All checks pass, and no existing test changed. Every check is green except the pre-existing environmental failures above, which are identical on origin/main. `git diff origin/main...HEAD -- src/features/auth/AuthGate.test.tsx` has 44 insertions and 0 deletions.

Ming verification after merge (not verified by the reviewer; carry into the PR):
- Optional, on the deployed app: start on a cold sign-in page with an account listed. Go offline, click "Tiếp tục với …", go back online and press "Thử lại". If Identity answers `not_member`, the form should show the error with no "Tiếp tục với" list.

### Issues
None.

### Code review notes
- `AuthGate.tsx:141-147`: `clearAccounts()` is added only in the `retry` and `else` branches. The `email_unverified` branch (:131-135) and the `session_invalid` branch (:136-140) are unchanged, as the plan says. `clearAccounts` bumps `listSeq`, so a pending cold `/accounts` answer is dropped.
- `AuthGate.tsx:157-163`: `seq` is captured before `await store.accountEmail()`. The other bump sites (:247 own sign-out from `ready`, :295 `goto`, :311 `signIn`, :408 `continueAs`) cannot run while the view is `checking`, apart from the remote handler (:190), which is the race the guard exists for. `continueAs` bumps the seq before it reaches `offerJoin`, so the captured value is already current. `live()` still covers unmount and restore-effect cleanup. The `try`/`catch` and the join / `not_member` paths are unchanged.
- `failTo({ code: "session_invalid" })` never reaches the `email_unverified` branch, so its `store.accountId()` check does not matter here.
- No UI, copy or layout change (R6, R9 not affected). No data access change (R1).

### Rules (CLAUDE.md)
No violations found. R7: only the two planned files changed, plus ticket and impl-log bookkeeping. R8 / D42: the regression tests fail first, as verified above. The diff touches a High path (`src/features/auth/**`), and the plan names it; the plan gate was approved by Ming on 2026-11-23.

### Blockers from review agents
None. `security-review.md` attempt 1 has no 🔴 findings (🟢 1, 2, 4, 5; 🟡 3 is a latent follow-up).

### Nits (do not block)
- `AuthGate.tsx:161`: the comment is a single line of about 170 characters. Optionally wrap it. oxfmt accepts it as is.

### Follow-ups (out of scope)
- Pre-existing Windows-only test failures: `boundary.test.ts` and `scoping.test.ts` (path separators), `api.test.ts`, `tagPhoto.test.ts` and `index.cli.test.ts` (socket resets / process signals). They make `pnpm test` red on Windows for every ticket. Worth a `debt` issue if none exists.
- From the plan: `.claude/loop.config.md` › High paths does not list `src/features/auth/**`, while `CLAUDE.md` › Risk tiers does. Align them.
