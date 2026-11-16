Status: READY

# Plan — T-019.9: Cutover cleanup: remove Cloudflare Access code

## Feature summary
Slice of the T-019 umbrella (`work/tickets/T-019/plan.md`, approved by Ming 2026-11-13).

- Umbrella *Split proposal*, T-019.9: "Cutover cleanup: remove Access code + `CF_ACCESS_*`, Identity env in compose | S | High (deploy config) / plan-approval".
  - ACs: "no `access.js`, no `CF_ACCESS_*`/`TUDO_ACCESS_DISABLED` anywhere outside `work/`; production requires identity config; `check-image.sh` asserts `/api/items` without bearer → 401; `opaqueredirect` branches gone with tests updated; runbook text for M-21". The ticket renumbers that last item to M-22.
- Umbrella *Files*, T-019.9 row: "delete `server/access.js`, `server/access.test.ts`; edit `server/index.js`, `server/app.js`, `src/data/mode.ts`, `src/data/repo.http.ts` (drop `opaqueredirect`), `scripts/check-image.sh`, `deploy/…/compose.yml` (drop `CF_ACCESS_*`, add `TUDO_AUTH_MODE`/`MM_IDENTITY_ISSUER`), `server/README.md`, `.env.example`, `README.md`".
- Umbrella A14: "`opaqueredirect` branches removed only in T-019.9."
- D31: "Cloudflare Access stays until Identity sign-in and owner scoping are verified in production (M-21), then is removed (M-22). Local mode unchanged (R1)."
- D39: "TuDo public without Cloudflare Access, identity mode now … Production switches to `TUDO_AUTH_MODE: identity` on v0.2.6 (deployment#71)."
- `work/ming-todo.md`:
  - M-21 is ticked (2026-11-16, identity mode live via deployment#71).
  - M-22 is open: "the Access application is already gone (get-identity 404). Remaining: T-019.9 code cleanup; then tick."

Ticket ACs (`work/tickets/T-019.9/ticket.md`):
1. No `access.js`, no `CF_ACCESS_*` / `TUDO_ACCESS_DISABLED` anywhere outside `work/`; production requires identity config.
2. `check-image.sh` asserts `/api/items` without a bearer → 401.
3. `opaqueredirect` branches in `mode.ts` and `repo.http.ts` removed, tests updated.
4. Runbook text for M-22; all checks pass.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1a | No `access.js`; no `CF_ACCESS_*` / `TUDO_ACCESS_DISABLED` outside `work/` (A6: git-ignored `coverage/` and `dist/` excluded). | Run `test ! -e server/access.js && test ! -e server/access.test.ts`. Then run `grep -rnE 'access\.js\|CF_ACCESS_\|TUDO_ACCESS_DISABLED' --exclude-dir={node_modules,work,coverage,dist,.git} .`, which must print nothing. Because no file names these variables any more, no code can read them. That is the proof that leftover values in a compose file are ignored (A2). |
| 1b | Production requires identity config. `TUDO_AUTH_MODE` is unset or `identity` (A1); any other value exits 2 without echoing it. | `server/auth.test.ts`: "unset and `identity` both load identity", "invalid modes (`access`, `bogus`, `""`, `Identity`, ` identity`) throw AuthConfigError naming the variable, not the value", "missing issuer → IdentityConfigError". `server/index.cli.test.ts`: "production without MM_IDENTITY_ISSUER exits 2", "TUDO_AUTH_MODE=access / bogus exits 2, value not printed", "production, mode unset, issuer + owner: starts, logs `auth: identity`, `/healthz` `auth: identity`, `/api/items` 401". `scripts/check-image.sh` start checks (row 2). |
| 1c | No dev bypass is left: no code path runs `/api` without a verified bearer (R3, architect R-4). | Read `server/auth.js`: `createAuth` returns only `createIdentityAuth`. `server/ai/config.js` no longer takes `requestAuth`; `server/ai/config.test.ts` is updated. |
| 2 | `check-image.sh` asserts `/api/items` without a bearer → 401 (plus a malformed bearer → 401 and `/healthz` `"auth":"identity"`) in the main smoke. The start checks cover: no config, no owner, malformed owner, nil owner, `TUDO_AUTH_MODE=access`, `TUDO_AUTH_MODE=bogus`, foreign issuer and http issuer, each → exit 2. | Read the diff. Run `bash -n scripts/check-image.sh`. The CI `image` job, which runs `check-image.sh` on the PR, must be green. Run `grep -n 'without a bearer' scripts/check-image.sh`. |
| 3 | The `opaqueredirect` branches are removed from `mode.ts` and `repo.http.ts`, and from the same Access artifact in `aiSettings.ts` and `photoUrls.ts` (A3). Tests are updated: a redirect on `/healthz` → local mode; a redirect on `/api` → `ApiError(0, "unexpected")`, not 401 (no sign-out). | Run `grep -rn opaqueredirect src/`. It may only print test names or fixtures that describe "a redirect". Tests: `mode.test.ts` › "a redirect → local", `repo.http.test.ts` › "a redirect → unexpected, not unauthorized", `aiSettings.test.ts` › "maps a redirect to internal", `photoUrls.test.ts` › "redirect rejects, caches nothing, retries". |
| 4a | Runbook text for M-22 (below) plus the new ops item M-26 (below). | Read this plan's sections *Runbook text for M-22* and *New ops item*. On DONE, `/run` copies both into `work/ming-todo.md`. The implementer does not edit `work/ming-todo.md` (planner rule, D16). |
| 4b | All checks pass. | Run `pnpm typecheck`, `pnpm format:check`, `pnpm test` and `pnpm build`, all green. Coverage thresholds still pass after the `server/access.js` entry is removed from `vitest.config.ts`. |

## Ming verification after merge
- After the release that contains T-019.9 (M-22 below):
  - `curl -s https://tudocuatui.mmlabs.online/healthz` shows `"auth":"identity"`.
  - `curl -i https://tudocuatui.mmlabs.online/api/items` gives 401.
  - A private window shows TuDo's sign-in, not an Access page.
  - Sign in on a phone and confirm the items and photos load.
- The Zero Trust dashboard has no Access application for `tudocuatui.mmlabs.online` (D39 says it is already gone; confirm only).
- M-26 (deployment repo, ops): drop `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` from the live compose. Keep `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER` (rollback ordering below).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/access.js` | **delete** | AC1 |
| `server/access.test.ts` | **delete** | AC1 (tests of the deleted module) |
| `server/auth.js` | Identity only. Remove the `./access.js` import, the `access` branch, the `TUDO_ACCESS_DISABLED` guard, `requestAuth`, the access arms of `ownerSubOf` and `createAuth`, and the `AuthConfig` access variant. `TUDO_AUTH_MODE` is unset or exactly `identity`; anything else throws `AuthConfigError("TUDO_AUTH_MODE must be identity or unset")`, which never contains the value. Keep the `TUDO_OWNER_SUB must be set` / `must be a valid UUID` messages. Keep `authLabel`, `ownerSubOf` and `createAuth`. Update the header comment. | AC1, A1, R3 |
| `server/auth.test.ts` | Drop the `AccessConfigError` import, the `ACCESS` fixture, the access cases and `requestAuth`. Rewrite the cases listed under *Tests to write*. | AC1, R8 |
| `server/index.js` | Drop the `AccessConfigError` import and catch arm, and the `requestAuth` import. The known errors are `AuthConfigError` and `IdentityConfigError`. Log ``auth: ${authConfig.mode}`` only, with no "access (dev, off)" line. Call `initAi(process.env, { importKek })`. | AC1 |
| `server/index.cli.test.ts` | Swap every `TUDO_ACCESS_DISABLED: "1"` and `CF_ACCESS_*` env for `MM_IDENTITY_ISSUER: "https://api.mmlabs.online"`. Delete the access-only cases. Add the cases listed under *Tests to write*. | AC1, R8 |
| `server/app.js` | Change the `authMode` default from `"access"` to `"identity"` (JSDoc too). `/healthz` keeps `{status:"ok", auth}`, a contract used by the SPA, `check-image.sh` and the ops checks. | AC1 |
| `server/app.test.ts` | Change the `/healthz` expectation (`:52`) to `auth: "identity"`. Leave the `Cf-Access-Jwt-Assertion` header at `:168` as is (A7). | test follows the default |
| `server/ai/config.js` | Remove the `requestAuth` dependency and the dead `"ai disabled: request auth off"` branch (architect R-5, A4). Update the JSDoc. | AC1 (dead dev-bypass path), R7 enumerated |
| `server/ai/config.test.ts` | `deps()` takes no argument. Delete "valid + request auth off". The malformed case runs once instead of looping over `requestAuth`. | R8 |
| `src/data/mode.ts` | Remove the `opaqueredirect` branch and its Access comment, and replace the comment with "manual: a redirect is never followed; it is not the Node server's JSON, so it counts as 'no' (local)". Narrow `AuthKind` to `"identity" \| null`, and accept only `"identity"` from `/healthz` (`access` → `null`). Keep `redirect: "manual"`. | AC3 |
| `src/data/mode.test.ts` | Replace the two `opaqueredirect → api` tests (`:39-43`, `:109-114`) with "a redirect → local, no retry". Change the `"auth":"access"` case (`:97-100`) into an unknown-value case → `auth: null`. | AC3 |
| `src/data/repo.http.ts` | Remove the `:47` branch. Keep `redirect: "manual"`, so the bearer never follows a redirect. A redirect then becomes `ApiError(0, "unexpected")`. | AC3 |
| `src/data/repo.http.test.ts` | Split `:316-326`: keep the 401 assertion. Add "a redirect → `ApiError` status 0 `unexpected`, not the unauthorized copy, and `onAuthLost` is not called", if the existing harness exposes `onAuthLost`; otherwise assert status and code only. | AC3 |
| `src/data/aiSettings.ts` | Remove the `:57` branch. A redirect then fails `res.json()` and becomes `AiSettingsError(0, "internal")`. | A3 (same Access artifact) |
| `src/data/aiSettings.test.ts` | Change `:74-77` to "maps a redirect to internal (not unauthorized)". | A3, R8 |
| `src/data/photoUrls.ts` | Remove the `:73` branch. A redirect then hits `!res.ok` → `ApiError(0, "unexpected")`. | A3 |
| `src/data/photoUrls.test.ts` | Keep the `opaqueredirect` row of the `test.each` at `:141-144`, renamed `"redirect"`. It still rejects, caches nothing and retries. | A3, R8 |
| `src/data/usePhotoUrl.ts` | Comment only (`:4`): "Null in local mode" (drop "and Access mode"). | stale Access wording in a file already in scope area |
| `src/lib/boot.ts` | Comment only (`:22`): drop "(identity or access)". The logic is unchanged (A5). | stale |
| `src/lib/boot.test.ts` | `AuthKind` no longer allows `"access"`, so typecheck needs this. Change `:71` to `auth: null` with `verify`, and delete `:72` and `:74`, which duplicate `:73` and `:75` once changed. | typecheck |
| `src/main.tsx` | Comment only (`:26`): "Lazy: local mode never loads the auth code (nor api mode without identity auth, outside a token page)". | stale |
| `scripts/check-image.sh` | Replace `ACCESS` with `ID=(-e MM_IDENTITY_ISSUER=https://api.mmlabs.online -e TUDO_OWNER_SUB=<dummy>)` and rewrite the header comment. Remove `CF_ACCESS_\|` from the `:57` prefix list. Rewrite the start checks (see *Approach* 5). Merge the main smoke and the identity smoke into one container. Use `ID` in the db smoke, and change the messages from "Access header" to "bearer". | AC2 |
| `scripts/drive-connect.test.ts` | `:360`: change the injection payload `"tok\nTUDO_ACCESS_DISABLED=1"` → `"tok\nNODE_ENV=development"`. The test intent is unchanged. | AC1 |
| `scripts/deploy-envfile.test.ts` | `:178`, `:225`: same payload swap → `\nNODE_ENV=development`. | AC1 |
| `vitest.config.ts` | Remove the `"server/access.js": thresholds` entry (`:60`). | AC1 (the file is deleted) |
| `server/README.md` | Env table: `TUDO_AUTH_MODE` becomes "optional; only `identity` (also the default); anything else exits 2". Remove the `CF_ACCESS_*` and `TUDO_ACCESS_DISABLED` rows. In the `TUDO_OWNER_SUB`, `AI_KEK` and `NODE_ENV` rows, drop the access wording. Routes line: `auth:"identity"`, bearer only. Image paragraph: no `CF_ACCESS_*`. Local run: issuer plus owner, with the honest note that sign-in from localhost is not possible (M-19 origin) and `pnpm dev` is for UI work. Photo-reads line: "authenticated users". | docs, AC1 |
| `README.md` | `:3`, `:13`, `:25-27`, `:60-69`: in-app sign-in with mmlabs Identity (D31/D39) replaces "Cloudflare Access in front, no in-app login (D23)". Run-image and troubleshooting text uses the issuer and owner. "Exit code 2: the identity config is missing". "Every `/api` call 401 while signed in: the container cannot reach `api.mmlabs.online` (JWKS)". | docs, AC1 |
| `.env.example` | `:1`: drop `CF_ACCESS_*` from the list of names. | AC1 |
| `Dockerfile` | Comments only (`:3-4`): runtime config = `DATABASE_URL` (env file) plus `TUDO_AUTH_MODE` / `MM_IDENTITY_ISSUER` / `TUDO_OWNER_SUB` (compose). No dev-bypass mention. No instruction changes. | AC1 |
| `.github/risk-tiers.yml` | Comment only (`:9`): "Access JWT check" → "Identity token check". | stale wording (no tier change) |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | Mirror of the live deployment#71 shape (A8). Remove the `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` lines. Add `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER: https://api.mmlabs.online` to `tudocuatui.environment`. Rewrite the `:10-12` comments: the server verifies Identity bearer tokens and fetches JWKS from `api.mmlabs.online`, so it needs egress through `tunnel`. Add a comment: keep `TUDO_AUTH_MODE: identity` while a rollback to an image ≤ v0.2.6 must stay possible. `x-owner-sub` stays `""` in the mirror. | umbrella Files row, AC1 |

There are no new files. `src/features/auth/**` is not touched (A5).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/auth.test.ts` › "unset and explicit `identity` both load identity; `authLabel` is `identity`" | AC1b, A1 |
| `server/auth.test.ts` › "invalid modes throw AuthConfigError naming the variable, not the value". Cases: `""`, `Identity`, ` identity`, `bogus`, `access`. Assert the message does not contain `bogus` / `access`. | AC1b, A1 |
| `server/auth.test.ts` › "missing or malformed MM_IDENTITY_ISSUER → IdentityConfigError" (no config at all, as in production with nothing set) | AC1b |
| `server/auth.test.ts` › keep "owner must be set" / "must be a valid UUID" (value not in the message), and "ownerSubOf canonical id" (identity half only) | AC1b |
| `server/index.cli.test.ts` › "NODE_ENV=production with no auth config exits 2 naming MM_IDENTITY_ISSUER" (replaces the CF_ACCESS test) | AC1b |
| `server/index.cli.test.ts` › "TUDO_AUTH_MODE=access or bogus exits 2, value never printed" (add `access` to the misconfig table, drop the `TUDO_ACCESS_DISABLED` combo row) | AC1b, A1 |
| `server/index.cli.test.ts` › "TUDO_OWNER_SUB missing, malformed or nil → exit 2, value never printed" (mode unset plus issuer; merges the old "both modes" test with the identity one) | AC1b |
| `server/index.cli.test.ts` › "production, TUDO_AUTH_MODE unset, issuer + owner: starts, logs `auth: identity`, `/healthz` auth identity, `/api/items` 401" (new) and keep the explicit-`identity` variant at `:106` | AC1b, A1, rollback ordering |
| `server/index.cli.test.ts` › existing runtime cases (SIGTERM exit 0, unreachable DATABASE_URL, drive not/configured, ai not configured, malformed AI_KEK, partial Google) run with the issuer instead of `TUDO_ACCESS_DISABLED`. Delete "Access on" `/api` 401 (covered above), "valid AI_KEK with Access on" (covered by the identity AI_KEK case), "TUDO_ACCESS_DISABLED refused in production", and "ai disabled: request auth off". | AC1, R8 |
| `server/ai/config.test.ts` › "valid → configured", "unset/empty → not configured", "malformed throws, AI_KEK removed" (no `requestAuth`) | AC1c |
| `server/app.test.ts` › `/healthz` → `{status:"ok", auth:"identity"}` by default | AC1 |
| `src/data/mode.test.ts` › "a redirect on /healthz → local (no retry, one fetch)" (both `detectMode` and `detectRuntime` forms, replacing `:39` and `:109`) | AC3 |
| `src/data/mode.test.ts` › "`auth:"access"` from an old server → `auth: null`" (in the unknown-auth test) | AC3 |
| `src/data/repo.http.test.ts` › "a redirect → ApiError(0, unexpected), not the unauthorized copy" (plus no `onAuthLost` where the harness allows) | AC3 |
| `src/data/aiSettings.test.ts` › "maps a redirect to internal" | AC3 / A3 |
| `src/data/photoUrls.test.ts` › "redirect rejects, caches nothing, retries on the next acquire" (renamed `test.each` row) | AC3 / A3 |
| `src/lib/boot.test.ts` › `needsAuth` truth table without `"access"` | typecheck |
| `scripts/check-image.sh` (CI `image` job) › start checks plus the merged smoke (see *Approach* 5) | AC2 |

## Approach
1. **Server auth seam (architect R-1, R-2, R-3).**
   - Rewrite `server/auth.js` so that `loadAuthConfig(env)` does this:
     - `const mode = env.TUDO_AUTH_MODE ?? "identity"`; if `mode !== "identity"`, throw `AuthConfigError` with a fixed message.
     - Then `loadIdentityConfig(env)`, then the existing owner checks.
     - It returns `{ mode: "identity", identity: { ...identity, ownerSub } }`.
   - `createAuth` → `createIdentityAuth({ verifier: createIdentityVerifier(cfg.identity) })`. `ownerSubOf` → `cfg.identity.ownerSub`.
   - Delete `server/access.js` and `server/access.test.ts`.
   - `loadOwnerSub` does not need moving: `auth.js:32-35` already validates the owner for identity.
2. **Entry point and AI.** Edit `server/index.js` as in the file table. In `server/ai/config.js`, `initAi(env, { importKek })` does: unset → "ai not configured", valid → "ai configured", malformed → throws. AI_KEK is still always deleted from env.
3. **`server/app.js`.** The default `authMode` becomes `"identity"`. `createApp({ auth })` injection is unchanged, so every `*.db.test.ts` and `app.test.ts` stub stays as is.
4. **SPA (architect R-6).** Remove the four `opaqueredirect` branches and keep `redirect: "manual"` everywhere.
   - `AuthKind` becomes `"identity" | null`.
   - Comments: `boot.ts`, `main.tsx`, `usePhotoUrl.ts`.
   - `needsAuth` logic and `AuthRoot` are unchanged (A5).
   - R1: local mode is untouched. `pnpm dev` and HTML `/healthz` still give local mode. A redirect now also gives local mode (A9).
5. **`scripts/check-image.sh` (architect R-7).**
   - Define `ID=(-e MM_IDENTITY_ISSUER=https://api.mmlabs.online -e TUDO_OWNER_SUB=3f2b8c1e-5d4a-4c7b-9e6f-1a2b3c4d5e6f)`.
   - Start checks, each `expect_exit 2`:
     - `"server without identity config" "$IMAGE"`
     - `"server without TUDO_OWNER_SUB" -e MM_IDENTITY_ISSUER=…`
     - malformed and nil owner, with the issuer
     - `"${ID[@]}" -e TUDO_AUTH_MODE=bogus`
     - `"${ID[@]}" -e TUDO_AUTH_MODE=access` (new)
     - `-e TUDO_AUTH_MODE=identity` without the issuer (keep)
     - foreign issuer and http issuer (keep, with the owner from `ID`)
     - migrate / drive-smoke (keep)
     - partial Google and malformed AI_KEK with `"${ID[@]}"`
   - Drop the `TUDO_ACCESS_DISABLED` check and the duplicate identity-without-owner check.
   - **Smoke**: one container, `"${ID[@]}" -e TUDO_AUTH_MODE=identity` (the live compose shape). Assert:
     - `/healthz` 200 with `"auth":"identity"`
     - `/readyz` 503
     - deep path → index.html
     - missing asset → 404
     - version
     - `/api/items` without a bearer → 401 (message "without a bearer")
     - malformed bearer → 401
     - HEALTHCHECK healthy
   - Remove `IDNAME` and its trap entry.
   - **db smoke**: use `"${ID[@]}"` with the mode unset, so both the unset and the explicit form are exercised. Message "without a bearer".
6. **Tests, docs, config, mirror.** Update the remaining files from the table. Then run the AC1 grep and all checks.
7. **Rules.**
   - R1: local mode is unchanged.
   - R3: the only dev bypass is removed. No new variable. `MM_IDENTITY_ISSUER` / `TUDO_OWNER_SUB` are not secret.
   - R7: every file is listed above. Anything else goes to follow-ups.
   - R8: tests are updated with every logic change.
   - R10: no Figma Make files are touched.
   - Risk tier High: `Dockerfile` comment and deploy mirror. The Gate is plan-approval.

### Rollback ordering (must appear in the PR description and impl-log)
- **Pre-T-019.9 images (≤ v0.2.6 plus anything released before this ticket)** default to `access` when `TUDO_AUTH_MODE` is unset. If the live compose drops `TUDO_AUTH_MODE: identity`, a rollback to such an image exits 2 for lack of `CF_ACCESS_*`, and the site is down.
- **The T-019.9 image** starts with the live #71 compose as it is: `TUDO_AUTH_MODE: identity` plus the leftover `CF_ACCESS_*`, which are not read. It also starts if those lines are later removed (mode unset → identity). The release therefore does not depend on any deployment-repo PR.
- **The T-019.9 image** exits 2 on `TUDO_AUTH_MODE: access`. Setting `access` is no longer a rollback lever; rollback is "release an older image" (README *Rollback*). Because Access itself is gone (D39), the older image's access mode would answer 401 anyway.
- `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` can be deleted from the live compose **at any time, before or after this release**. Identity mode ignores them in both old and new images.
- **Keep** `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER` in the live compose for as long as a rollback to a pre-T-019.9 image may be needed. Dropping `TUDO_AUTH_MODE` is optional and later.

### Runbook text for M-22 (for `/run` to put into `work/ming-todo.md`, replacing the current M-22 body)
> **M-22 — Finish the Access removal** (after the release that contains T-019.9; M-21 done):
> 1. Merge the T-019.9 release PR on `mmlabs-online/deployment` as usual. No compose change is needed for it: the new image accepts the current compose.
> 2. `curl -s https://tudocuatui.mmlabs.online/healthz` → `{"status":"ok","auth":"identity"}`.
> 3. `curl -i https://tudocuatui.mmlabs.online/api/items` → `401`.
> 4. In a private window, the site shows TuDo's sign-in (not a Cloudflare Access page). Sign in on the phone: items and photos load.
> 5. Cloudflare Zero Trust → Access → Applications: no application for `tudocuatui.mmlabs.online` (already removed per D39; confirm only).
> 6. Tick. The leftover `CF_ACCESS_*` lines in the deployment compose are M-26 and do not block this tick.
>
> Rollback: release an older image by the usual rollback path. Keep `TUDO_AUTH_MODE: identity` in the compose while a rollback to an image ≤ v0.2.6 may be needed. Those images default to Access mode when the variable is unset and would exit 2.

### New ops item (for `/run` to add to `work/ming-todo.md`)
> - [ ] **M-26 — Deployment repo: drop the Access variables** (`mmlabs-online/deployment`, `apps/tudocuatui/compose.yml`; any time, before or after the T-019.9 release):
>   - Remove `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` from the `tudocuatui` service.
>   - Update the header comments: no Access JWT; egress to `api.mmlabs.online` for JWKS; no `TUDO_ACCESS_DISABLED`.
>   - **Keep** `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER: https://api.mmlabs.online`, because pre-T-019.9 images need them on a rollback.
>   - Merging redeploys the same image. Check `/healthz` → `auth: identity` afterwards.
>   - This repo's `deploy/deployment-repo/apps/tudocuatui/compose.yml` mirror already shows the target shape after T-019.9.

## Specialist input used
software-architect (`consult-software-architect.md`):
- **Adopted F1–F6.** The file inventory comes from F1–F6, cross-checked with a fresh grep.
- **Adopted R-1** (auth.js stays the single seam), with one deviation: nothing needs moving, because owner validation already exists in `auth.js`.
- **Adopted R-2** as A1/A2: optional `TUDO_AUTH_MODE`, `identity` only, leftovers ignored. The optional "ignored: CF_ACCESS_*" log line is **rejected**, because it would put the name back into code (AC1).
- **Adopted R-3.** No default issuer.
- **Adopted R-4.** No replacement bypass; READMEs updated.
- **Adopted R-5**, preferred variant: `requestAuth` is removed.
- **Adopted R-6** for all four branches (A3). The optional `needsAuth` / `AuthRoot` simplification goes to follow-ups (A5).
- **Adopted R-7.** The explicit mode is on the main smoke and unset mode on the db smoke.
- **Adopted R-8**, except `app.test.ts:168` and `identity.test.ts:267` (A7).
- **Adopted R-9** (A8) and **R-10** (M-22 text plus M-26).
- **Risks.** 1 → rollback-ordering section and M-26. 2 → accepted (A9) with a test and a follow-up. 3 → documented in READMEs. 4 → every file enumerated. 5 → no open ticket edits these files (T-018.2 and T-021 are MERGED).
- **Open questions 1–6.** Answered by A1, A2, A3, A5, A6 and A8 below. None is blocking; Ming can overturn any of them at plan approval.

## Assumptions
- **A1 — `TUDO_AUTH_MODE` stays optional.**
  - Unset or exactly `identity` → identity mode.
  - Anything else exits 2 with a fixed message that never echoes the value: `access`, `""`, other case, padded.
  - Not removed and not required: the live #71 compose sets `identity`, and a later compose without it must still start.
- **A2 — Leftover `CF_ACCESS_*` and `TUDO_ACCESS_DISABLED` are ignored.**
  - The server simply no longer reads them, and no log line names them.
  - `TUDO_ACCESS_DISABLED=1` in production no longer exits 2. That is harmless: there is no bypass path left to enable.
  - Proof is the AC1 grep, not a test that would have to spell the names.
- **A3 — Scope of the `opaqueredirect` cleanup.**
  - The cleanup includes `aiSettings.ts` and `photoUrls.ts` with their tests. They are the same Access artifact, outside the AC's literal list but inside its intent.
  - After removal, a redirect is a generic error (status 0), never 401, so it never signs the user out.
- **A4 — AI config.** The `requestAuth` branch of `server/ai/config.js` is removed, with its tests. It was reachable only through `TUDO_ACCESS_DISABLED`.
- **A5 — No changes to `src/features/auth/**` (High tier).**
  - The following go to follow-ups: `needsAuth = mode === "api"`, removing `AuthRoot`'s `identity` prop, and the stale "Access mode" comment at `AuthRoot.tsx:12`.
  - Not needed for this ticket's ACs or for typecheck.
- **A6 — AC1 scope.** "Anywhere outside `work/`" means tracked files only. The git-ignored `coverage/`, `dist/` and `node_modules/` are excluded. `docs/` has no hits today.
- **A7 — Header-name strings kept as negative tests.**
  - The `Cf-Access-Jwt-Assertion` header in `server/app.test.ts:168` (proves header values are not logged) and the `cf-access-jwt-assertion` header in `server/identity.test.ts:267` (proves a stale Access header never authenticates) stay.
  - Neither matches the AC1 patterns.
- **A8 — The deploy mirror is updated to the live #71 auth shape.**
  - The changes: drop `CF_ACCESS_*`; add `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER: https://api.mmlabs.online`.
  - `x-owner-sub` stays `""`: the mirror is a template, and the live value is set in the deployment repo.
  - The implementer does not fetch or edit the deployment repo. That is M-26.
- **A9 — Accepted risk.**
  - With the branch gone, a redirect on `/healthz` (for example, Access re-added by mistake) makes the SPA run in local mode with demo data on the production host. It used to go to api mode.
  - Accepted because Access is gone (D39). A test pins the behaviour. A host-based guard is a follow-up.
- **A10 — Local server runs.**
  - Running `node server/index.js` locally now needs `MM_IDENTITY_ISSUER` (`https://api.mmlabs.online` or `http://localhost:<port>`) and `TUDO_OWNER_SUB`.
  - `/api` then needs a real bearer, and sign-in from localhost is not possible (origin registered for production only, M-19).
  - `pnpm dev` (local mode) remains the way to work on UI. Documented in both READMEs.
- **A11 — Umbrella AC-table conflict (flagged).**
  - The umbrella's AC table assigns "`check-image.sh` grep of `dist/` for `localStorage.setItem(` with token-like keys" to T-019.9.
  - The T-019.9 split entry, the Files row and the ticket ACs do not. T-019.7's `boundary.test.ts` already covers token storage.
  - Following the ticket (R7), the `dist/` grep is a follow-up, not part of this diff.
- **A12 — Hotspots.** No open ticket (`IN_PROGRESS` / `REVIEW` / `DONE`) edits these files. `src/main.tsx` gets a comment-only change. If T-019.9 runs after another merge to `main`, rebase before review.
- **A13 — Size.** About 330 deleted lines (`access.js`, `access.test.ts`, test cases) and about 250 changed lines. This is one implement/review cycle.

### Follow-ups (not in this diff)
- `needsAuth = mode === "api"` and removing `AuthRoot`'s `identity` prop and its "Access mode" comment (A5; High tier `src/features/auth`).
- Host guard: on `tudocuatui.mmlabs.online`, never fall back to local mode (A9).
- `check-image.sh` `dist/` grep for token-like `localStorage.setItem(` keys (A11).
- Later, optional: drop `TUDO_AUTH_MODE` from the deployment compose once rollback to pre-T-019.9 images is no longer needed.
- `vitest.config.ts`: consider a coverage threshold for `server/auth.js` (the entry for the deleted `access.js` is only removed here).

## Blocking questions
None. Every open choice has a default above (A1–A13). The ticket Gate is `plan-approval`, so Ming approves or overturns them before IMPLEMENT.

## Split proposal
None. Size S–M, one implement/review cycle (A13).
