## Consult: software-architect on T-026 (12-hour Identity tokens)

Read-only consult. No files were written.

### Findings

1. **The change is one line, but it breaks an existing test.** The only place the server enforces a 15-minute bound is `server/identity.js:114` (`maxTokenAge: 900`). The `exp` check is a separate check (`requiredClaims` at `:112`, `clockTolerance: 30` at `:113`) and still applies. `server/identity.test.ts:160` asserts that a token with `iat: now() - 931` gets `expired`. That test fails once the bound becomes 43200, so it has to be rewritten, not just added to.

2. **The SPA token store already copes with 12-hour tokens. Revocation is where things change.**
   - Caching works as is. `src/features/auth/identityClient.ts:31` sets `EXPIRES_MAX = 86400`, so `expires_in: 43200` is accepted (`:129-133`). `tokenStore.ts:66` then caches the token for 43140 s.
   - **Not covered by D46 as written:** refresh is lazy (`tokenStore.ts:87-91`), so the SPA now calls `/token` about once every 12 h instead of every 14 min. That `/token` call is the only way the SPA learns `session_invalid` / `not_member`, which it then reports through `subscribe` (`:29`, `:93-95`). After this change, a password reset ("signed out on every device", `src/features/auth/copy.ts:32`), a sign-out in another mmlabs app, or a lost membership is seen client-side only after up to 12 h. Before, it was at most 14 min.
   - D46 accepts this on the server side (the token stays valid). It does not say the SPA keeps showing a signed-in session for that long.
   - Local sign-out is fine: `signOut` / `forget` clear the in-memory token (`tokenStore.ts:115-136`). Note that `/logout` never revoked an issued token (`scripts/dev-token.sh:83`), and that window is now 12 h.

3. **The 401 retry path is unaffected.** `src/data/authFetch.ts:42-49` retries once with `getToken(rejected)`, which skips the cache (`tokenStore.ts:89`). This is also the path that would hide the wrong rollout order (see Risks).

4. **Rate limits do not depend on the token.** `server/ai/rateLimit.js:59-73` counts by `userId` in rolling 1 h / 24 h windows. Nothing is keyed by `jti` or token lifetime; the only use of `jti` is the non-empty check at `identity.js:117`. No change needed.

5. **Photo blob URLs do not depend on the token.** `src/data/photoUrls.ts:66-81` fetches through `authedFetch` and turns the bytes into `blob:` URLs, which don't expire with the token. They are cleared on `clear()` (`:153-164`). No change needed.

6. **The dev token proxy has no 15-minute assumption.** `dev/devTokenProxy.ts:59-81` decodes `exp`, re-reads the file on every request and rejects at `exp*1000 <= now`, with no hard-coded lifetime. One side effect: the token file (`~/.config/tudocuatui/dev-token`, `:55-57`) now sits on disk valid for 12 h and works against production data (D45). It is mode 0600 via `umask 077` (`dev-token.sh:22`). This is covered by D46's "leaked token" consequence.

7. **Docs that still say 15 minutes:**
   - `server/README.md:27` ("tokens older than 15 min rejected").
   - `server/README.md:29` ("up to 15 minutes, accepted; ADR-0005"). The ticket scope names only the "Identity tokens" section in general, so the implementer could miss this line.
   - `README.md:23`.
   - `scripts/dev-token.sh:2`.
   - On the Identity side, `org-admin-api/docs/consumers.md:296` and `:370-371` also say 15 min; these belong to USR-13.
   - Note that the consumers checklist (`consumers.md:353-371`) does not require a `maxTokenAge` at all. TuDo's bound is TuDo's own defence-in-depth, so TuDo can set it independently.

### Recommendations

- **R-1 (AC1):** Change `identity.js:114` to `maxTokenAge: 43200`. Keep it a module constant (for example `const MAX_TOKEN_AGE_S = 43200; // D46`), not an env setting.
  - Reason 1: it is a security bound in the High-tier auth path, and any change to it should show up in a High-tier diff. A deployment-repo env var is not tier-gated here.
  - Reason 2: Identity's `exp` already controls the effective lifetime. If Identity goes back to 900, TuDo's 43200 does no harm.
  - Reason 3: a config knob adds a validation and fail-closed parsing surface that `loadIdentityConfig` (`:23-45`) does not have today.
  - Trade-off: changing it later needs a PR. Given D46, that is acceptable.
- **R-2 (AC1, AC2, R8):** Rewrite `identity.test.ts:160` and add age tests with literal numbers. Do not import the constant: a test that reads it passes for any value. Give each token an `exp` in the future so only the age check is under test.
  - `iat: now()` → ok.
  - `iat: now() - 43140` (11 h 59 min) → ok.
  - `iat: now() - 43231` (12 h + 31 s, beyond the leeway) → `{ ok: false, code: "expired" }`.
  - Optional: `iat: now() - 43200 - 29` → ok, which pins the 30 s leeway.
  - Keep `:157-158` as they are; they prove `exp` still limits a token on its own.
  - Use `vi.useFakeTimers({ toFake: ["Date"] })` (already used at `:303`) or margins of at least 30 s so the tests are not flaky.
- **R-3 (ticket scope "Check the SPA token store", R8):** Add one `tokenStore.test.ts` case: with `expiresIn: 43200`, the cached token is reused at +43139 s and refetched at +43140 s. Add one `identityClient.test.ts` case: `expires_in: 43200` is accepted. This pins `EXPIRES_MAX` from accidentally being lowered below 43200. Both are tests only, with no code change.
- **R-4 (AC3):** Update both `server/README.md` lines (`:27` and `:29`), `README.md:23` and `dev-token.sh:2`, each citing D46. `:29` should read "up to 12 hours, accepted; D46".
- **R-5 (ordering):** TuDo first is correct. The ordering condition should say **deployed**, not merged; see Risk 1.

### Risks

1. **Wrong rollout order fails silently.** If USR-13 plus M-29 (`ACCESS_TOKEN_TTL_SECONDS=43200`) reaches production before T-026 is **deployed**, then in production:
   - Tokens with `exp` 12 h ahead are rejected as `expired` 15 min after `iat`.
   - The SPA still caches them for 12 h, so after the first 15 min every request costs a 401 plus `/token` plus a retry (`authFetch.ts:44-46`), until the retry swaps in a fresh token, which is then cached for another 12 h.
   - The dev token stops working after 15 min.
   - It works, but slowly and with misleading `auth_denied expired` logs.
   - `work/ming-todo.md:337-339` (M-29) already warns about this, but it should gate on "T-026 deployed to production (image rolled out)", not "merged".
2. **Client-side revocation latency (Finding 2) is a consequence D46 does not list.** Users may see stale signed-in state for up to 12 h after a password reset or sign-out elsewhere.
3. **Global effect:** admin and the other apps get 12-hour tokens too. This is accepted in D46 and USR-13, and is out of TuDo's scope.
4. **Signing-key rotation now takes about 12.5 h** (USR-13 scope). TuDo's JWKS cache (`identity.js:83-84`, 300 s / 60 s cooldown) needs no change.

### Open questions (for Ming, batched)

1. **SPA refresh cadence.** Should the SPA keep refreshing about every 14 min even though tokens live 12 h? For example, cache until `min(expires_in, 900) - 60` in `tokenStore.ts:66`.
   - Why: it keeps password-reset and sign-out-elsewhere detection at about 15 min in the app. The dev-token benefit is unchanged, because the dev proxy doesn't use the SPA store. `/token` traffic stays at today's level.
   - Proposed default: **no change in T-026** (the ticket says change it only if a test shows a problem). Record it as a `debt` issue / follow-up so Ming can choose, since it is a product trade-off D46 did not mention.
2. **M-29 wording.** Should M-29 say "after T-026 is deployed to production" rather than just after merge?
   - Proposed default: yes, amend the M-29 text in `work/ming-todo.md`. That is a doc edit outside this ticket's diff, so it goes on the follow-ups list.
3. **Constant vs config.** Confirm `maxTokenAge` stays a code constant (R-1).
   - Proposed default: constant.
