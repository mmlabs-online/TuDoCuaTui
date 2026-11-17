# T-026 security review

## Attempt 1 — 2026-11-17 — security-ai-generated-code-auditor (read-only)

**Verdict: no 🔴 findings.** In the verifier, only the age bound changed. The tests pin 12 h with literal numbers, and docs match the code. Nothing was run. I read the files in the working tree on branch `ticket/T-026`. I could not run `git diff`, so whether a file changed comes from the impl-log and the plan, not from a diff I produced.

One limit on what I checked: the jose source (`node_modules/jose/dist/webapi/lib/jwt_claims_set.js`) could not be opened because the pnpm symlink did not resolve. For how jose handles `maxTokenAge` (it checks `now - iat - tolerance > maxTokenAge`, maps that to `ERR_JWT_EXPIRED`, and rejects an `iat` in the future only when `maxTokenAge` is set), I am relying on the T-019.5 security review and consult F5, which read jose 6.2.17. The test assertions agree with that behaviour.

### Findings

- 🟢 **Only the age bound changed.** `server/identity.js:12` adds `MAX_TOKEN_AGE_S = 43200` (a code constant, not env config; matches A3/R-1), used at `server/identity.js:115`. Everything else in `jwtVerify` is unchanged:
  - `algorithms: ["ES256"]`, exact `issuer`, `audience`, `typ: "at+jwt"` (`:109-112`)
  - `requiredClaims` still includes exp, iat, sub, jti, iss, aud (`:113`)
  - `clockTolerance: 30` (`:114`)
  - The post-verify checks are unchanged: `aud` must be a string, `jti` a non-empty string, `email_verified === true`, `sub` a canonical UUID, and there must be a `tudocuatui:` role (`:117-131`).
  - `codeOf` and the header parsing (`:50-71`, `:101-106`) are unchanged.
- 🟢 **No new path accepts a token without `exp` or with a future `iat`.**
  - `exp` and `iat` are still required. Tests at `server/identity.test.ts:173-179` drop each one and expect `claim_exp` / `claim_iat`.
  - A future `iat` is rejected only because `maxTokenAge` is set. It is still set to a truthy number, and `server/identity.test.ts:159` (`iat: now()+31` → `claim_iat`) still holds.
  - `exp` is still enforced on its own (`:157-158`, ±31/29 s). So a token is accepted only until whichever comes first, `exp + 30 s` or `iat + 12 h + 30 s`. If Identity ever issued tokens with a longer TTL, TuDo would still cap them at 12 h.
- 🟢 **The tests really pin 12 h** (`server/identity.test.ts:163-170`):
  - They use literal ages (0, 43140, 43229, 43231), not the imported constant.
  - Every case has `exp: now()+600`, so the case that is rejected can only fail on the age bound, never on `exp`.
  - 43229 is accepted and 43231 returns `expired`, which checks the 30 s leeway on top of 43200. Changing the bound to 43201 or more, or to 43198 or less, makes a test fail. Only 43199 would still pass, which doesn't matter.
  - The old `iat: now()-931` assertion was removed, as the plan said.
- 🟢 **SPA tests are tests only.**
  - `src/features/auth/tokenStore.test.ts:88-97`: a 43200 s token is reused until 43,140,000 ms after receipt, then refetched.
  - `src/features/auth/identityClient.test.ts:73-76`: `expires_in: 43200` is accepted. This also stops anyone lowering `EXPIRES_MAX` below 43200 unnoticed.
  - `tokenStore.ts` and `identityClient.ts` are unchanged, per the impl-log.
- 🟢 **Docs are accurate.**
  - `server/README.md:27` says "tokens older than 12 h rejected (D46)".
  - `server/README.md:29` says a revoked user or removed role keeps access for up to 12 hours (accepted; D46).
  - `README.md:23` says 12 hours, with the "15 minutes until M-29" caveat, which is correct during the rollout.
  - `scripts/dev-token.sh:2` has only the comment change; the script body has no edits.
  - No stale "15 min" remains in `server/`, `README.md` or `scripts/`. The 43200 values in `server/photo-sweep.js:24,231` are an unrelated grace-minutes limit.
- 🟡 **Timing margin in the 43229 (accepted) case could make the test flaky** (`server/identity.test.ts:168`). The test uses the real clock: `now()` is read when the token is signed, and jose reads its own `now` when verifying. If 2 s or more pass between the two, the age reaches 43231 and the test fails falsely. The rejected case can't flake, because age only grows. The risk is low because ES256 signing takes milliseconds, but under a loaded full run it is possible. The impl-log (`work/tickets/T-026/impl-log.md:22`) records an unexplained first-run `ELIFECYCLE` failure. That failure is probably unrelated, but it was not identified. Fix: wrap this test in `vi.useFakeTimers({ toFake: ["Date"], now: ... })` as `:311` does. The plan already allowed this (`plan.md:64`). This is optional and not a blocker for AC1.

### Consequences beyond D46

None that are material. Checked:
- Client revocation latency (the SPA caches the token for about 12 h) was not in D46, but it was surfaced as A1 and confirmed by Ming at plan approval (`work/ming-todo.md:325`).
- A token stolen by XSS from the SPA's in-memory store, or the dev token file at `~/.config/tudocuatui/dev-token` (written with `umask 077`), is now a production credential for 12 h. Both fall under D46's "a leaked token … works for up to 12 hours".
- Old note, now weaker: the T-019.5 plan described `maxTokenAge` as an independent cap at Identity's TTL (`work/tickets/T-019.5/plan.md:191`). After M-29 both are 12 h, so the bound no longer adds defence in depth below `exp`. It only guards against Identity issuing tokens longer than 12 h. That is acceptable, and only that historical plan text is affected.

### Recommendations
1. Optional (AC1, R8): pin `Date` with fake timers in the 12 h age test to remove the 1 s margin.
2. Keep the rollout order from A2 (`work/ming-todo.md` M-29): deploy T-026 to production before Identity switches to 12 h tokens. The order is a risk to availability only, not to security.

### Risks
- With the order reversed, every request after 15 min gets a 401 `expired`, then a `/token` call and a retry. That's an availability problem; it does not let anything through (fails closed).

### Open questions
None.
