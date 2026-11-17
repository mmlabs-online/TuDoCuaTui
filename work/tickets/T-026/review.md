## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
WSL Ubuntu-24.04, copy on the Linux filesystem (`~/rev-t026`, removed afterwards), `pnpm install --frozen-lockfile` OK.
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0)
- format:check: pass ("All matched files use the correct format.", 269 files)
- test: pass on **7 full-suite runs**, all exit 0: 104 files passed / 10 skipped, 1257 tests passed / 205 skipped
  (run 1 `pnpm test`, runs 2–6 `vitest run --reporter=dot`, run 7 `--reporter=json`). The three changed test files
  were also run on their own 15 times in a row: all green.
- build: pass (`✓ built in 344ms`)

Flaky test (the implementer's unexplained first-run failure): I could not reproduce a failure in 7 full runs. The
JSON run shows the most likely candidate: `src/App.test.tsx` › `stale and never stat cards toggle a filter` took
**4644 ms** against Vitest's default 5000 ms test timeout (no `testTimeout` is configured), and the next slowest
App tests take 2.2–3.1 s. On a cold or loaded first run (jsdom created 114 times, environment 37 % of tracked time)
that test can cross 5 s. It is **not related to this diff**: `src/App.test.tsx` is unchanged on this branch (last
changed in T-025, `aea910d`), and the T-026 tests run in milliseconds. The age-bound test has a 1 s timing margin
(see Nits) but did not fail in 22 runs, and its failure mode would be an assertion error, not an ELIFECYCLE timeout.

### Acceptance criteria
- [x] AC1 — verifier accepts tokens up to 12 h old, rejects older than 12 h + 30 s — evidence: `server/identity.js:12`
      `const MAX_TOKEN_AGE_S = 43200; // D46`, used at `server/identity.js:115`; `server/identity.test.ts:163-170`
      › `token age bound is 12 hours (D46)` passes: iat `now()`, `now()-43140`, `now()-43229` → ok,
      `now()-43231` → `{ ok: false, code: "expired" }`, all with `exp: now() + 600` so the age bound (not `exp`)
      is what rejects. Literal numbers, constant not imported (consult R-2). Confirmed against jose 6.2.17
      `jwt_claims_set.js:92` (`age - tolerance > max` → `JWTExpired`, mapped to `expired`).
- [x] AC2 — other verifier checks unchanged — evidence: the only change in the `jwtVerify` options is
      `maxTokenAge` (`algorithms`, `issuer`, `audience`, `typ`, `requiredClaims`, `clockTolerance: 30` and the
      post-verify `aud`/`jti`/`email_verified`/`sub`/roles checks untouched in the diff). `time claims` keeps the
      `exp: now()-31` → `expired`, `exp: now()-29` → ok, future `iat` and `nbf` assertions; only the
      `iat: now() - 931` line was removed. All identity tests pass.
- [x] AC3 — docs state 12 hours and cite D46 — evidence: `server/README.md:27` "tokens older than 12 h rejected
      (D46)", `server/README.md:29` "(up to 12 hours, accepted; D46)", `README.md:23` "lasts 12 hours (D46; 15
      minutes until Identity issues 12-hour tokens, M-29)", `scripts/dev-token.sh:2` "valid for up to 12 hours
      (D46)"; the `dev-token.sh` diff touches only a `#` line. Grep for `15 min` / `15-minute` / `900` in
      `server/*.js`, `server/README.md`, `README.md`, `scripts/`, `src/features/auth/*.ts` finds only the
      intended M-29 clause in `README.md:23`.
- [x] AC4 — checks green — evidence: see Checks above.
- [x] AC5 — SPA token store behaves with 12 h `expires_in` — evidence: `src/features/auth/tokenStore.test.ts`
      › `caches a 12-hour token until expires_in - 60 s` (reused at +43,139,999 ms, refetched at +43,140,000 ms)
      and `src/features/auth/identityClient.test.ts` › `token accepts expires_in 43200 (D46)` pass;
      `tokenStore.ts` and `identityClient.ts` unchanged.

Ming verification after merge (not verified here, carry into the PR):
- Order: T-026 must be **deployed to production** before M-29 sets `ACCESS_TOKEN_TTL_SECONDS=43200`.
- After both: a fresh `scripts/dev-token.sh` reports `expires_in` 43200.
- `pnpm dev` with the dev token proxy still loads items more than 1 hour after the token was minted.
- On the real site (phone), a signed-in session keeps working for more than 1 hour with no 401/retry burst and no
  `auth_denied expired` for tokens younger than 12 h.

### Scope
All code and doc changes are in the plan's file list. `work/ming-todo.md` (plan-approval entry, and the M-29
"after T-026 is deployed to production" wording = A2 as approved) and `work/tickets/T-026/*` are orchestrator
bookkeeping, not implementer changes; A2 was approved by Ming as a follow-up for the orchestrator. No unjustified
out-of-plan change.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no data-access change. R2/R4/R5: not touched. R3: no secret, no new `VITE_*`. R6: no UI
copy change. R7: inside the plan. R8: the changed bound and the SPA behaviour have unit tests. R9: no UI change.
R10: retired / not touched.

### Nits (do not block)
- `server/identity.test.ts:167`: the `now() - 43229` case has a 1 s margin. If more than one second boundary passes
  between `sign` and `check`, the age becomes 43231 and the assertion fails. Pinning `Date` with
  `vi.useFakeTimers({ toFake: ["Date"] })` (as at `:303`) would make the boundary exact. 22 runs were green.
- `README.md:23` and `scripts/dev-token.sh:2` are now longer than the ~120-column wrapping the surrounding prose
  uses; oxfmt does not flag it.

### Follow-ups (out of scope)
- A1 (approved): `debt` issue (`project:tudocuatui`) for optional `min(expires_in, 900) - 60` caching in
  `src/features/auth/tokenStore.ts:66` so client-side revocation (password reset, sign-out elsewhere, lost role) is
  noticed in ~15 min rather than up to 12 h. Orchestrator to open it if not already open.
- Flaky-test risk: `src/App.test.tsx` › `stale and never stat cards toggle a filter` runs at ~4.6 s against the
  5 s default timeout (other App tests 2–3 s). Worth a `debt` issue: raise the timeout for `App.test.tsx` or reduce
  its per-test render cost. Unrelated to T-026.
