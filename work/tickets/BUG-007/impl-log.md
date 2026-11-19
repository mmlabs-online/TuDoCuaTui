## Attempt 1 — 2026-11-19

### Files touched
| File | Required because |
|---|---|
| `src/features/auth/tokenStore.ts` | The fix: private `forgetStored(gone)` replaces all five `storage.clear()` calls (renew session_invalid, remote signedOut, signOut, forget, join session_invalid); departing id captured in `onMessage` and `forget`. High path (`src/features/auth/**`), plan approved by Ming. |
| `src/features/auth/tabs.test.ts` | `sharedStorage()` helper and `world().tab({ storage })`; regression tests 1 and 2. |
| `src/features/auth/tokenStore.test.ts` | `setup()` returns `setStored`; tests 3 (it.each x4) and 4. |

### Tests added / changed
- `tabs.test.ts › BUG-007: A (X) signs out after B continued as Y on shared storage -> storage still holds Y`
- `tabs.test.ts › BUG-007: a third tab still on X gets the remote signedOut and keeps Y in storage`
- `tokenStore.test.ts › BUG-007: %s keeps another account's stored id` (signOut, forget, getToken session_invalid, join session_invalid)
- `tokenStore.test.ts › BUG-007: a stored id differing only in case is still cleared` (passes before and after, guard)
- Fixture-only changes to existing tests (no assertion changed): `world().tab()` now builds a `sharedStorage` cell by default.

### Fail before the fix (tests written first, run on unfixed code)
`Tests 6 failed | 55 passed (61)` for tabs.test.ts + tokenStore.test.ts. Failing: both tabs.test.ts BUG-007 tests, and the four
tokenStore.test.ts `it.each` rows. Failure output, e.g. `AssertionError: expected null to be '22222222-2222-4222-8222-222222222222'`
at `expect(shared.value()).toBe(ID2)` (tabs.test.ts) and `expect(s.stored()).toBe(ID2)` (tokenStore.test.ts). The case-insensitive test passed.

### Pass after the fix
Same two files: all green; full suite below.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean (exit 0)
- format:check: "All matched files use the correct format."
- test: `Test Files 137 passed | 11 skipped (148)`, `Tests 1926 passed | 222 skipped (2148)`
- build: `✓ built in 465ms`

### Out-of-plan files
None.

### Deviations
- The helper's JSDoc says "the stored account id", not `mm_account_id`: `boundary.test.ts` (existing) forbids that literal in `tokenStore.ts` (first run failed on it).
- Test 1 awaits `a.store.getToken()` before B continues, and uses `void b.store.continueAs` + `settle()` (fake timers).

### Follow-ups (noticed, not done)
- None.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: +108 / -12 lines (tokenStore.ts +12/-6).
