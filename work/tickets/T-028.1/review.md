Verdict: PASS

## Attempt 1 — 2026-11-19

### Checks (run by reviewer)
- `pnpm typecheck` — `tsc --noEmit && tsc -p tsconfig.server.json`, no errors.
- `pnpm format:check` — "All matched files use the correct format." (326 files).
- `pnpm test` — Test Files 132 passed | 11 skipped (143); Tests 1766 passed | 222 skipped (1988). Matches impl-log.
  Targeted run (`jwks`, `identity`, `app`, `authFetch`, `apiErrors` tests): 5 files, 98 tests passed.
- `pnpm build` — "✓ built" (vite).

### Acceptance criteria
- [x] 1. `jku`/`x5u`/`jwk`/`x5c` → 401 `key_in_header`, also for empty values and valid `kid`/key; getter not consulted —
  `server/identity.js:85` (`f in header`, before `remote ??=` and before any lookup, also for an injected `jwks`);
  `identity.test.ts › key-carrying headers -> key_in_header, also with the real key and kid; getter not consulted`
  (incl. `jku: ""`, `calls() === 0`); `› embedded jwk/jku with an unknown kid -> key_in_header…`;
  `app.test.ts › a token with jku -> 401 unauthorized, logged auth_denied key_in_header`. Pass.
- [x] 2. Last good set served while `now - fetchedAt ≤ 24 h`, past that unavailable — `jwks.js:132,138`;
  `jwks.test.ts › stale set is served up to 24 h while refetch fails` (+301 s, +12 h, +24 h exactly),
  `› past 24 h without a successful fetch -> JwksUnavailable` (+24 h + 1 ms); `identity.test.ts › JWKS outage: cached
  keys verify for 24 h, then unavailable` (injected `now`, real-time tokens so D46 `maxTokenAge` unaffected). Pass.
- [x] 3. No keys ever → 503 `auth_unavailable`, `Retry-After: 30` — `app.js:123-126`, `http.js:55` passes headers;
  `jwks.test.ts › no keys ever -> JwksUnavailable…`; `identity.test.ts › JWKS failures fail closed with
  jwks_unavailable and unavailable: true`; `app.test.ts › JWKS unavailable -> 503 auth_unavailable with Retry-After 30,
  no pool call` (asserts header, body, no pool call, log line, no `auth_denied`). Pass.
- [x] 4. Unknown `kid` refetch ≤ 1/min; healthy JWKS → 401 `unknown_kid` — `jwks.js:136-145`; existing
  `identity.test.ts › remote JWKS › fetches lazily, honours the 60 s cooldown, picks up a rotated key` passes unchanged
  (not in the diff); `jwks.test.ts › unknown kid refetches at most once per 60 s`. Pass.
- [x] 5. Unknown `kid` while refetch failing / cooling down → unavailable — `jwks.js:143-144`;
  `jwks.test.ts › unknown kid during an outage -> JwksUnavailable` (both the failing attempt and the cooldown). Pass.
- [x] 6. Fresh 300 s, single-flight, 60 s cooldown — `jwks.js:8-10,101-128`; `› fresh for 300 s…`,
  `› concurrent stale requests share one fetch (single-flight)`, `› failed attempt -> no new fetch for 60 s, then one
  retry`. Single-flight is tested at resolver level (two concurrent `getKey` calls, one fetch); `verify` delegates to
  the same resolver instance, so concurrent `verify` calls share it too (code read: one `remote` per verifier,
  `identity.js:87`). Pass.
- [x] 7. Hardened fetch; set replaced only on a valid non-empty `keys` array — `jwks.js:48-52` (UA, Accept,
  `redirect:"error"`, `AbortSignal.timeout(5000)` which also covers the body read), `:59` 200 only, `:60-77`
  Content-Length and streamed 64 KiB cap, `:92` fatal UTF-8 + JSON, `:93` non-empty array, `:107-113` `set`/`fetchedAt`
  only replaced after `createLocalJWKSet` succeeds; `› fetch init…`, `› bad responses keep the last good set` (12
  cases, each asserts the old set still resolves and the exact `reason`). Pass. Extra `kty` check: see Issue 1.
- [x] 8. SPA does not sign out on 503 — `src/data/authFetch.ts` unchanged (`:44,47` pass non-401 through);
  `authFetch.test.ts › 503 is passed through: no retry, no onAuthLost` (getToken ×1, fetch ×1),
  `› 401 then 503 on the retry -> 503 returned, no onAuthLost`. Pass.
- [x] 9. `auth_unavailable` Vietnamese copy, not "sign in again" — `apiErrors.ts:11` "Chưa kiểm tra được đăng nhập lúc
  này, thử lại sau ít phút nhé"; `apiErrors.test.ts › auth_unavailable has its own Vietnamese copy`; added to
  `SERVER_CODES`. Pass.
- [x] 10. Nothing about tokens/keys logged — `jwks.js:117-120` logs `{event, reason}` only (fixed enum; `RefreshError`
  carries only the reason); `identity.js` still never logs and never reads `err.message`; `app.js:124` logs
  `{event, code}`. Tests: `› jwks_refresh_failed log has only {event, reason}` (no body/URL), every bad-response case
  asserts the exact log array and no `mmlabs` in it; `identity.test.ts › failures are fixed codes only and never log`
  extended (unavailable result keys `code, ok, unavailable`); app 503 test asserts the exact log line. Pass.
- [x] 11. All checks pass — see Checks.

Existing-test changes in `server/identity.test.ts` (inspected the full diff): exactly the two the plan named —
(a) `embedded jwk/jku with an unknown kid`: expectation `unknown_kid` → `key_in_header`, plus a new `calls() === 0`
assertion (stricter: refused before any key lookup); (b) `JWKS failures fail closed…`: expected object gains
`unavailable: true`, same failure inputs (stricter, `toEqual`). Everything else is additive (ENUM entry, the extension
of the fixed-codes test, new tests). No assertion removed or loosened.

Scope: every product/test file is in the plan's file list. `work/ming-todo.md` (+1 line, M-33 plan approval, already
ticked) and `work/tickets/T-028.1/*` are loop bookkeeping, not product code. `src/features/auth/**` untouched
(`git diff --stat` empty). No High path outside the plan: all `server/**` files changed are named in the plan.

### Ming verification after merge
- After deploy: sign-in and normal use work as before, and the server log shows no `jwks_refresh_failed` /
  `auth_unavailable` lines in normal operation.
- A real Identity outage is not staged in production; covered by the fake-clock tests.

### Issues
#### Issue 1 — 🟡 should-fix — robustness of the added `kty` check
- **Where**: `server/jwks.js:13,94`
- **Expected**: a set is rejected only when it is unusable (plan: "a non-empty array accepted by
  `createLocalJWKSet`"). The implementer's addition is justified for the plan's test case `{keys:[{kty:"nope"}]}`
  (I confirmed jose's `createLocalJWKSet` accepts it, and a set with no usable key should not replace a good one).
- **Actual**: the whole set is rejected if **any** key has a `kty` outside `EC/RSA/OKP/oct`. jose itself ignores
  such keys during selection (I checked: a set `[EC k1, {kty:"AKP"}]` resolves `k1` fine). If Identity ever publishes an
  additional key of a newer type (e.g. a post-quantum `AKP` key during a migration), every refresh fails with
  `parse`, the cache ages out and after 24 h `/api` answers 503 for everyone, a self-inflicted version of the outage
  this ticket fixes. The verifier only accepts ES256, so only `EC` keys matter.
- **Fix instruction** (not blocking; can ride in this PR or T-028.2): require every entry to be a non-null object and
  at least one entry with `kty === "EC"`; ignore other `kty` values instead of rejecting the set. Keep the
  `{keys:[{kty:"nope"}]}` → `parse` case and add `[valid EC key, {kty:"AKP"}]` → set replaced.

### Rules (CLAUDE.md)
No violations found. R1: SPA path unchanged, no new `fetch` in components (the new `fetch` is server-side, JWKS).
R3: nothing new reaches the client. R6: copy in `src/data/apiErrors.ts`. R7: diff matches the plan's file list.
R8: resolver and verifier changes have unit tests; checks green. R9: no UI layout change.

### Blockers from review agents
Filled in by the orchestrator from `security-review.md` (run in parallel).

### Nits (do not block)
- `server/jwks.test.ts:236` `a verified signature path works end to end with a real token`: the signed `jws` is never
  verified (only `split(".")` length is checked); the test is a plain key lookup. Rename or verify with `jwtVerify`.
- Single-flight is tested with two concurrent `getKey` calls on an empty cache; a concurrent case on a *stale* set
  (the test name says "stale") would match the name better.
- During an outage, a request that arrives while the post-cooldown refresh is in flight does not wait for it
  (`failed` is still true, `lastAttemptAt` just moved): it gets the stale set or 503. Acceptable, mention only.

### Follow-ups (out of scope)
- 403 (`forbidden_origin`) does not sign out in `authFetch` (plan assumption; Ming to decide if it should).
- org-admin-api `docs/consumers.md` still names ricotdin and 15 min tokens.
