## Attempt 1 — 2026-11-19

### Files touched
| File | Required because |
|---|---|
| server/me.js (new) | pure `meBody` (AC1-3) |
| server/me.test.ts (new) | unit tests for `meBody` (R8) |
| server/identity.js | verifier returns `email` (string or null) on success |
| server/auth.js | `AuthResult` ok branch carries `email` |
| server/app.js | passes `email` and `ownerSub` into `handleApi` (guard unchanged) |
| server/api.js | route match `/api/auth/me` (GET), handled before the uuid and pool checks |
| server/test/auth.ts | stubs return `email` |
| server/identity.test.ts | happy-path expectation gains email; new email-claim test |
| server/app.test.ts | `start()` stub email; `startIdentity` optional `ownerSub`; 7 new tests; route added to the 401 list |
| server/README.md | endpoint table row |

### Tests added / changed
- server/me.test.ts: owner / other + null owner / exact shape + email null
- server/identity.test.ts: ok result carries email; absent, empty, non-string -> null (changed: happy path expects email)
- server/app.test.ts › identity auth: me 200 user + no-store + no pool call; owner role; no email claim; 503 JWKS unavailable; 405 Allow GET (POST/PUT/PATCH/DELETE/HEAD); logs hold only the route line, console untouched; path variants 404; `/api/auth/me` added to the 401 list (changed)

### Checks (actual output summary)
- typecheck: green (tsc app + server)
- format:check: "All matched files use the correct format."
- test: 137 files passed, 11 skipped; 1883 tests passed, 222 skipped (the skipped ones are the Postgres-dependent suites, skipped as before)
- build: built in 534ms

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- SPA consumer for `/api/auth/me` when a UI needs it (WardrobeRepo method then).
- server/README.md error-code paragraph does not list 401 `unauthorized` / 503 `auth_unavailable`.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +330 / -8 lines incl. tests.
