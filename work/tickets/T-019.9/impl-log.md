# Implementation log — T-019.9

## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| `server/access.js` | **deleted** (AC1) |
| `server/access.test.ts` | **deleted** (tests of the deleted module, AC1) |
| `server/auth.js` | Identity only: no `./access.js` import, no access branch, no `TUDO_ACCESS_DISABLED` guard, no `requestAuth`. `TUDO_AUTH_MODE` unset or exactly `identity`, otherwise `AuthConfigError("TUDO_AUTH_MODE must be identity or unset")` (value never in the message). Owner checks/messages kept; `authLabel`, `ownerSubOf`, `createAuth` kept (AC1, A1, R3) |
| `server/auth.test.ts` | Access fixture/cases and `requestAuth` dropped; cases rewritten per *Tests to write* (AC1, R8) |
| `server/index.js` | `AccessConfigError` / `requestAuth` gone; known errors = `AuthConfigError` + `IdentityConfigError`; logs `auth: ${mode}` only; `initAi(process.env, { importKek })` (AC1) |
| `server/index.cli.test.ts` | Every `TUDO_ACCESS_DISABLED` / `CF_ACCESS_*` env swapped for `MM_IDENTITY_ISSUER`; access-only cases deleted; new cases added (AC1, R8) |
| `server/app.js` | `authMode` default `"access"` → `"identity"` (AC1) |
| `server/app.test.ts` | `/healthz` expectation → `auth: "identity"` (`Cf-Access-Jwt-Assertion` header test at :168 left as is, A7) |
| `server/ai/config.js` | `requestAuth` dependency and the dead "ai disabled: request auth off" branch removed; JSDoc updated (A4) |
| `server/ai/config.test.ts` | `deps()` takes no argument; "request auth off" case deleted; malformed case runs once (R8) |
| `src/data/mode.ts` | `opaqueredirect` branch and Access comment removed (new "manual: a redirect is never followed…" comment); `AuthKind = "identity" \| null`; only `"identity"` accepted from `/healthz`; `redirect: "manual"` kept (AC3) |
| `src/data/mode.test.ts` | Both `opaqueredirect → api` tests replaced by "a redirect → local, no retry"; `"auth":"access"` moved into the unknown-auth → `null` case (AC3) |
| `src/data/repo.http.ts` | `opaqueredirect` branch removed; redirect now → `ApiError(0, "unexpected")` (AC3) |
| `src/data/repo.http.test.ts` | "401 and opaque redirect" split: 401 kept; new identity-harness test "a redirect → ApiError(0, unexpected), not the unauthorized copy; no onAuthLost" (AC3) |
| `src/data/aiSettings.ts` | `opaqueredirect` branch removed; redirect → `AiSettingsError(0, "internal")` (A3) |
| `src/data/aiSettings.test.ts` | "maps a redirect to internal (not unauthorized)" (A3, R8) |
| `src/data/photoUrls.ts` | `opaqueredirect` branch removed (A3) |
| `src/data/photoUrls.test.ts` | `test.each` row renamed `"redirect"` (A3, R8) |
| `src/data/usePhotoUrl.ts` | Comment only: "Null in local mode" |
| `src/lib/boot.ts` | Comment only: dropped "(identity or access)" (A5, logic unchanged) |
| `src/lib/boot.test.ts` | `auth: "access"` rows: `:71` → `auth: null` + `verify`; duplicates `:72`, `:74` deleted (typecheck) |
| `src/main.tsx` | Comment only (plan text) |
| `scripts/check-image.sh` | `ACCESS` → `ID` (issuer + dummy owner), header comment rewritten; `CF_ACCESS_\|` dropped from the env prefix list; start checks rewritten (no config, no owner, malformed/nil owner, `bogus`, `access` (new), identity without issuer, foreign/http issuer, migrate, drive-smoke, partial Google, malformed AI_KEK); `TUDO_ACCESS_DISABLED` check and duplicate identity-without-owner check dropped; main smoke + identity smoke merged into one container with `"${ID[@]}" -e TUDO_AUTH_MODE=identity` asserting `"auth":"identity"`, `/api/items` without a bearer → 401, malformed bearer → 401; `IDNAME` + trap entry removed; db smoke uses `"${ID[@]}"` with mode unset, message "without a bearer" (AC2) |
| `scripts/drive-connect.test.ts` | Injection payload `TUDO_ACCESS_DISABLED=1` → `NODE_ENV=development` (AC1) |
| `scripts/deploy-envfile.test.ts` | Same payload swap at both places (AC1) |
| `vitest.config.ts` | `"server/access.js": thresholds` entry removed (AC1) |
| `server/README.md` | Env table, routes line, identity-token line, image paragraph, local-run (issuer + owner, no bypass, M-19 note, use `pnpm dev`), photo-reads line ("authenticated users"), AI section's request-auth-off sentence (docs, AC1) |
| `README.md` | `:3`, `:13`, `:25-27`, `:60-69` per plan, plus the `server/` code-map row "Access JWT check" → "Identity token check" (docs, AC1) |
| `.env.example` | `CF_ACCESS_*` dropped from the name list (AC1) |
| `Dockerfile` | Comments only (`:3-4`): runtime config names, no dev-bypass mention; no instruction change |
| `.github/risk-tiers.yml` | Comment only: "Access JWT check" → "Identity token check" |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Mirror (A8): `CF_ACCESS_*` removed; `TUDO_AUTH_MODE: identity` + `MM_IDENTITY_ISSUER: https://api.mmlabs.online` added; header comments rewritten (Identity bearer, JWKS egress to api.mmlabs.online via `tunnel`, keep `TUDO_AUTH_MODE: identity` for rollback to ≤ v0.2.6); `x-owner-sub` stays `""` |

No new files. `src/features/auth/**` not touched (A5). Figma Make files not touched (R10). `work/ming-todo.md`, `work/backlog.md`, `plan.md` not touched; the deployment repo was not fetched or edited (M-26).

### Tests added / changed
- `server/auth.test.ts` › "unset and explicit identity both load identity; authLabel is identity"
- `server/auth.test.ts` › "invalid modes throw AuthConfigError naming the variable, not the value" (`""`, `Identity`, ` identity`, `bogus`, `access`; message contains neither `bogus` nor `access`)
- `server/auth.test.ts` › "missing or malformed MM_IDENTITY_ISSUER is an IdentityConfigError" (`{}`, `NODE_ENV=production` only, http issuer)
- `server/auth.test.ts` › "missing or blank TUDO_OWNER_SUB is 'must be set'", "malformed or nil … 'must be a valid UUID', value not in the message", "ownerSubOf: canonical id"
- `server/index.cli.test.ts` › "NODE_ENV=production with no auth config exits 2 naming MM_IDENTITY_ISSUER"
- `server/index.cli.test.ts` › "TUDO_OWNER_SUB missing, malformed or nil -> exit 2, value never printed" (mode unset + issuer; merged with the former identity-only owner test)
- `server/index.cli.test.ts` › "TUDO_AUTH_MODE and MM_IDENTITY_ISSUER misconfiguration …" (`access` added, `TUDO_ACCESS_DISABLED` combo rows dropped)
- `server/index.cli.test.ts` › new "production, TUDO_AUTH_MODE unset, issuer + owner: starts, logs 'auth: identity', /healthz auth identity, /api 401"; explicit-`identity` variant kept
- `server/index.cli.test.ts` › runtime cases (SIGTERM, unreachable DATABASE_URL, drive not/configured, ai not configured, malformed AI_KEK, partial Google) now run with the issuer. Deleted: "TUDO_ACCESS_DISABLED refused in production", "/api 401 with Access on" part, "valid AI_KEK with Access on", "valid AI_KEK with Access off".
- `server/ai/config.test.ts` › "valid -> configured", "unset or empty -> not configured", "malformed throws AiConfigError, and AI_KEK is removed"
- `server/app.test.ts` › `/healthz` → `{status:"ok", auth:"identity"}`
- `src/data/mode.test.ts` › "a redirect -> local, no retry" (`detectMode` and `detectRuntime`); "missing or unknown auth -> null (also auth access from an old server)"
- `src/data/repo.http.test.ts` › "a redirect → ApiError(0, unexpected), not the unauthorized copy; no onAuthLost" (identity harness exposes `onAuthLost`, so it is asserted)
- `src/data/aiSettings.test.ts` › "maps a redirect to internal (not unauthorized)"
- `src/data/photoUrls.test.ts` › "redirect rejects, caches nothing, retries on the next acquire"
- `src/lib/boot.test.ts` › `needsAuth` truth table without `"access"`

### Checks (actual output summary)
- typecheck: `pnpm typecheck` exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors)
- format:check: `pnpm format:check` exit 0 — "All matched files use the correct format." (258 files)
- test: `pnpm test` exit 0 — Test Files 99 passed | 10 skipped (109); Tests 1230 passed | 205 skipped (1435). Skipped = DB-backed suites (no Postgres in this sandbox), same as before.
- test:coverage: `pnpm test:coverage` exit 0 — thresholds pass after removing the `server/access.js` entry.
- build: `pnpm build` exit 0 — "✓ built in 770ms".
- AC1 grep: `grep -rnE 'access\.js|CF_ACCESS_|TUDO_ACCESS_DISABLED' --exclude-dir={node_modules,work,coverage,dist,.git} .` → no output (exit 1). `test ! -e server/access.js && test ! -e server/access.test.ts` → true.
- AC3 grep: `grep -rn opaqueredirect src/` → only test fixtures (`mode.test.ts:11`, `repo.http.test.ts:390`, `aiSettings.test.ts:75`, `photoUrls.test.ts:143`) that model what fetch returns for a redirect; no product code.
- AC2: `bash -n scripts/check-image.sh` exit 0. `scripts/check-image.sh` was **not run**: the `docker` CLI exists but the daemon is unreachable (`docker info` exit 1). The CI `image` job on the PR must run it. `grep -n 'without a bearer' scripts/check-image.sh` → main smoke and db smoke lines. shellcheck is not installed.

### Rollback ordering (from the plan; must also go into the PR description)
- Pre-T-019.9 images (≤ v0.2.6 and anything released before this ticket) default to `access` when `TUDO_AUTH_MODE` is unset: if the live compose drops `TUDO_AUTH_MODE: identity`, rolling back to one exits 2.
- The T-019.9 image starts with the live #71 compose as is (`TUDO_AUTH_MODE: identity` + leftover `CF_ACCESS_*`, which are no longer read), and also with those lines removed (mode unset → identity). The release does not depend on a deployment-repo PR.
- The T-019.9 image exits 2 on `TUDO_AUTH_MODE: access`; rollback is "release an older image".
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` can be removed from the live compose at any time (M-26).
- Keep `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER` in the live compose while a rollback to a pre-T-019.9 image may be needed.

### Out-of-plan files
None. Two edits inside planned files went slightly beyond the plan's line list, both stale Access wording the AC intends to remove:
- `README.md` code-map row for `server/` ("Access JWT check" → "Identity token check").
- `server/README.md` AI section: removed the sentence about "request auth off (`access === null`) … `ai disabled: request auth off`", which described the branch deleted from `server/ai/config.js` (A4).

### Follow-ups (noticed, not done)
- From the plan: `needsAuth = mode === "api"`, drop `AuthRoot`'s `identity` prop and its stale "Access mode" comment (`AuthRoot.tsx:12`, High tier `src/features/auth`, A5).
- From the plan: host guard so `tudocuatui.mmlabs.online` never falls back to local mode on a redirect (A9).
- From the plan: `check-image.sh` grep of `dist/` for token-like `localStorage.setItem(` keys (A11).
- From the plan: drop `TUDO_AUTH_MODE` from the deployment compose once rollback to pre-T-019.9 images is no longer needed; consider a coverage threshold for `server/auth.js`.
- `server/README.md` still says "In identity mode the SPA fetches it with the bearer" (photo route) and "Behind the same access check" — generic wording, accurate, left as is.
- On DONE, `/run` must copy the plan's M-22 runbook text and the new M-26 item into `work/ming-todo.md` (not done here, D16).
- Run `scripts/check-image.sh` (CI `image` job) — not runnable in this sandbox.

### Scope self-check
- Could the diff be smaller? No: every change maps to a plan row; `src/features/auth/**` untouched.
- Diff size: +211 / −655 lines (32 files including the two deletions), not committed.
