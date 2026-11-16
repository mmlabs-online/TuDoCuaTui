# Review — T-019.9

## Attempt 1 — 2026-11-16
Verdict: PASS

Reviewed `git diff origin/main...HEAD` at `9891e84` (board files under `work/` ignored; the only non-ticket `work/` change is the
orchestrator's plan-approval tick in `work/ming-todo.md`, not implementer work). Plan approved by Ming 2026-11-16 (`ticket.md:49`).

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- format:check: `pnpm format:check` exit 0 (258 files)
- test: `pnpm test` exit 0 — Test Files 99 passed | 10 skipped (109); Tests 1230 passed | 205 skipped (1435). Skipped = DB-backed suites (no Postgres here); matches impl-log.
- test:coverage: `pnpm test:coverage` exit 0 (thresholds pass without the `server/access.js` entry)
- build: `pnpm build` exit 0 ("✓ built")
- AC1 grep: `test ! -e server/access.js && test ! -e server/access.test.ts` → true; `grep -rnE 'access\.js|CF_ACCESS_|TUDO_ACCESS_DISABLED' --exclude-dir={node_modules,work,coverage,dist,.git} .` → no output (exit 1)
- `bash -n scripts/check-image.sh` exit 0. `check-image.sh` was **not run** (no Docker daemon in this sandbox); reviewed by reading. **The CI `image` job must be green on the PR before merge.**

### Acceptance criteria
- [x] 1a No `access.js`; no `CF_ACCESS_*` / `TUDO_ACCESS_DISABLED` outside `work/` — evidence: AC1 grep above (empty); both files deleted; `vitest.config.ts` entry removed; injection payloads in `scripts/drive-connect.test.ts:360`, `scripts/deploy-envfile.test.ts:178,225` swapped to `NODE_ENV=development` (same intent: a newline-injected second variable is rejected).
- [x] 1b Production requires identity config; `TUDO_AUTH_MODE` unset or exactly `identity`, anything else exits 2 without echoing — evidence: `server/auth.js:20-21` (`env.TUDO_AUTH_MODE ?? "identity"`, so `""` is still an error; fixed message "TUDO_AUTH_MODE must be identity or unset", contains neither `access` nor `bogus`), then `loadIdentityConfig` (issuer required) and the owner checks (unchanged messages). Tests: `server/auth.test.ts` › "unset and explicit identity both load identity…", "invalid modes throw AuthConfigError naming the variable, not the value" (`""`, `Identity`, ` identity`, `bogus`, `access`), "missing or malformed MM_IDENTITY_ISSUER is an IdentityConfigError", owner cases; `server/index.cli.test.ts` › "NODE_ENV=production with no auth config exits 2 naming MM_IDENTITY_ISSUER", misconfig table with `bogus` and `access` (value asserted absent from output), "production, TUDO_AUTH_MODE unset, issuer + owner: starts, logs 'auth: identity', /healthz auth identity, /api 401", explicit-identity variant kept. All pass. `server/index.js:32-33` still prints only `config error: <fixed message>` for known errors and a bare `config error` otherwise.
- [x] 1c No dev bypass left — evidence: `server/auth.js:35-37` `createAuth` returns only `createIdentityAuth(...)`; `createFixedAuth` / `requestAuth` no longer exist anywhere (grep); `server/ai/config.js:26-36` takes only `importKek`, the "request auth off" branch is gone; no new env variable introduced. `TUDO_ACCESS_DISABLED=1` is now simply unread (A2), with no path left to enable.
- [x] 2 `check-image.sh` asserts `/api/items` without a bearer → 401 — evidence (read): `scripts/check-image.sh:148-149` (no bearer → 401) and `:150-151` (malformed bearer → 401) on the main smoke, which runs `"${ID[@]}" -e TUDO_AUTH_MODE=identity` with `--network none` (`:124-125`) and asserts `"auth":"identity"` (`:134-136`); db smoke uses `"${ID[@]}"` with the mode unset (`:170-172`) and asserts `/api/locations` → 401 (`:180-181`). Start checks `:101-113` cover no config, no owner, malformed/nil owner, `bogus`, `access` (new), identity without issuer, foreign/http issuer (now with an owner, so they fail on the issuer, not on the owner), migrate, drive-smoke, partial Google, malformed AI_KEK — each consistent with `loadAuthConfig` order (mode → issuer → owner). `IDNAME` and its trap entry removed consistently; no other reference remains. `grep -n 'without a bearer'` → lines 149, 181. Pending: CI `image` job.
- [x] 3 `opaqueredirect` branches removed (mode.ts, repo.http.ts, plus aiSettings.ts and photoUrls.ts per A3), tests updated — evidence: `grep -rn opaqueredirect src/ server/` → only test fixtures (`mode.test.ts:11`, `repo.http.test.ts:390`, `aiSettings.test.ts:75`, `photoUrls.test.ts:143`). `redirect: "manual"` kept at `mode.ts:18`, `repo.http.ts:42`, `aiSettings.ts:51`, `photoUrls.ts:70`, and `createAuthedFetch` passes `init` through, so the bearer never follows a redirect. A redirect is status 0, so `createAuthedFetch` never retries or calls `onAuthLost` (it acts only on 401) → no sign-out. Tests: `mode.test.ts` › "a redirect -> local, no retry" (detectMode and detectRuntime, one fetch each); `repo.http.test.ts` › "a redirect → ApiError(0, unexpected), not the unauthorized copy; no onAuthLost" (asserts `onAuthLost` not called, one fetch); `aiSettings.test.ts` › "maps a redirect to internal (not unauthorized)"; `photoUrls.test.ts` "redirect" row. All pass.
- [x] 4a Runbook text for M-22 and new M-26 — evidence: plan sections *Runbook text for M-22* and *New ops item*; per plan and D16, `/run` copies them into `work/ming-todo.md` on DONE (implementer correctly did not).
- [x] 4b All checks pass — see Checks.

### Scope (R7)
The 32 non-`work/` files in the diff are exactly the 32 rows of the plan's *Files to create / modify* table; no new files. Two
in-file edits beyond the plan's line list (README code-map row "Access JWT check" → "Identity token check"; `server/README.md`
AI-section sentence about the removed `ai disabled: request auth off` branch) are justified in impl-log *Out-of-plan files*: both
describe code deleted by this ticket (AC1/A4). Accepted. `src/features/auth/**` untouched (A5); Figma Make files untouched.

### Tests not weakened
Removed cases are Access-only: access fixture/`requestAuth`/`TUDO_ACCESS_DISABLED` cases in `server/auth.test.ts`, "TUDO_ACCESS_DISABLED refused in production", "/api 401 with Access on" (now covered by the two identity start tests), "valid AI_KEK with Access on/off" (the identity "ai configured" case still asserts the KEK is never printed), and the "request auth off" AI case. Runtime cases (SIGTERM, unreachable DATABASE_URL with secret-not-printed, drive, AI_KEK malformed, partial Google) now run with the issuer and keep every assertion. The invalid-mode test was strengthened (asserts neither `bogus` nor `access` appears for every value, and adds `access`). `mode.test.ts` keeps `"auth":"access"` as an unknown value → `null`.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: local mode untouched; `pnpm dev`/HTML `/healthz` still → local; a redirect now also → local (accepted risk A9, pinned by tests). No component calls a backend directly.
- R3: no secret added; the only bypass removed; `MM_IDENTITY_ISSUER` / `TUDO_OWNER_SUB` are not secret. The deploy mirror drops a non-secret AUD and adds non-secret identity values.
- R8: every logic change has updated tests (auth, index CLI, ai/config, mode, repo.http, aiSettings, photoUrls, boot).
- R10: no Figma Make file touched.

### Ming verification after merge
- CI `image` job (runs `scripts/check-image.sh`) green on the PR — required before merge (not runnable in the review sandbox).
- After the release containing T-019.9 (M-22): `curl -s https://tudocuatui.mmlabs.online/healthz` → `"auth":"identity"`; `curl -i https://tudocuatui.mmlabs.online/api/items` → 401; private window shows TuDo sign-in, not Access; phone sign-in loads items and photos; Zero Trust has no Access app for the host (confirm only).
- M-26: drop `CF_ACCESS_*` from the live deployment compose; keep `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER` while a rollback to an image ≤ v0.2.6 may be needed.
- The PR description must carry the plan's *Rollback ordering* section (also in impl-log).

### Nits (do not block)
- `src/data/photoUrls.test.ts:141-144`: the "redirect" row is `new Response("")` (status 200, ok) with only `type` overridden, so it now rejects via the content-type check, not the `!res.ok` path a real opaque redirect (status 0) takes. A status-0 fixture like the one in `mode.test.ts:10-11` would model the real case more faithfully.
- `server/index.cli.test.ts` "NODE_ENV=production with no auth config…": the `run` helper always injects `TUDO_OWNER_SUB`, so this is "no issuer" rather than truly no config; the truly empty case is covered by `check-image.sh:101`.

### Follow-ups (out of scope)
- From the plan: `needsAuth = mode === "api"`, drop `AuthRoot`'s `identity` prop and the stale "Access mode" comment at `src/features/auth/AuthRoot.tsx:12` (High tier, A5).
- From the plan: host guard so `tudocuatui.mmlabs.online` never falls back to local mode on a redirect (A9).
- From the plan: `check-image.sh` grep of `dist/` for token-like `localStorage.setItem(` keys (A11).
- From the plan: drop `TUDO_AUTH_MODE` from the deployment compose once pre-T-019.9 rollback is no longer needed; consider a coverage threshold for `server/auth.js`.
