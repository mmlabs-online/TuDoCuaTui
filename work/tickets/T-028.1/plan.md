Status: READY

# Plan — T-028.1: Harden the Identity token verifier (JWKS outage → 503, refuse key-carrying headers)

## Scope summary
- `work/decisions.md` D50 (2026-11-19): "Adopted: … **verifier hardening (reject `jku`/`x5u`/`jwk`/`x5c`, keep JWKS ≤ 24 h
  on fetch failure, 503 when no keys)**." Differences D50 keeps: config names `MM_IDENTITY_ISSUER` and audience
  `tudocuatui` stay (3); token lifetime stays 12 h (4, D46). No users table (1).
- D46: "the TUDO server accepts tokens up to 12 hours old (`maxTokenAge` 43200)" — unchanged; it is why the 24 h cache
  tests must use an injected cache clock, not fake timers (see Approach 3).
- D31/D38: rows keyed by `sub`; owner lane — unchanged by this ticket.
- Ticket scope (quoted):
  - "`server/identity.js`: reject (401) any token whose protected header has `jku`, `x5u`, `jwk` or `x5c`."
  - "Keep the last good JWKS for up to 24 h when a refetch fails (unknown `kid` still refetches at most once a
    minute; cache ≤ 1 h otherwise)."
  - "When no keys are available at all, answer **503** (stable code, e.g. `auth_unavailable`), not 401
    (`server/app.js` auth path)."
  - "`src/data/authFetch.ts`: a 503 from the auth layer keeps the session (no `onAuthLost`); only 401/403 sign out."
- Out of scope (ticket): renaming env vars, a users table. Also out: anything under `src/features/auth/**`.

Root cause of the outage sign-out (confirmed, consult finding 1): `server/identity.js:96` maps JWKS fetch failures to
`jwks_unavailable`, but `server/app.js:122-124` answers 401 for every `!result.ok`; `src/data/authFetch.ts:44-49` then
refreshes, gets 401 again and calls `onAuthLost` → sign-out. jose's `createRemoteJWKSet` (`identity.js:83`) also has no
"keep last good set" mode, and jose ignores `jku`/`jwk`, so a token with a valid `kid` plus `jku` verifies today.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Tokens with `jku`/`x5u`/`jwk`/`x5c` in the protected header → 401 (verifier code `key_in_header`), also when the value is empty and when `kid`/signature are otherwise valid; the key getter is not consulted. | `server/identity.test.ts › key-carrying headers -> key_in_header…` and `› embedded jwk/jku with an unknown kid -> key_in_header…`; `server/app.test.ts › identity auth › a token with jku -> 401 unauthorized, logged auth_denied key_in_header` |
| 2 | JWKS refetch failure keeps verifying with the last good keys while `now - fetchedAt ≤ 24 h`; past 24 h → unavailable (503). | `server/jwks.test.ts › stale set is served up to 24 h while refetch fails`, `› past 24 h without a successful fetch -> unavailable`; `server/identity.test.ts › JWKS outage: cached keys verify for 24 h, then unavailable` (injected `now`) |
| 3 | No keys ever fetched (first fetch fails) → unavailable → 503 `auth_unavailable`, `Retry-After: 30`. | `server/jwks.test.ts › no keys ever -> unavailable`; `server/identity.test.ts › JWKS failures fail closed with jwks_unavailable and unavailable: true`; `server/app.test.ts › identity auth › JWKS unavailable -> 503 auth_unavailable with Retry-After 30, no pool call` |
| 4 | Unknown `kid` refetches at most once a minute; with a healthy JWKS it stays 401 `unknown_kid`. | existing `server/identity.test.ts › remote JWKS › fetches lazily, honours the 60 s cooldown, picks up a rotated key` (must pass unchanged) + `server/jwks.test.ts › unknown kid refetches at most once per 60 s` |
| 5 | Unknown `kid` while the JWKS refetch is failing (or cooling down after a failure) → unavailable (503), not 401. | `server/jwks.test.ts › unknown kid during an outage -> unavailable` |
| 6 | Fresh window 300 s (≤ 1 h cap); one shared refetch for concurrent requests; 60 s cooldown after a failed attempt. | `server/jwks.test.ts › fresh for 300 s, no fetch`, `› concurrent stale requests share one fetch`, `› failed attempt -> no new fetch for 60 s` |
| 7 | Fetch hardening: `redirect: "error"`, timeout (default 5 s), `User-Agent: tudocuatui-server`, status 200 only, body ≤ 64 KiB, `keys` must be a non-empty array accepted by `createLocalJWKSet`; a bad response never replaces the cached set. | `server/jwks.test.ts › fetch init…`, `› bad responses keep the last good set` |
| 8 | The SPA does not sign out on a 503: a 503 is returned without a second `getToken` and without `onAuthLost`; 401 then 503 on the retry is returned without `onAuthLost`. | `src/data/authFetch.test.ts › 503 is passed through: no retry, no onAuthLost`, `› 401 then 503 on the retry -> 503 returned, no onAuthLost` |
| 9 | `auth_unavailable` has its own Vietnamese copy (R6) that does not tell the user to sign in again. | `src/data/apiErrors.test.ts › auth_unavailable has its own Vietnamese copy`; `SERVER_CODES` includes `auth_unavailable` |
| 10 | No token, header, JWKS body, URL or key material in logs; outage logs are fixed-field only. | `server/jwks.test.ts › jwks_refresh_failed log has only {event, reason}`; `server/identity.test.ts › failures are fixed codes only and never log` (extended); `server/app.test.ts` 503 test asserts the log line equals `{event:"auth_unavailable", code:"jwks_unavailable"}` |
| 11 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
- After deploy: signing in and using the app works as before (normal JWKS path), and the server log shows no
  `jwks_refresh_failed` / `auth_unavailable` lines in normal operation.
- A real Identity outage cannot be staged safely in production; behaviour is covered by the fake-clock tests above.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `server/jwks.js` (new) | `createJwksResolver({ url, fetch, timeoutMs, now, log })` → a jose `JWTVerifyGetKey` with its own cache over `createLocalJWKSet`; exports `JwksUnavailable`. | AC2–7; pure, injectable, unit-testable (planner rule 6). | Yes (`server/**`) |
| `server/jwks.test.ts` (new) | Unit tests for the resolver (cache, cooldown, single-flight, fetch hardening, log). | R8 | Yes |
| `server/identity.js` | Header check (`key_in_header`); use `createJwksResolver` instead of `createRemoteJWKSet`; `unavailable: true` on `jwks_unavailable`; new `now?`/`log?` options; drop `customFetch`/`createRemoteJWKSet` imports. | AC1–5 | Yes |
| `server/identity.test.ts` | Change test at :244, extend ENUM, add header and outage tests, adjust `jwks_unavailable` expectation (see Tests). | AC1–5, R8 | Yes |
| `server/auth.js` | `AuthResult` typedef gets `unavailable?: true`; `createAuth(cfg, { log } = {})` passes `log` to the verifier. | AC3, AC10 | Yes |
| `server/index.js` | `createAuth(authConfig, { log })` (one line). | wires `jwks_refresh_failed` to stdout | Yes |
| `server/app.js` | In the `/api` auth branch: `result.unavailable` → log `{event:"auth_unavailable", code}` + `sendError(res, 503, "auth_unavailable", {}, { "Retry-After": "30" })`; otherwise unchanged 401. | AC3 | Yes |
| `server/app.test.ts` | Two identity-auth tests (503 path, `key_in_header` path). | AC1, AC3, R8 | Yes |
| `server/README.md` | Auth paragraph: replace "any failure, including an unreachable JWKS, answers 401" with the new cache/503 behaviour; add `key_in_header` to the code list; add 503 `auth_unavailable` (`Retry-After: 30`) and the `jwks_refresh_failed`/`auth_unavailable` log lines. | Docs must not contradict behaviour. | Yes |
| `src/data/apiErrors.ts` | `auth_unavailable` copy in `API_ERROR_COPY`. | AC9, R6 | No |
| `src/data/apiErrors.test.ts` | Add `auth_unavailable` to `SERVER_CODES`; dedicated copy test. | AC9, R8 | No |
| `src/data/authFetch.test.ts` | Two regression tests (503 passthrough). `authFetch.ts` itself needs no change (it already passes non-401 through, `authFetch.ts:44,47`). | AC8 | No |

Not touched: `src/data/authFetch.ts` (no code change needed), `src/features/auth/**`, `src/data/repo.http.ts` (already
turns a 503 into `ApiError(503, code, …, retryAfterSec)`, `repo.http.ts:56-67`).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/jwks.test.ts › lazy: no fetch until the first key lookup` | startup without network preserved |
| `› fetch init: redirect "error", User-Agent tudocuatui-server, a timeout signal, the JWKS URL` | AC7 |
| `› fresh for 300 s: second lookup at +299 s does not fetch; at +301 s it refetches` | AC6, cache ≤ 1 h |
| `› concurrent stale requests share one fetch (single-flight)` — two lookups while a deferred fetch is pending → 1 call, both resolve | AC6 |
| `› stale set is served up to 24 h while refetch fails` — success at t0, then failing fetch; lookups at +301 s, +12 h, +24 h exactly still return the key | AC2 |
| `› past 24 h without a successful fetch -> JwksUnavailable` (+24 h + 1 ms) | AC2 |
| `› failed attempt -> no new fetch for 60 s, then one retry` | AC6 (cooldown) |
| `› no keys ever -> JwksUnavailable; a second lookup within 60 s does not fetch` | AC3 |
| `› recovery: a later successful fetch replaces the set and clears the failure state` | AC2 |
| `› unknown kid refetches at most once per 60 s` (healthy JWKS → jose `ERR_JWKS_NO_MATCHING_KEY` rethrown) | AC4 |
| `› unknown kid during an outage -> JwksUnavailable` (cached set, refetch failing or in cooldown) | AC5 |
| `› bad responses keep the last good set` — table: network reject (`network`), `TimeoutError` (`timeout`), 500 and 301 (`status`), body 65 537 bytes and `Content-Length` over the cap (`size`), not JSON / invalid UTF-8 / `{keys: []}` / `{keys: "x"}` / `{keys:[{kty:"nope"}]}` / `{}` (`parse`) | AC7 |
| `› jwks_refresh_failed log has only {event, reason}` with reason in `timeout|network|status|size|parse`; no URL/body in the JSON | AC10 |
| `server/identity.test.ts › key-carrying headers -> key_in_header` — for each of `jku`, `x5u`, `jwk`, `x5c`, and `jku: ""`: token signed by the real key with `kid: "k1"` → `{ok:false, code:"key_in_header"}`; `calls()` stays 0 | AC1 |
| `server/identity.test.ts › embedded jwk/jku with an unknown kid -> key_in_header, the embedded key is not used` (changed :244, see below) | AC1 |
| `server/identity.test.ts › JWKS failures fail closed with jwks_unavailable and unavailable: true` (existing :340, expectation extended) | AC3 |
| `server/identity.test.ts › JWKS outage: cached keys verify for 24 h, then unavailable` — `fetch` succeeds once then fails; injected `now` jumps +23 h (ok: true) and +24 h + 1 s (`{ok:false, code:"jwks_unavailable", unavailable:true}`); tokens signed with real `iat` | AC2 end to end |
| `server/identity.test.ts › failures are fixed codes only and never log` (extended: ENUM has `key_in_header`; an unavailable result has keys `code, ok, unavailable` only) | AC10 |
| `server/app.test.ts › identity auth › JWKS unavailable -> 503 auth_unavailable with Retry-After 30, no pool call` — verifier with `jwks: async () => { throw new Error("down") }`; body `{error:{code:"auth_unavailable"}}`; log `{event:"auth_unavailable", code:"jwks_unavailable"}`; no `auth_denied` | AC3, AC10 |
| `server/app.test.ts › identity auth › a token with jku -> 401 unauthorized, logged auth_denied key_in_header` | AC1 |
| `src/data/authFetch.test.ts › 503 is passed through: no retry, no onAuthLost` — `setup([503], getToken, {onAuthLost})` → `res.status === 503`, `getToken` called once, `fetchFn` once, `onAuthLost` not called | AC8 |
| `src/data/authFetch.test.ts › 401 then 503 on the retry -> 503 returned, no onAuthLost` | AC8 |
| `src/data/apiErrors.test.ts › auth_unavailable has its own Vietnamese copy` — equals `API_ERROR_COPY.auth_unavailable`, not `generic`, not `unauthorized` | AC9 |

**Why the test at `identity.test.ts:244` changes (not a weakened test).** It signs with a foreign key and puts
`kid: "evil"`, `jwk` and `jku` in the header, and expects `unknown_kid`. Its intent is "the embedded key is never used";
that stays asserted (`ok: false`) and becomes stricter: the token is now refused on its header shape before any key
lookup (`key_in_header`, getter call count 0), which is exactly what D50 adopts. `unknown_kid` was only the incidental
code because jose ignored the fields. The kid-mismatch path keeps its own coverage in the remote-JWKS cooldown test,
and the new header tests use a *valid* `kid` and the *real* key, which is the case the old test never covered (today it
verifies). The `jwks_unavailable` test at :340 likewise only gains `unavailable: true` in its expected object; every
failure response it lists still fails.

## Approach
1. **`server/jwks.js`** (pure module, `// @ts-check`, no logging except the injected `log`):
   - Constants: `FRESH_MS = 300_000`, `MAX_STALE_MS = 86_400_000`, `COOLDOWN_MS = 60_000`, `MAX_BYTES = 65_536`.
   - State `{ set, fetchedAt, lastAttemptAt, failed, inflight }`; `export class JwksUnavailable extends Error {}`.
   - `refresh()`: single-flight (`inflight ??= (async … finally inflight = null)`); sets `lastAttemptAt = now()`;
     `fetch(url, { headers: { "User-Agent": "tudocuatui-server", Accept: "application/json" }, redirect: "error",
     signal: AbortSignal.timeout(timeoutMs ?? 5000) })`; status must be exactly 200; reject a `Content-Length` over the
     cap, then read the body stream and abort past 64 KiB; decode UTF-8 (fatal) and `JSON.parse`; require `keys` to be a
     non-empty array and `createLocalJWKSet(json)` not to throw. Only then replace `set`, `fetchedAt = now()`,
     `failed = false`. Any failure: `failed = true`, `log?.({ event: "jwks_refresh_failed", reason })` with reason
     `timeout|network|status|size|parse` (error name `TimeoutError`/`AbortError` → timeout). Never throws.
   - `canAttempt()`: `!failed || now() - lastAttemptAt >= COOLDOWN_MS`.
   - `getKey(header, token)`: if no set or `now() - fetchedAt > FRESH_MS` and `canAttempt()` → `await refresh()`.
     If no set or `now() - fetchedAt > MAX_STALE_MS` → throw `JwksUnavailable`. Try `set(header, token)`; on
     `ERR_JWKS_NO_MATCHING_KEY`: if `now() - lastAttemptAt >= COOLDOWN_MS` → `await refresh()` and retry the lookup once
     (on the new set if it was replaced). If still no match: `failed` → `JwksUnavailable` (rotated key we could not
     fetch; a 401 would sign the user out), else rethrow (401 `unknown_kid`). Other jose errors rethrow.
   - Default `now = () => Date.now()` so the existing `vi.useFakeTimers({toFake:["Date"]})` cooldown test still works.
2. **`server/identity.js`**:
   - `class KeyInHeader extends Error {}`; `codeOf` maps it to `key_in_header`, `JwksUnavailable` (imported from
     `jwks.js`) to `jwks_unavailable`.
   - `getKey`: first `for (const f of ["jku","x5u","jwk","x5c"]) if (f in header) throw new KeyInHeader()` (an `in`
     check, so empty values count; before any key lookup, also for an injected `jwks`). Then `remote ??=
     createJwksResolver({ url: jwksUrl ?? …, fetch, timeoutMs, now, log })` (still lazy). Keep the existing try/catch:
     `ERR_JWKS_NO_MATCHING_KEY`/`ERR_JWKS_MULTIPLE_MATCHING_KEYS` and `JwksUnavailable` pass through; anything else
     from the getter → `JwksUnavailable`.
   - `verify` catch: `const code = codeOf(err); return code === "jwks_unavailable" ? { ok: false, code, unavailable:
     true } : { ok: false, code }`. JSDoc option/return types updated. Never reads `err.message`, never logs.
3. Tests that need 24 h use the injected `now` for the cache only (consult rec. 2): tokens are signed with real time,
   so `maxTokenAge` (12 h, D46) and `exp` are unaffected.
4. **`server/auth.js`**: typedef `{ ok: false, code?: string, unavailable?: true }`; `createAuth(cfg, { log } = {})`
   passes `log` into `createIdentityVerifier`. **`server/index.js`**: `createAuth(authConfig, { log })`.
5. **`server/app.js`** (`:121-124`): branch on the boolean flag, never on code strings (consult rec. 3):
   `if (result.unavailable) { log({ event: "auth_unavailable", code: result.code }); return sendError(res, 503,
   "auth_unavailable", {}, { "Retry-After": "30" }); }` then the existing 401 branch.
6. **SPA**: `API_ERROR_COPY.auth_unavailable = "Chưa kiểm tra được đăng nhập lúc này, thử lại sau ít phút nhé"`
   (R6: one place). No change to `authFetch.ts`; add the two regression tests. `photoImport` already waits
   `Retry-After` on a 503 and retries once, which fits.
7. **README**: update the Identity paragraph and code lists (step-for-step with the behaviour above).

Rules: R1 (SPA still goes through `WardrobeRepo`/`authFetch`, no new fetch in components), R3 (no secret moves to the
client), R6 (copy in `apiErrors.ts`), R7 (only the files above), R8 (unit tests for the resolver and verifier), R9 (no
UI layout change). The existing server rule "never logs" in `identity.js` holds: the only new log goes through the
injected `log` with fixed fields.

## Specialist input used
- consult-software-architect rec. 1 (header check in `getKey`, `in` check, 401 `key_in_header`): adopted.
- rec. 2 (own cache over `createLocalJWKSet`, 300 s fresh, single-flight, ≤ 24 h stale, 60 s cooldown, unknown-kid
  refetch ≤ 1/min, fetch timeout/redirect:error/200-only/64 KiB, replace only on a valid non-empty set, injected `now`,
  no fake timers for 24 h): adopted; placed in a separate `server/jwks.js` for unit testing.
- rec. 3 (`unavailable: true` flag, app.js 503 `auth_unavailable` + `Retry-After: 30`, unknown kid during outage → 503):
  adopted.
- rec. 4 (authFetch regression tests, Vietnamese copy, no change in `AuthGate`/`tokenStore`): adopted.
- rec. 5 (no secrets in logs; optional `jwks_refresh_failed` log): adopted with fixed fields `{event, reason}`; at most
  one line per attempt, and attempts after a failure are spaced ≥ 60 s by the cooldown (unknown-kid refetches likewise),
  so at most about one line a minute.
- Risk "stale set keeps a revoked key for up to 24 h while fetch fails": accepted by D50, noted in README.

## Assumptions
- **Retry-After is 30 s** (consult open question; resolved as instructed). Not a Ming decision: D50 fixes 503, not the
  value.
- **Unknown `kid` while the refetch failed or is cooling down after a failure → 503**, not 401 (consult open question;
  resolved as instructed): the token may be signed with a rotated key we could not fetch, and a 401 would sign the user
  out — the bug this ticket fixes.
- "only 401/403 sign out" in the ticket is read as "nothing but auth errors signs out". `authFetch` today signs out on
  a repeated 401 only; 403 (`forbidden_origin`) does not sign out and this plan does not change that (follow-up if Ming
  wants 403 to sign out).
- `jwks_unavailable` stays as the internal verifier code (logged); `auth_unavailable` is the client-facing code.
- `key_in_header` is checked only after jose's own header/alg checks (jose calls the key getter after verifying `alg`
  against the allow-list), so an HS256 token with `jku` still reports `alg`. Both are 401.
- Size: about 150 changed product lines plus ~300 test lines — one implement/review cycle; no split.
- Hotspots: no ticket is `IN_PROGRESS`/`REVIEW`/`DONE` on the board. T-028.2 (depends on this) and T-028.4 will
  later touch `authFetch`/`app.js`/`server/README.md`; they start after this merges.
- `org-admin-api docs/consumers.md` still says ricotdin and 15 min; the verifier contract used here is unchanged
  (consult note), not a blocker.

## Blocking questions
None.

## Split proposal
None.
