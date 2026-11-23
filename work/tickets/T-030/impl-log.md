
## Attempt 1 — 2026-11-23

### Files touched
| File | Required because |
|---|---|
| work/decisions.md | AC 1: new row D55 |
| src/data/authFetch.ts | Doc comments only (onAuthLost, createAuthedFetch); no runtime change |
| src/data/authFetch.test.ts | AC 2: two 403 tests |
| src/data/repo.http.test.ts | AC 2: 403 forbidden_origin -> ApiError test |

### Tests added / changed
- authFetch.test.ts › 403 is passed through: no retry, no onAuthLost
- authFetch.test.ts › 401 then 403 on the retry -> 403 returned, no onAuthLost
- repo.http.test.ts › identity mode › 403 forbidden_origin → ApiError(403, forbidden_origin); no onAuthLost
(Pass against current code by design: option (a) pins existing behaviour.)

### Checks (actual output summary)
- typecheck: pass
- format:check: All matched files use the correct format.
- test: 7 failed | 1998 passed | 288 skipped. All 7 are the known pre-existing Windows failures on main (server/ai/tagPhoto.test.ts x3, server/api.test.ts, server/index.cli.test.ts, server/scoping.test.ts, src/features/auth/boundary.test.ts); new tests pass.
- build: pass

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- None.

### Scope self-check
- Could the diff be smaller? no
- Diff size: +39 / -2 lines (before this log)
