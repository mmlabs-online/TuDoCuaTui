# Implementation log — BUG-008

## Attempt 1

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/AuthGate.tsx` | `failTo`: `clearAccounts()` in the retry and else branches (case 1). `offerJoin`: capture `signOutSeq` before the await; the "signed out meanwhile" branch calls `failTo({ code: "session_invalid" })` when the seq is unchanged (case 2). |
| `src/features/auth/AuthGate.test.tsx` | Tests T1, T2, T3 added to `describe("continue as")`; additions only. |

### Tests added
- T1 (regression): continue -> network -> retry -> not_member -> form + error, no list, accounts called once.
- T2 (regression): restore, id cleared during the join lookup -> form + session_invalid + accounts re-listed.
- T3 (guard): remote sign-out during the join lookup -> signed-out notice, no list, no re-list.

### Regression evidence (tests written first, run on unchanged AuthGate.tsx)
- T1 failed: `AssertionError: expected <button ...> to be null` (stale list shown).
- T2 failed: `Unable to find role="button" and name "Tiếp tục với me@b.co"` (no re-list).
- T3 passed on main (guard test, as planned).
- With the fix but without the `seq === signOutSeq.current` guard, T3 fails; restored afterwards. With the fix, AuthGate.test.tsx: 84 passed.

### Check results
- `pnpm format:check`: green (oxfmt run, no diff beyond the change).
- `pnpm typecheck`: green.
- `pnpm build`: green.
- `pnpm test`: 7 failed | 1995 passed. All failures are outside this change (server/api.test.ts, server/ai/tagPhoto.test.ts, server/index.cli.test.ts, server/scoping.test.ts, src/features/auth/boundary.test.ts: Windows path separators / socket resets). With my changes stashed the baseline is 8 failed | 1991 passed (same environment), so no new failures; all AuthGate tests pass.

### Out-of-plan files
None.

### Follow-ups
- Pre-existing Windows-only test failures listed above (not touched, R7).

### Scope self-check
Only the two planned files changed; about 5 product lines plus 44 test lines; no existing test edited.
