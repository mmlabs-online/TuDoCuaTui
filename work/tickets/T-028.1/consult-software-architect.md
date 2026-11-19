# T-028.1 consult — software-architect (2026-11-19)

## Findings
- `server/identity.js` already maps JWKS failures to code `jwks_unavailable`, but `app.js:121-124` turns every `!ok`
  into a 401. `authFetch` then gets a fresh token, retries, gets 401 again and calls `onAuthLost`, which signs the user
  out. That chain is the outage bug.
- jose's `createRemoteJWKSet` drops its keys when a fetch fails, so it can't keep a last good set. jose also ignores
  `jku`/`jwk`: a token with a valid `kid` plus `jku` currently verifies. The test at `identity.test.ts:244` expects
  `unknown_kid` and has to change.
- `authFetch.ts` already passes any non-401 response through, so a 503 reaches `repo.http` as
  `ApiError(503, code, retryAfterSec)`. The client fix is mainly a regression test plus copy for the new code.

## Recommendations
1. **Header check (AC1).** Inside `getKey`, throw a dedicated error when the header contains `jku`, `x5u`, `jwk` or
   `x5c` (an `in` check, so empty values are caught too). Map it to 401 with code `key_in_header`.
2. **Key resolver (AC2/3).** Own cache `{ set: createLocalJWKSet(json), fetchedAt, lastAttemptAt, inflight }`; don't
   wrap `createRemoteJWKSet`.
   - Fresh for 300 s (server max-age, under the 1 h cap).
   - When stale, one shared (single-flight) refetch; on failure keep the last good set while `now - fetchedAt ≤ 24 h`.
   - After a failed attempt wait 60 s before trying again (no 5 s timeout added to every request during an outage).
   - Unknown `kid`: refetch only if `lastAttemptAt` is more than 60 s ago.
   - Fetch: `AbortSignal.timeout(timeoutMs ?? 5000)`, `redirect: "error"`, existing User-Agent, status 200 only, body
     capped at about 64 KiB.
   - Replace the cached set only when `keys` is a non-empty array and `createLocalJWKSet` accepts it.
   - Keep the `jwks` and `fetch` options; add `now?: () => number` for the cache only. Don't use `vi.useFakeTimers`
     for the 24 h test (tokens older than 12 h fail `maxTokenAge`).
3. **Signalling (AC2).** Add `unavailable: true` to the failure result (update the typedef in `auth.js`); don't match
   on code strings in app.js. In `app.js`: log `{event:"auth_unavailable", code}`, then
   `sendError(res, 503, "auth_unavailable", {}, {"Retry-After":"30"})`. Unknown `kid` while the refetch failed or is
   cooling down after a failure → unavailable (503), not 401 (it may be a rotated key; a 401 would sign the user out).
4. **SPA (AC4).** `authFetch` tests: a 503 is returned without a second `getToken` call and without `onAuthLost`;
   401 then 503 on the retry is returned without `onAuthLost`. Vietnamese copy for `auth_unavailable` in
   `apiErrors.ts` (R6). No change in `AuthGate`/`tokenStore` (`src/features/auth/**` is High-tier).
5. **Logging.** No token, header, JWKS body or key material in logs. Optionally a verifier `log` callback for
   `jwks_refresh_failed {reason: timeout|status|parse|size}` (at most one per minute); otherwise a 23 h stale period
   goes unnoticed.

## Risks
- Serving a stale set for 24 h keeps a key the issuer revoked accepted for up to 24 h, only while the JWKS fetch keeps
  failing. D50 accepts this.
- `getKey` is async and shared across requests: test single-flight with concurrent `verify` calls.
- `server/**` is High: plan approval, and `security-ai-generated-code-auditor` at review.

## Open questions
- No new decision from Ming needed; D50 covers the behaviour.
- For the planner: `Retry-After` value (30 s suggested); 503 vs 401 for an unknown `kid` during an outage (503 recommended).
- `consumers.md` still says ricotdin and 15 min; the verifier contract is unchanged, not a blocker.
