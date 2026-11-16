# Consult — software-architect — T-019.9 (2026-11-16)

Read-only, nothing modified.

## Findings

**F1. The server Access path sits behind one seam, `server/auth.js`.**
- `server/access.js:1-96` holds `loadAccessConfig`, `createAccessVerifier`, `createAccessAuth`, `createFixedAuth` and the shared `loadOwnerSub`.
- `server/auth.js` imports it (`:3-8`). Access-only code in `auth.js`:
  - `:25` defaults to `access`
  - `:26` the access branch
  - `:28-31` the `TUDO_ACCESS_DISABLED` guard
  - `:41-42` `ownerSubOf` access arm
  - `:46-53` `createAuth` access and fixed arms
  - `:57-58` `requestAuth`
  - `:62` `authLabel`
- `server/auth.js:130-132` already duplicates the owner-sub validation for identity mode. Once `access.js` is gone, no shared helper is lost.
- `server/index.js` touches Access in four places: `:7` imports `AccessConfigError`, `:42` catches it, `:48-52` logs `"auth: access (dev, off)"`, and `:69` passes `requestAuth(authConfig)` to `initAi`.
- `server/app.js:36` defaults `authMode = "access"`. `:87` echoes it in `/healthz`.

**F2. Identity mode already refuses to start without its config.**
- `server/identity.js:23-45`: `MM_IDENTITY_ISSUER` is required. It must be https, or `http://localhost:<port>` outside production. In production it must be exactly `https://api.mmlabs.online`.
- `auth.js:130-132`: `TUDO_OWNER_SUB` is required and must be a valid UUID.
- JWKS is fetched lazily (`identity.js:76-87`). The server therefore starts with `--network none`, which the identity smoke test in `check-image.sh:159-177` already relies on.

**F3. `TUDO_ACCESS_DISABLED` is the only way to run the server with no auth, and the tests depend on it heavily.**
- In `server/index.cli.test.ts` it appears at `:53, 71, 83, 140-146, 168, 185, 194, 206, 232, 247, 255`. Lines `:43-46, 50, 106, 156, 217` assume Access.
- `server/auth.test.ts` uses it throughout (`:3, 8-9, 20-23, 58, 75-91`).
- `server/ai/config.js:22-36`, the `"ai disabled: request auth off"` branch, can only be reached through it. That branch is tested at `index.cli.test.ts:230-245` and `ai/config.test.ts:39,67`.

**F4. SPA `opaqueredirect` branches: four, not the two the AC names.**
- `src/data/mode.ts:15-22`, comment plus branch. It currently maps a redirect to api mode.
- `src/data/repo.http.ts:47`
- `src/data/aiSettings.ts:57`
- `src/data/photoUrls.ts:73`
- Tests: `mode.test.ts:39-43, 109-114`, `repo.http.test.ts:316-326`, `aiSettings.test.ts:75`, `photoUrls.test.ts:142-143`.
- Related: `src/data/mode.ts:6,28` has `AuthKind` including `"access"`. `src/lib/boot.ts:22-26` and `boot.test.ts:71-74` have the access-mode token-page cases. `src/main.tsx:26` has an "access mode" comment.
- In `AuthRoot.tsx:26`, `identity=false` (no token store) is only needed for access mode.

**F5. Other references that the AC "nowhere outside `work/`" would catch.**
- `scripts/check-image.sh`:
  - `:23-25`, the `ACCESS` array
  - `:57`, the `CF_ACCESS_` env allow-list
  - `:102-107` and `:114-115`, start checks
  - `:125-150`, the main smoke asserts `"auth":"access"` at `:135`
  - `:189-199`, the db smoke uses `ACCESS`
- `server/README.md:8, 10-13, 19, 22, 71, 73`
- `README.md:3, 13, 25, 62-63, 68`. These also still say "no in-app login, D23", which is stale.
- `.env.example:1`
- `Dockerfile:3-4` (comments)
- `vitest.config.ts:60` has a coverage threshold for `server/access.js`.
- `deploy/deployment-repo/apps/tudocuatui/compose.yml:10-12, 49-50`. This local mirror is **stale**: it has no `TUDO_AUTH_MODE` or `MM_IDENTITY_ISSUER`, unlike live deployment#71.
- `.github/risk-tiers.yml:9` (comment)
- Strings used as injection payloads: `scripts/drive-connect.test.ts:360` and `scripts/deploy-envfile.test.ts:178, 225` use `"…\nTUDO_ACCESS_DISABLED=1"`.
- Negative test cases: `server/app.test.ts:168` sends a `Cf-Access-Jwt-Assertion` header. `server/identity.test.ts:267` uses `cf-access-jwt-assertion` as a header the verifier must ignore.
- `coverage/` and `dist/` also mention Access, but both are git-ignored build output.

**F6. `/healthz` `auth` is a contract with three consumers:** the SPA (`mode.ts:28`, then `boot.ts:25` and `main.tsx:31`), `check-image.sh:135,171`, and the ops check in M-21 ("`/healthz` shows `auth: identity`").

## Recommendations

**R-1. Keep `server/auth.js` as the single auth seam, identity only. (AC1; R7)**
- Delete `access.js` and `access.test.ts`.
- Move `loadOwnerSub` into `auth.js`. `AuthConfigError` replaces `AccessConfigError`.
- Keep the messages `"TUDO_OWNER_SUB must be set"` and `"TUDO_OWNER_SUB must be a valid UUID"`, because tests and the image checks grep for them.
- Drop `requestAuth` and `ownerSubOf`'s access arm. `AuthConfig` becomes `{ mode: "identity", identity: {...ownerSub} }`.
- Keep `createApp({ auth })` injection so `app.test.ts` and the `*.db.test.ts` stubs stay unchanged.
- In `index.js`, drop `:7` and `:42`, and log `auth: identity`.

**R-2. Accept `TUDO_AUTH_MODE` as unset or `identity`; any other value, `access` included, exits 2. (ordering; AC1)**
- Do not remove the variable outright, and do not make it required.
- Unset defaults to identity, so a later compose without it still works.
- An explicit `identity` keeps today's live compose valid.
- `access` and `bogus` fail closed with a fixed message that does not echo the value, keeping `auth.js:27`'s style.
- Do **not** refuse to start when `CF_ACCESS_*` or `TUDO_ACCESS_DISABLED` are present: ignore them, optionally with one fixed log line such as `ignored: CF_ACCESS_* (Access removed)`. Refusing would make this release depend on a deployment-repo PR merging first.
  - Exception for the planner/security to decide: `TUDO_ACCESS_DISABLED=1` could still exit 2 as a guard against a stale dev-bypass config. It is harmless either way once the code path is gone. I lean to ignoring it, since the AC wants the name gone from the code.

**R-3. Startup refusal stays exactly as identity mode does it today. (AC1)**
- Production requires `MM_IDENTITY_ISSUER = https://api.mmlabs.online` and a valid `TUDO_OWNER_SUB`.
- Do not default the issuer, even in production: an explicit value is fail-closed, and check-image asserts "no issuer → exit 2".
- `app.js:36`: change the default to `"identity"`, or make `authMode` required. Keep `/healthz` returning `auth: "identity"` (F6).

**R-4. No replacement dev bypass. (R1, R3)**
- R1 local mode is SPA-only (`detectRuntime` with `dev`, or an HTML `/healthz`, gives local mode with localStorage and demo data), so this ticket does not touch it.
- Running the server locally now needs `MM_IDENTITY_ISSUER`. A real end-to-end login from localhost is not possible, because `IDENTITY_BASE` is hardcoded at `src/features/auth/config.ts:2` and the origin is production-only (M-19). Document that honestly in the READMEs instead of the `TUDO_ACCESS_DISABLED=1` recipes at `server/README.md:73` and `README.md:13`.
- In `index.cli.test.ts`, swap every `TUDO_ACCESS_DISABLED: "1"` for `{ MM_IDENTITY_ISSUER: "https://api.mmlabs.online" }`, with or without `TUDO_AUTH_MODE: "identity"`. JWKS is lazy, so no network is used.
- Delete the access-only cases: `:43-46`, the access half of `:50-66`, `:140-143`, the second half of `:146-163`, and `:230-245`.
- Add cases: unset mode with issuer starts as identity; `TUDO_AUTH_MODE=access` → exit 2 with the value not printed; leftover `CF_ACCESS_*` → starts.

**R-5. AI gate (`server/ai/config.js:22-36`).**
- With `requestAuth` gone, the "request auth off" branch is dead. Preferred: remove the `requestAuth` dependency and its tests (`ai/config.test.ts:39,67`).
- That adds `server/ai/config.js` and its test to the file list, which the planner must state (R7).
- Fallback with a minimal diff: pass `requestAuth: true` and leave a follow-up.

**R-6. SPA. (AC3)**
- **`mode.ts`**:
  - Remove `:15-16` and `:22`.
  - Narrow `AuthKind` to `"identity" | null` (`:6`, `:28`).
  - Keep `redirect: "manual"`.
  - An `opaqueredirect` then falls into `!res.ok` → `"no"` → local mode. Make that explicit in a renamed test, e.g. "a redirect → local", replacing `mode.test.ts:39-43, 109-114`.
  - Update `:97-99`, the `"auth":"access"` case: `access` becomes an unknown value → `auth: null`.
- **`repo.http.ts:47`**:
  - Remove the branch.
  - Keep `redirect: "manual"` so the bearer never follows a redirect.
  - A redirect then fails `res.json()` and becomes `ApiError(0, "unexpected")`. That is right: it is not an auth failure and must not sign the user out.
  - Update `repo.http.test.ts:316-326`: split the 401 assertion from a new "redirect → unexpected" assertion.
- **`aiSettings.ts:57` and `photoUrls.ts:73`**: same treatment. They are outside the AC and the umbrella file list, but they are the same Access artifact. Include them with their tests, or list them as an explicit follow-up. Do not leave them half-done silently.
- **`boot.ts:22-26`, `boot.test.ts:71-74`, `main.tsx:26`**:
  - At minimum, drop the `"access"` cases and comments.
  - Optional, and better: `needsAuth = mode === "api"`, and drop the `identity` prop from `AuthRoot`. This removes the "api mode without the gate" state.
  - This widens the diff into `src/features/auth/**` (High tier). I would make it a follow-up unless the planner wants it here.

**R-7. `scripts/check-image.sh`. (AC2)**
- Replace `ACCESS` with `ID=(-e MM_IDENTITY_ISSUER=https://api.mmlabs.online -e TUDO_OWNER_SUB=<dummy>)`. Add `-e TUDO_AUTH_MODE=identity` to one variant only, so both unset and explicit are covered.
- Merge the main smoke and the identity smoke into one container. Assert `"auth":"identity"`, `/api/items` without a bearer → 401, and a malformed bearer → 401.
- Start checks:
  - `:102`: no config → exit 2, because the issuer is missing.
  - `:103`: drop.
  - `:104-106`: rewrite with `ID` minus or with a bad owner.
  - Add `TUDO_AUTH_MODE=access` → exit 2.
  - Optionally assert that leftover `CF_ACCESS_*` still starts the server.
- `:114-115, 189-190`: use `ID`. `:199` message: change "Access header" to "bearer".
- `:57`: remove `CF_ACCESS_` from the prefix list.

**R-8. Docs and config.**
- Rewrite `server/README.md` (env table and routes) and `README.md` (`:3, 13, 25, 62-68`: in-app sign-in replaces "no login, Access in front").
- Update `.env.example:1`, `Dockerfile:3-4`, `vitest.config.ts:60` (remove the entry; leaving a threshold for a deleted file is at best noise), and `.github/risk-tiers.yml:9` (comment).
- In `scripts/drive-connect.test.ts:360` and `deploy-envfile.test.ts:178, 225`, change the injection payload to another app variable, e.g. `\nNODE_ENV=development`. The test intent is unchanged.
- In `app.test.ts:168`, use an `Authorization: Bearer tok-abc` header so it still proves tokens are not logged. In `identity.test.ts:267`, use any non-Authorization header name.

**R-9. Deployment mirror.**
- Update `deploy/deployment-repo/apps/tudocuatui/compose.yml`:
  - Drop `:49-50`.
  - Rewrite the comments at `:10-12`: egress is now needed for `api.mmlabs.online` JWKS, not `cloudflareaccess.com`.
  - Add `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER: https://api.mmlabs.online` so it matches live deployment#71.
- This is a mirror only. The real change is a separate ops item (see Risks, item 1).

**R-10. Runbook (AC4).**
- M-22 now reduces to: after the T-019.9 release, `/healthz` shows `{"auth":"identity"}`; `curl -i https://tudocuatui.mmlabs.online/api/items` gives 401; an incognito window shows TuDo's sign-in; confirm no Access app exists in the Zero Trust dashboard; tick.
- Add a new Ming/ops item for the deployment repo (Risks, item 1).

## Risks
1. **Rollback ordering, which matters most.**
   - Pre-T-019.9 images default to `access` when `TUDO_AUTH_MODE` is unset (`auth.js:25`).
   - If the deployment compose drops `TUDO_AUTH_MODE: identity` and production later rolls back to v0.2.6 or earlier, the old image exits 2 for lack of `CF_ACCESS_*`, and the site is down.
   - Ops item: in `mmlabs-online/deployment` `apps/tudocuatui/compose.yml`, `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` can be removed at any time, before or after this release, because both old and new images ignore them in identity mode. **Keep** `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER` until rollback to pre-T-019.9 images is no longer needed. Removing `TUDO_AUTH_MODE` is a later, optional follow-up.
   - Per R-2, the new image never fails on either compose state, so the release does not depend on the ops PR merging first.
2. **Silent local-mode fallback on the production host.** After R-6, any redirect on `/healthz` (a future Cloudflare rule, or Access re-added) makes the SPA run in local mode with demo data on `tudocuatui.mmlabs.online`. Today that path leads to api mode instead. The risk is low with Access gone, but the planner should accept it consciously and test it. A host-based guard is a possible follow-up.
3. **No local end-to-end API run with login.** Developers lose `TUDO_ACCESS_DISABLED`. That is intended (R3: no bypass flag), but debugging the server locally gets harder. It is mitigated by the `createApp` auth injection in tests.
4. **Diff spread vs R7.** R-5 and R-6 touch files outside the umbrella list (`server/ai/config.js`, `aiSettings.ts`, `photoUrls.ts`, `boot.ts`, `main.tsx`, possibly `AuthRoot.tsx`). The planner must enumerate them or push them to follow-ups.
5. **Merge hotspots.** Per A17, T-018.2 and T-021 may edit `check-image.sh`, `server/index.js` and `server/ai/*`. Rebase on the latest `main`.

## Open questions
1. **`TUDO_AUTH_MODE`.** Is "optional, `identity` only, `access` → exit 2" (R-2) acceptable to Ming? The alternative, dropping the variable and ignoring any value, is more lenient but lets a stale `access` setting pass silently.
2. **Leftover variables.** Ignore `TUDO_ACCESS_DISABLED=1` silently, or keep refusing it in production as a guard? The second keeps the name in the code, which conflicts with AC1's literal wording.
3. **Scope of the opaqueredirect cleanup.** Should `aiSettings.ts:57` and `photoUrls.ts:73` be included here, which I recommend, given that the AC names only `mode.ts` and `repo.http.ts`?
4. **`needsAuth` simplification and removing `AuthRoot`'s `identity` prop.** Do them in this ticket (`src/features/auth/**`, High tier) or as a follow-up?
5. **AC1 wording.** Does "nowhere outside `work/`" cover the git-ignored `coverage/` and `dist/`, which I assume not, and historical decision text in `docs/`? No hits found in `docs/`.
6. **Mirror update.** Ming should confirm that updating the local `deploy/deployment-repo/.../compose.yml` mirror to the live (#71) shape is wanted, rather than leaving it as a historical draft.
