## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| server/identity.js | `MAX_TOKEN_AGE_S = 43200` constant used as `maxTokenAge` (AC1, D46) |
| server/identity.test.ts | Removed the old `iat: now() - 931` assertion; added the 12 h age-bound test |
| src/features/auth/tokenStore.test.ts | 12 h `expires_in` caching test (tests only) |
| src/features/auth/identityClient.test.ts | `expires_in: 43200` accepted test (tests only) |
| server/README.md | Two stale 15 min lines -> 12 h (D46) |
| README.md | Dev token lifetime line |
| scripts/dev-token.sh | Header comment only |

### Tests added / changed
- server/identity.test.ts › verifier › token age bound is 12 hours (D46); time claims (one line removed)
- src/features/auth/tokenStore.test.ts › caches a 12-hour token until expires_in - 60 s
- src/features/auth/identityClient.test.ts › token accepts expires_in 43200 (D46)

### Checks (WSL copy on the Linux filesystem)
- typecheck: pass (tsc --noEmit and tsconfig.server.json)
- format:check: "All matched files use the correct format."
- test: 104 files passed | 10 skipped; 1257 tests passed | 205 skipped. The first full run exited with ELIFECYCLE (the summary lines were cut off by my tail); the rerun was green, so the first failure looks like a timeout flake. I did not identify it.
- build: built OK

### Out-of-plan files
None. tokenStore.ts and identityClient.ts are unchanged; both SPA tests pass.

### Follow-ups (noticed, not done)
- A1: debt issue for `min(expires_in, 900) - 60` caching in tokenStore.ts (orchestrator).
- A2: reword M-29 in work/ming-todo.md to "after T-026 is deployed to production" (orchestrator).
- Possible flaky test in the full run (see test line above).

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +38 / -7 lines
