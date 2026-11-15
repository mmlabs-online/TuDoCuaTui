## Attempt 1 — 2026-11-14
Verdict: PASS

### Checks (run by reviewer)
Branch `claude/magical-cori-2ssw8l`, base `origin/main`. DB tests ran against the reviewer's own throwaway Postgres 16 (initdb `--auth=scram-sha-256`, 127.0.0.1:54331, `TEST_DATABASE_URL` set); it was stopped and its directory removed afterwards.
- typecheck: exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no output)
- format:check: exit 0 (oxfmt, 211 files)
- test: 85 files, 1085 tests passed (DB tests included). Same numbers as impl-log.md.
- build: built OK (`dist/assets/index-*.js` 258.80 kB)
- `scripts/check-image.sh`: not run (no Docker here); reviewed by reading, `bash -n` OK. It runs in the CI image job.

### Acceptance criteria
- [x] Verifier follows `consumers.md` (A11, A12) — `server/identity.js:403-411` `jwtVerify` with `algorithms:["ES256"]`, exact `issuer`, `audience:"tudocuatui"`, `typ:"at+jwt"`, `requiredClaims` exp/iat/sub/jti/iss/aud, `clockTolerance:30`, `maxTokenAge:900`; post-checks on `aud` (string), `jti` (non-empty string), `email_verified === true`, `toUserId(sub) === sub`, a `tudocuatui:<x>` role. Remote JWKS: cache 300 s, cooldown 60 s, timeout 5 s, `User-Agent: tudocuatui-server`, created lazily. Tests: `server/identity.test.ts` (16 verifier cases, `remote JWKS` › cooldown + rotation, › JWKS failures fail closed, 5 `loadIdentityConfig` cases), all green.
  Reviewer hand-check: ES256 tokens signed with a local key, served by a local `http://localhost:<port>` JWKS, through `loadAuthConfig` → `createAuth` → `createApp` with a counting pool. Valid token → 200 on `/api/locations`, pool params carry the canonical `sub` (also with header `typ: AT+JWT`). 401 with 0 DB calls and log `{event:"auth_denied",code}` only for: HS256 (`alg`), `alg:none` (`malformed`), aud `ricotdin` and `["tudocuatui"]` (`claim_aud`), foreign iss (`claim_iss`), `typ: JWT` (`claim_typ`), exp now−31 (`expired`), iat now+60 (`claim_iat`), iat now−1000 (`expired`), email_verified false/missing/`"true"` (`email_unverified`), uppercase and space-padded `sub` (`sub_invalid`), roles without `tudocuatui:` and bare `tudocuatui:` (`no_role`), no jti (`claim_jti`), other key same kid (`signature`), unknown kid (`unknown_kid`), >4096-char token (`too_large`). One JWKS fetch for the whole run. No log contained the token or `sub`.
- [x] `TUDO_AUTH_MODE` validated; bad or missing config in production → exit 2 — `server/auth.js:259-269`, `server/index.js` catch block; tests `server/auth.test.ts` (5 cases), `server/index.cli.test.ts` › "TUDO_AUTH_MODE and MM_IDENTITY_ISSUER misconfiguration -> exit 2, values never printed". Reviewer ran `node server/index.js`: `TUDO_AUTH_MODE=bogusXYZ` and `" identity"` → 2, "must be access or identity"; identity without issuer → 2; production + `https://evilXYZ.example`, `http://api.mmlabs.online`, `https://evil.example/path` → 2; identity + `TUDO_ACCESS_DISABLED=1` → 2. No value printed in any case. Unset mode keeps the existing access behaviour (existing CLI tests green).
- [x] `/healthz` → `{status:"ok", auth}`; logs carry only `code` — `server/app.js:218`, `:226`. Reviewer run: dev-off access → `{"status":"ok","auth":"access"}`; production identity with `https://api.mmlabs.online`, no `CF_ACCESS_*`/owner → starts, prints `auth: identity`, `{"status":"ok","auth":"identity"}`, `/api/items` 401 logging `{"event":"auth_denied","code":"missing"}`. Test `app.test.ts` › "a valid token reaches the API as the canonical sub; logs hold no token, sub, email or jti".
- [x] All checks pass — see above.
- [x] Extra (ticket notes): `requestAuth` true for identity and verified access, false for dev-off (reviewer call on `loadAuthConfig` results; `auth.test.ts` › requestAuth; `index.cli.test.ts` › identity + AI_KEK → "ai configured"). No `pool`/`withUser` in `server/identity.js` or `server/auth.js`. `scoping.test.ts` now lists `server/**/*.js` minus `test/` and asserts on the list.

Ming verification after merge: none new (plan). Identity in production is verified at M-21.

### Issues
None.

### Deviation judged: `alg:none` → `malformed` instead of `alg`
An unsecured JWT has an empty third segment, so `TOKEN_RE` (`server/identity.js:309`) rejects it before jose runs; the key getter is never called (asserted in `identity.test.ts` › "alg HS256 and RS256 -> alg; an unsecured token -> malformed"). This is earlier and stricter than the plan, still fails closed, and the code is only diagnostic (the response is the same 401). Accepted; `malformed` is in the README code list.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: browser and local mode untouched (`src/**` not in the diff). R2: no migration. R3: new variables `TUDO_AUTH_MODE`, `MM_IDENTITY_ISSUER` are server-side and not secret; no `VITE_*`. R7: every changed file is in the plan's file table (plus ticket bookkeeping). R8: new pure logic is unit-tested. R10: `AGENTS.md`, `.figma/`, `vite.config.ts` untouched.

### Nits (do not block)
- `server/scoping.test.ts:551` `!f.startsWith("test")` would also skip a future `server/testing.js` or `server/tests.js`; `!f.startsWith("test/")` is exact.
- A token without a `kid` is accepted when the JWKS has exactly one ES256 key (jose selects by `alg`). Not a security gap (signature still from the Identity key), but checklist item 3 says "select by `kid`"; requiring `kid` in the header would be a one-line hardening.
- `MM_IDENTITY_ISSUER` with uppercase host letters fails with the generic "must be https://<host>" message, also in production, rather than the production-specific message. Exit 2 either way.

### Follow-ups (out of scope)
- Abuse limits before Access removal (plan A-T5: AI global-ceiling exhaustion, tag-photo slot holding, photo PUT slowloris), gating T-019.9 / M-22 and T-019.10 — to be created by the orchestrator.
- First CI image-job run must confirm the new `check-image.sh` lines (identity smoke, four `expect_exit 2`, `"auth":"access"`).
