## Attempt 1 — 2026-11-19
Verdict: PASS

### Checks (run by reviewer)
- `pnpm typecheck` — exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json` clean).
- `pnpm format:check` — exit 0.
- `pnpm test` — `Test Files 137 passed | 11 skipped (148)`, `Tests 1926 passed | 222 skipped (2148)`. Matches impl-log.
- `pnpm build` — `✓ built in 466ms`.

### Regression evidence (bug rule, D42)
- impl-log Attempt 1 records the failing run on unfixed code (`Tests 6 failed | 55 passed (61)`, `expected null to be '2222…'`).
- Reproduced by the reviewer: scratch worktree of HEAD under `scratchpad/rv-bug007/`, `src/features/auth/tokenStore.ts`
  replaced with `origin/main`'s, then `vitest run tabs.test.ts tokenStore.test.ts` → `Tests 6 failed | 55 passed (61)`:
  both `tabs.test.ts` BUG-007 tests and all four `tokenStore.test.ts` `it.each` rows fail with
  `AssertionError: expected null to be '22222222-2222-4222-8222-222222222222'`. Same output as impl-log.
- Per-site mutation check (reviewer): putting `storage.clear()` back at one site at a time, each site is caught by at
  least one new test:
  - renew `session_invalid` (`tokenStore.ts:163`) → `getToken session_invalid keeps another account's stored id`.
  - remote `signedOut` (`:228`) → `a third tab still on X …` (tabs.test.ts).
  - `forget` (`:288`) → `forget keeps another account's stored id`.
  - `signOut` (`:259`) → test 1, test 2 and the `signOut` row.
  - `join` `session_invalid` (`:332`) → `join session_invalid keeps another account's stored id`.

### Acceptance criteria
- [x] Regression test reproduces the bug (two stores sharing storage, A=X signs out after B continued as Y → storage
  still holds Y; fails on `main`, passes after) — evidence: `tabs.test.ts:359-381` (`BUG-007: A (X) signs out after B
  continued as Y …`), failing on `origin/main` tokenStore (reviewer run), passing on HEAD.
- [x] 1b. Same holds for the other clear sites — evidence: `tabs.test.ts:383-400` (third tab on X), `tokenStore.test.ts:498-523`
  (`it.each`: signOut, forget, getToken session_invalid, join session_invalid); all fail on `main`, pass on HEAD.
- [x] Signing out the stored account still clears it — evidence: existing tests unchanged in assertions and green
  (`session_invalid clears token and id and notifies`, `removes the id even when logout rejects`, `forget clears without
  logout`, `never writes anything but mm_account_id …`, `sign-out in A signs out B …`, AuthGate cases); new
  `tokenStore.test.ts:525-530` case-insensitive match still clears.
- [x] All checks pass — see above.

### Code review
- `forgetStored(gone)` (`tokenStore.ts:117-121`): reads storage, clears only when `gone` is non-null and matches the
  stored value case-insensitively (same `toLowerCase()` comparison as `onMessage` `:212` and `accountEmail`). Correct.
- Departing id is captured before nulling at every site: `onMessage` `const gone = id` (`:224`) before `reset()`/`id = null`;
  `signOut` uses the existing `gone` (`:250`); `forget` `const gone = id` (`:284`) first; renew uses `accountId` captured at
  `:126` (epoch check guarantees it is the current id); `join` calls `forgetStored(id)` (`:332`) before `id = null`, inside
  the `gen === generation` guard. Ordering is right on all five.
- No new storage keys: the only storage calls in `tokenStore.ts` are `read` (`:74`, `:119`), `clear` (`:120`) and the
  existing `write` (`:237`); the `boundary.test.ts` literal ban still passes.
- Behaviour change for a store with no id (`signOut`/`forget` no longer clear another tab's value) is the plan's
  approved assumption.

### Scope (R7)
Changed files: `src/features/auth/tokenStore.ts`, `tabs.test.ts`, `tokenStore.test.ts`, `work/tickets/BUG-007/impl-log.md`
— all in the plan's file list. High path `src/features/auth/**` was named in the plan and approved by Ming. No
out-of-plan change. Public `TokenStore` interface, epoch logic and channel posts unchanged.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R3: nothing new written to storage, no token involved. R7: in plan. R8: unit tests on the changed
store logic, regression test fails first (D42). R1, R4, R5, R6, R9: not affected.

### Blockers from review agents
- security-ai-generated-code-auditor (security-review.md, attempt 1): PASS, no 🔴/🟡. None.
