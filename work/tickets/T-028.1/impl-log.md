## Attempt 1 — 2026-11-19

### Files touched
| File | Required because |
|---|---|
| `server/jwks.js` (new, 149 lines) | Resolver with own cache over `createLocalJWKSet` (AC2-7). |
| `server/jwks.test.ts` (new, 248 lines) | Resolver unit tests (R8). |
| `server/identity.js` | `key_in_header` check, uses `createJwksResolver`, `unavailable: true`, `now`/`log` options. |
| `server/identity.test.ts` | Header, outage tests; two existing tests changed (below). |
| `server/auth.js`, `server/index.js` | `unavailable?` typedef; `createAuth(cfg, { log })` wiring. |
| `server/app.js` | 503 `auth_unavailable` + `Retry-After: 30` when `result.unavailable`. |
| `server/app.test.ts` | 503 test and `jku` 401 test. |
| `server/README.md` | Auth paragraph and code lists match new behaviour. |
| `src/data/apiErrors.ts`, `apiErrors.test.ts` | `auth_unavailable` Vietnamese copy (R6) + test. |
| `src/data/authFetch.test.ts` | Two 503 regression tests; `authFetch.ts` unchanged. |

### Tests added / changed
- Added: all tests listed in the plan (jwks.test.ts resolver suite incl. bad-response table; identity.test.ts key-carrying headers + 24 h outage; app.test.ts 503 and jku; authFetch 503 x2; apiErrors copy).
- Changed (existing, as allowed by the plan):
  1. `identity.test.ts` "embedded jwk/jku with an unknown kid": now expects `key_in_header` (was `unknown_kid`) and asserts the getter is never called. Stricter: token refused on header shape before any key lookup (D50).
  2. `identity.test.ts` "JWKS failures fail closed…": expected object gains `unavailable: true`; every failure response still fails. Test renamed accordingly.
  Also extended (additive): ENUM gains `key_in_header`; "failures are fixed codes only and never log" gains an unavailable-result assertion. The existing remote-JWKS cooldown test passes unchanged.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` no errors.
- format:check: "All matched files use the correct format. 326 files".
- test: Test Files 132 passed | 11 skipped (143); Tests 1766 passed | 222 skipped (1988).
- build: "✓ built in 1.14s".

### Out-of-plan files
None. (jwks.js additionally rejects a set containing a key whose `kty` is not EC/RSA/OKP/oct, because `createLocalJWKSet` accepts `{kty:"nope"}`; inside the planned file.)

### Follow-ups (noticed, not done)
- 403 does not sign out in `authFetch` (as in plan assumptions).
- org-admin-api `docs/consumers.md` still says ricotdin / 15 min.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: about +187 / -25 on tracked files, plus 397 lines in two new files.

## Attempt 2 (REWORK, 2026-11-19)

Fix per Ming's second note: keep only EC P-256 signing keys, ignore the rest, fail only when none are left.

### Files touched
- `server/jwks.js` — `KTYS` allowlist (rejected the whole set) replaced by `isUsableKey` filter (EC, P-256, `use` absent/"sig", `alg` absent/"ES256", non-null object); the filtered set goes to `createLocalJWKSet`; empty after filter = parse failure.
- `server/jwks.test.ts` — new "key filter" tests (EC + AKP/RSA/oct still verifies; only non-EC = parse failure; `use:"enc"`, `alg:"ES384"`, non-object entries ignored); renamed the single-flight test; the end-to-end test now really verifies the signature via `jwtVerify`.

### Tests
- The "invalid key" bad-response row (`{kty:"nope"}`) is unchanged: it still yields reason `parse` (no usable key left).

### Out-of-plan files
None. Follow-ups: none.

### Checks (Attempt 2)
- typecheck: no errors. format:check: 326 files, clean. test: Test Files 132 passed | 11 skipped; Tests 1769 passed | 222 skipped. build: built.
