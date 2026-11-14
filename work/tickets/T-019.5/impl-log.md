
## Attempt 1 — 2026-11-14

### Files touched
| File | Required because |
|---|---|
| `server/identity.js` (new) | verifier, issuer config, fixed error codes (AC1, A11, A12) |
| `server/auth.js` (new) | `TUDO_AUTH_MODE` switch, `requestAuth`, `authLabel`, moved `Auth` typedefs (AC2) |
| `server/access.js` | typedef now imports from `auth.js` |
| `server/index.js` | uses `loadAuthConfig`/`createAuth`/`requestAuth`; exit 2 on config errors; `auth: ...` startup line |
| `server/app.js` | `authMode` dep, `/healthz` `auth`, `auth_denied` log (code only) |
| `server/ai/config.js` | comment only |
| `server/identity.test.ts` (new), `server/auth.test.ts` (new) | verifier and config matrix tests |
| `server/app.test.ts` | `/healthz` body, identity-mode cases |
| `server/index.cli.test.ts` | exit-2 and identity start cases |
| `server/scoping.test.ts` | recursive file list + list assertion |
| `scripts/check-image.sh` | `MM_IDENTITY_` prefix, 4 new `expect_exit 2`, `"auth":"access"` check, identity smoke container |
| `server/README.md`, `.env.example` | docs (names only) |

### Tests added / changed
- identity.test.ts: all rows of the plan table (verifier cases, remote JWKS cooldown/rotation, JWKS failures, `loadIdentityConfig`).
- auth.test.ts: config matrix, `requestAuth`, `authLabel`.
- app.test.ts: `/healthz` both modes, 11 routes x (no bearer, `Bearer x.y.z`) -> 401 with 0 pool calls, valid token -> canonical sub, log hygiene.
- index.cli.test.ts: bogus mode / missing / foreign / http issuer / identity+ACCESS_DISABLED -> 2; production identity start; identity + AI_KEK.
- scoping.test.ts: list contains `auth.js`, `identity.js`, `ai/store.js`, excludes `test/`.

### Checks (actual output summary)
Throwaway local Postgres 16 (scram-sha-256, fresh dir under /tmp, port 54329) was running for test and test:coverage; stopped and removed afterwards.
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test (with `TEST_DATABASE_URL`, DB tests included): 85 files, 1085 tests passed
- test:coverage: 85 files, 1085 tests passed (identity.js 98.6% lines)
- build: built OK
- `scripts/check-image.sh`: NOT run (needs Docker, unavailable here); only `bash -n` syntax check passed.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Unsecured (`alg: none`) tokens are rejected as `malformed` (empty signature fails the token shape) rather than `alg`; still fail closed.
- `check-image.sh` changes are unverified until the CI image job runs.

### Scope self-check
- Could the diff be smaller? No; test volume follows the plan's case list.
- Diff size: see `git diff --stat` (about +900 / -50 including new files and tests).
