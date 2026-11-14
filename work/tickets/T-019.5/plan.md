Status: READY

# Plan — T-019.5: Identity JWT verifier and TUDO_AUTH_MODE switch

## Feature summary
T- ticket (not in `docs/feature-list.md`); slice of the approved umbrella T-019. Sources quoted:

- Ticket goal: "The Node server can verify mmlabs Identity access tokens, selected by `TUDO_AUTH_MODE` (`access` stays
  the production default until M-21)."
- D31: "TuDo signs in with mmlabs Identity (`api.mmlabs.online`, org-admin-api; app `tudocuatui`, join policy `open`).
  Multi-user: data is owned by the mmlabs `sub`. Cloudflare Access stays until Identity sign-in and owner scoping are
  verified in production (M-21), then is removed (M-22). Local mode unchanged (R1)."
- D33: "AI rate limits per user." (already merged in T-019.3; relevant to `requestAuth`.)
- Umbrella plan T-019, *Split proposal* → T-019.5: "ACs: ticket AC2 with the full case list (A11, A12); `TUDO_AUTH_MODE`
  validated, exit 2 on bad/missing config in production; `/healthz` → `{status:"ok", auth}`; logs carry only `code`."
- Umbrella **A4**: "`TUDO_AUTH_MODE=access` maps every Access request to `TUDO_OWNER_SUB`; `identity` uses the verifier;
  production requires exactly one valid config."
- Umbrella **A11**: "the verifier requires at least one `tudocuatui:`-prefixed entry in `roles` (Ming's ban lever)."
- Umbrella **A12**: "jose (already a dependency), `algorithms:["ES256"]`, issuer from `MM_IDENTITY_ISSUER` validated as
  `https://<host>` (production must equal `https://api.mmlabs.online`), audience constant `tudocuatui`,
  `clockTolerance: 30`, JWKS `cacheMaxAge 300 s`, `cooldownDuration 60 s`, `timeoutDuration 5 s`,
  `User-Agent: tudocuatui-server`; only `Authorization: Bearer`; fail closed; `/readyz` stays DB-only."
- Umbrella **A15**: "15-minute revocation lag (ADR-0005 TTL) accepted and documented."
- `org-admin-api/docs/consumers.md` *Verifying (backend) checklist* items 1–11 (ES256 pinned; keys only from
  `https://api.mmlabs.online/.well-known/jwks.json`, never `jku`/`x5u`/`jwk`; select by `kid`, cache ≤ 1 h, unknown
  `kid` refetch at most once a minute; exact `iss`, `aud`; require `exp`, `iat`, `sub`, `jti`, leeway ≤ 60 s;
  `typ == "at+jwt"`, `email_verified is True`; never log tokens; set a `User-Agent`; 15-minute revocation lag).
- Ticket notes (2026-11-14): map `sub` through `toUserId` and reject a non-canonical `sub` in the auth layer; auth
  middleware must not open a `withUser`; `scoping.test.ts` must cover new server files; change `initAi`'s
  `requestAuth` to "auth mode is access or identity".

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Verifier follows `consumers.md` (A11, A12): ES256 only, exact `iss`, `aud=tudocuatui`, `typ=at+jwt`, required claims, `email_verified === true`, UUID `sub`, a `tudocuatui:` role; unit tests for every failure case incl. unknown `kid` refetch cooldown. | `pnpm test server/identity.test.ts` — every row listed under *Tests to write* for that file passes; read `server/identity.js` for the exact `jwtVerify` options (see Approach step 2). |
| 2 | `TUDO_AUTH_MODE` validated; bad or missing config in production → exit 2. | `server/auth.test.ts` config matrix; `server/index.cli.test.ts` new cases (`bogus` → 2, identity without issuer → 2, production wrong/`http` issuer → 2, identity + `TUDO_ACCESS_DISABLED=1` → 2, values never printed); existing "production without `CF_ACCESS_*` exits 2" still green (unset mode = access); `scripts/check-image.sh` new `expect_exit 2` lines (run in CI image job). |
| 3 | `/healthz` → `{status:"ok", auth}`; logs carry only the error `code`, never the token or claims. | `server/app.test.ts`: `/healthz` body `{status:"ok",auth:"access"}` by default and `"identity"` with `authMode:"identity"`; denied requests log exactly `{event:"auth_denied", code}`; serialized logs contain no token, `sub`, `email` or `jti` (identity.test + app.test log-hygiene cases); check-image smoke greps `"auth":"access"` and `"auth":"identity"`. |
| 4 | All checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` green; CI image check green. |

Additional reviewer checks derived from the ticket notes (not new scope):
- `requestAuth` is true for access-verified and identity, false for access dev-off — `server/auth.test.ts` › requestAuth
  and `index.cli.test.ts` › identity + `AI_KEK` → "ai configured"; existing dev-off case still "ai disabled".
- Identity auth runs no DB query and no `withUser` — `app.test.ts` › identity, no bearer → 401 with 0 pool calls; grep
  `server/identity.js` / `server/auth.js` for `withUser|pool` (none).
- `scoping.test.ts` scans every `server/**/*.js` except `server/test/`.

## Ming verification after merge
None new. Production stays `access` (no compose change). Identity behaviour in production is verified at the existing
umbrella step M-21 (umbrella numbering M-20), which already sets `TUDO_AUTH_MODE: identity` and
`MM_IDENTITY_ISSUER: https://api.mmlabs.online`.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/identity.js` (new) | `AUDIENCE`, `MAX_TOKEN_CHARS`, `ISSUER_PROD`, `loadIdentityConfig(env)`, `createIdentityVerifier(...)`, `createIdentityAuth(...)`; fixed error-code enum | AC1, A11, A12 |
| `server/auth.js` (new) | `AuthConfigError`, `loadAuthConfig(env)`, `createAuth(cfg)`, `requestAuth(cfg)`, `authLabel(cfg)`; `Auth` / `AuthResult` typedefs moved here | AC2, A4, ticket note (3) |
| `server/access.js` | Typedefs `Auth`/`AuthResult` replaced by imports from `./auth.js` (type-only); no behaviour change | typedef move (T-019.9 deletes this file) |
| `server/index.js` | Use `loadAuthConfig` / `createAuth` / `requestAuth`; catch `AuthConfigError` and `AccessConfigError` → exit 2; startup line `auth: access` / `auth: access (dev, off)` / `auth: identity`; pass `authMode` to `createApp` | AC2, AC3 |
| `server/app.js` | Dep `authMode` (`"access"` default); `/healthz` → `{status:"ok", auth: authMode}`; log event `access_denied` → `auth_denied` with `{code}` only; typedef import from `./auth.js` | AC3 |
| `server/ai/config.js` | Comment at line 22 updated: `requestAuth` = "auth mode is access (verified) or identity"; no logic change | ticket note (3) |
| `server/identity.test.ts` (new) | Verifier unit tests | AC1, AC3 |
| `server/auth.test.ts` (new) | Config matrix, `requestAuth`, `authLabel` | AC2 |
| `server/app.test.ts` | `/healthz` body updated; identity-mode cases with a local JWKS | AC1, AC3 |
| `server/index.cli.test.ts` | New exit-2 and identity start cases | AC2 |
| `server/scoping.test.ts` | File list becomes recursive (`readdirSync(serverDir, { recursive: true })`, `.js`, excluding `test/`) | T-019.2 note (3) |
| `scripts/check-image.sh` | Add `MM_IDENTITY_` to the env-prefix allow-list; new `expect_exit 2` lines; `/healthz` `"auth":"access"` on the existing smoke; one identity smoke container | AC2, AC3 boundary |
| `server/README.md` | Rows for `TUDO_AUTH_MODE`, `MM_IDENTITY_ISSUER`; `TUDO_OWNER_SUB`/`NODE_ENV`/`AI_KEK` rows and Routes line adjusted; short "Identity tokens" section (error codes, 15-min revocation lag A15, role check = ban lever A11, JWKS egress) | docs, A15 |
| `.env.example` | Comment line lists `TUDO_AUTH_MODE`, `MM_IDENTITY_ISSUER` (names only) | docs, R3 |

Not touched: `deploy/**/compose.yml` (M-21 adds the env), `package.json` (jose already a dependency), `src/**`,
`db/migrations/**`, `server/user.js`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/identity.test.ts` › happy path: ES256, `kid`, `typ: at+jwt`, all claims, role `tudocuatui:member` → `{ok:true, userId}` equal to canonical `sub` | AC1 |
| › `alg` HS256, `none` (UnsecuredJWT), RS256 → `alg`; counting JWKS getter called 0 times | AC1, checklist 1 |
| › `aud` wrong (`ricotdin`) → `claim_aud`; `aud` array `["tudocuatui","x"]` → `claim_aud` (strict string) | AC1, checklist 4 |
| › `iss` variants: `https://api.mmlabs.online.evil.com`, `https://evil.com/https://api.mmlabs.online`, trailing `/`, `http://` → `claim_iss` | AC1, checklist 4 |
| › `typ` missing / `JWT` → `claim_typ` | AC1, checklist 6 |
| › `exp` = now−31 → `expired`; `exp` = now−29 → ok; `iat` = now+31 → `claim_iat`; `iat` = now−931 with future `exp` → `expired` (`maxTokenAge` 900) ; `nbf` = now+31 → `claim_nbf` | AC1, checklist 5 |
| › missing `exp` / `iat` / `sub` / `jti` → `claim_<name>`; `jti` a number → `claim_jti` | AC1, checklist 5 |
| › `email_verified` false / missing / `"true"` → `email_unverified` | AC1, checklist 6 |
| › `sub` uppercase UUID, `" "`-padded, nil UUID, non-UUID, number → `sub_invalid` (never trimmed/lowercased into a valid id) | AC1, T-019.2/.4 notes |
| › `roles` missing, `[]`, `["ricotdin:member"]`, `["tudocuatui:"]`, `"tudocuatui:member"` (string, not array), `[1]` → `no_role`; `["ricotdin:x","tudocuatui:member"]` → ok | AC1, A11 |
| › signed by another ES256 key with the same `kid` → `signature` | AC1 |
| › token with embedded `jwk` / `jku` header and unknown `kid` → `unknown_kid`; the embedded key is never used | checklist 2 |
| › no `Authorization` → `missing`; `Basic …` → `missing`; `Bearer` + non-JWT shape / extra spaces → `malformed`; lowercase `bearer` accepted | A12 |
| › header longer than 7 + 4096 chars → `too_large`, JWKS getter called 0 times | A12 |
| › token only in `?access_token=`, in a `Cookie`, or in `cf-access-jwt-assertion` → `missing` | A12 |
| › cooldown (real `createRemoteJWKSet` + counting `fetch` via `customFetch`, `vi.useFakeTimers({ toFake: ["Date"] })`): first valid token → 1 fetch; unknown `kid` at +1 s → no fetch, `unknown_kid`; at +61 s → exactly 1 more fetch; at +62 s → none; after a rotation (new key served) at +122 s the new `kid` is accepted; every fetch carries `User-Agent: tudocuatui-server` and goes to `<issuer>/.well-known/jwks.json` | AC1, checklist 3, 10 |
| › JWKS failures → `jwks_unavailable` (401, fail closed): fetch rejects (TypeError), status 500, status 301 (no redirect followed), body not JSON, body not a JWKS, fetch hangs past a small injected timeout | A12, fail closed |
| › log hygiene: verifier never calls `console.*`; result objects for every failure are exactly `{ok:false, code}` with `code` in the fixed enum (no `err.message`, no payload) | AC3, checklist 8 |
| › `loadIdentityConfig`: missing issuer → throws (names `MM_IDENTITY_ISSUER`, not the value); `https://api.mmlabs.online` ok; with userinfo / port / path / query / fragment / trailing `/` → throws; production + other host → throws; production + `http://localhost:8000` → throws; non-production `http://localhost:8000` ok, `http://127.0.0.1:8000` and `http://example.com` throw; non-production `https://staging.example` ok | AC2 |
| `server/auth.test.ts` › unset `TUDO_AUTH_MODE` → access (with `CF_ACCESS_*` + owner); `access` explicit same; `identity` + issuer → identity (no `TUDO_OWNER_SUB`, no `CF_ACCESS_*` needed, `CF_ACCESS_*` ignored); `""`, `Identity`, ` identity`, `bogus` → `AuthConfigError` naming the variable, not the value; identity + `TUDO_ACCESS_DISABLED=1` → error; access-mode errors unchanged (`AccessConfigError`) | AC2, A4 |
| › `requestAuth`: access on → true, access dev-off → false, identity → true; `authLabel`: `access`, `access` (dev-off), `identity` | ticket note (3), AC3 |
| `server/app.test.ts` › `/healthz` → `{status:"ok",auth:"access"}` by default; `{status:"ok",auth:"identity"}` with `authMode:"identity"`; `/readyz` unchanged | AC3 |
| › identity auth (local JWKS): `GET /api/items`, `GET /api/locations`, `PUT /api/items/:id`, `DELETE /api/items/:id`, `POST /api/items/:id/wear`, `PUT/DELETE /api/items/:id/photo`, `GET /api/photos/:id`, `GET/PUT /api/ai-settings`, `POST /api/ai/tag-photo` without bearer and with `Bearer x.y.z` → 401 `{"error":{"code":"unauthorized"}}`, 0 pool calls | AC1 (umbrella AC2) |
| › valid token reaches the API with canonical `userId` (fake pool sees `[sub]`) | AC1 |
| › denied request logs exactly `{event:"auth_denied", code}`; `JSON.stringify(logs)` contains neither the token, `sub`, `email` nor `jti` (also on success) | AC3 |
| `server/index.cli.test.ts` › `TUDO_AUTH_MODE=bogus` → exit 2, message names `TUDO_AUTH_MODE`, `bogus` not printed | AC2 |
| › identity without `MM_IDENTITY_ISSUER` → 2; production + `https://evil.example` → 2 (value not printed); production + `http://api.mmlabs.online` → 2; identity + `TUDO_ACCESS_DISABLED=1` → 2 | AC2 |
| › production identity with `https://api.mmlabs.online`, no `CF_ACCESS_*`, `TUDO_OWNER_SUB=""` → starts, prints `auth: identity`, `/healthz` `auth:"identity"`, `/api/items` 401 (no network needed: no bearer) | AC2, AC3 |
| › identity + valid `AI_KEK` → `ai configured`; existing dev-off + `AI_KEK` → `ai disabled: request auth off` unchanged | ticket note (3) |
| `server/scoping.test.ts` › recursive file list includes `auth.js`, `identity.js`, `ai/store.js` and excludes `test/**` (assert on the list) | T-019.2 note (3) |

## Approach
1. **`server/auth.js` (new).** `AuthConfigError`; `loadAuthConfig(env)`:
   - `TUDO_AUTH_MODE` unset → `"access"`. Anything other than exactly `access` / `identity` (no trim, no case-fold;
     empty string is invalid) → `AuthConfigError("TUDO_AUTH_MODE must be access or identity")`.
   - `access` → `{ mode: "access", access: loadAccessConfig(env) }` (unchanged behaviour, still exit 2 in production
     without `CF_ACCESS_*`, still requires `TUDO_OWNER_SUB`).
   - `identity` → `TUDO_ACCESS_DISABLED === "1"` → error; otherwise `{ mode: "identity", identity:
     loadIdentityConfig(env) }`. `CF_ACCESS_*` and `TUDO_OWNER_SUB` are not read (umbrella A2/A4: the owner is only
     for the migration backfill and access mode).
   - `createAuth(cfg)` builds the access auth (existing functions) or `createIdentityAuth`. `requestAuth(cfg)` =
     `cfg.mode === "identity" || cfg.access.mode === "on"`. `authLabel(cfg)` = `cfg.mode`.
   - Move the `Auth` / `AuthResult` typedefs here; `access.js` and `app.js` reference them via `import("./auth.js")`.
2. **`server/identity.js` (new).** Consult R1/R2, adopted as is:
   - `loadIdentityConfig(env)`: `MM_IDENTITY_ISSUER` required; parse with `new URL`; accept only if the raw string
     equals `` `${u.protocol}//${u.host}` `` and there is no userinfo, port, path, query or fragment, protocol
     `https:`. Outside production one extra shape is allowed: exactly `http://localhost:<port>` (consumers.md local
     API). In production the value must equal `https://api.mmlabs.online`. Returns `{ issuer, jwksUrl: issuer +
     "/.well-known/jwks.json" }`. Messages name the variable, never the value.
   - `createIdentityVerifier({ issuer, jwks?, fetch?, timeoutMs? })`: JWKS = injected or `createRemoteJWKSet(new
     URL(jwksUrl), { cacheMaxAge: 300_000, cooldownDuration: 60_000, timeoutDuration: timeoutMs ?? 5_000, headers:
     { "User-Agent": "tudocuatui-server" }, [customFetch]: fetch })`, created lazily on the first verify (no fetch at
     startup; image start checks run `--network none`). Wrap the key getter so any error thrown during lookup other
     than `ERR_JWKS_NO_MATCHING_KEY` / `ERR_JWKS_MULTIPLE_MATCHING_KEYS` is mapped to `jwks_unavailable`.
   - `verify(req)`: read only `req.headers.authorization`. Absent or not starting with `Bearer ` (case-insensitive) →
     `missing`; length > 7 + `MAX_TOKEN_CHARS` (4096) → `too_large` (before any regex/jose); not
     `/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i` → `malformed`.
     `jwtVerify(token, getKey, { algorithms: ["ES256"], issuer, audience: "tudocuatui", typ: "at+jwt",
     requiredClaims: ["exp","iat","sub","jti","iss","aud"], clockTolerance: 30, maxTokenAge: 900 })`.
     Post-checks in order: `typeof aud === "string"` else `claim_aud`; `typeof jti === "string" && jti !== ""` else
     `claim_jti`; `email_verified === true` else `email_unverified`; `typeof sub === "string" && toUserId(sub) ===
     sub` else `sub_invalid`; `Array.isArray(roles) && roles.some(r => typeof r === "string" &&
     r.startsWith("tudocuatui:") && r.length > 11)` else `no_role`. Success → `{ ok: true, userId: toUserId(sub) }`.
   - Error mapping from `err.code` (and `err.claim` for claim failures) to the fixed enum in consult R2: `malformed`,
     `alg`, `signature`, `expired`, `claim_<iss|aud|typ|iat|nbf|exp|sub|jti>`, `unknown_kid`, `jwks_unavailable`,
     `email_unverified`, `sub_invalid`, `no_role`, fallback `invalid`. Never read `err.message` or `err.payload`.
   - `createIdentityAuth({ verifier })` → `Auth`. No DB access, no `withUser`, no provisioning table (T-019.4 notes).
3. **`server/app.js`.** Add `authMode = "access"` dep; `/healthz` returns `{ status: "ok", auth: authMode }`; the
   `/api` branch logs `{ event: "auth_denied", code }` and answers the unchanged 401 `unauthorized`. Nothing else in
   the router changes; `/readyz` stays DB-only (A12).
4. **`server/index.js`.** `cfg = loadAuthConfig(process.env)` (catch `AuthConfigError` or `AccessConfigError` →
   `config error: <message>`, exit 2); `auth = createAuth(cfg)`; print `auth: access`, `auth: access (dev, off)` or
   `auth: identity` (replaces `access check OFF (dev)`); `initAi(..., { requestAuth: requestAuth(cfg) })`;
   `createApp({ ..., authMode: authLabel(cfg) })`. Update the `ai/config.js` comment.
5. **`server/scoping.test.ts`.** Recursive listing (same pattern as the `set_config` test at line 106), `.js` only,
   excluding `test/`.
6. **`scripts/check-image.sh`.** Add `MM_IDENTITY_` to the prefix list at line 56 (so a baked `MM_IDENTITY_ISSUER`
   fails the "exactly `NODE_ENV=production`" check). New `expect_exit 2` lines (with `${ACCESS[@]}` where relevant):
   `TUDO_AUTH_MODE=bogus`; identity without issuer; identity + `MM_IDENTITY_ISSUER=https://evil.example`; identity +
   `http://api.mmlabs.online`. Existing smoke: `/healthz` body contains `"auth":"access"`. One identity smoke
   container (`--network none`, `--cap-drop ALL`, `TUDO_AUTH_MODE=identity`, `MM_IDENTITY_ISSUER=https://api.mmlabs.online`,
   no `CF_ACCESS_*`): `/healthz` contains `"auth":"identity"`; `/api/items` → 401 without a header and with
   `Authorization: Bearer x.y.z` (rejected as `malformed` before any JWKS fetch). Extend the `trap` to remove it.
7. **Docs.** `server/README.md` and `.env.example` per the files table (names only, no values; R3).
8. Run checks; keep the diff to the files table (R7).

Rules: **R1** — the browser and local mode are untouched; `WardrobeRepo` unchanged. **R2** — no migration, no schema
change. **R3** — the only new variables are `TUDO_AUTH_MODE` and `MM_IDENTITY_ISSUER`, both server-side and not
secret; no `VITE_*`; neither name matches `KEY|SECRET|TOKEN|PASSWORD`. **R4/R5** — not affected. **R6** — no UI copy.
**R7** — F8/F9/slowloris kept out (see A-T5). **R8** — every new pure function has unit tests (above). **R9** — no UI
change. **R10** — `AGENTS.md`, `.figma/`, `vite.config.ts` not touched.

## Specialist input used
- software-architect F1–F11: adopted as facts (verified against `server/app.js`, `index.js`, `user.js`,
  `access.js`, `ai/config.js`, `scoping.test.ts`, `check-image.sh`, jose `remote.js`).
- R1 (flat `server/identity.js` + `server/auth.js`, typedef move, `requestAuth`): adopted; added `authLabel`.
- R2 (verifier rules, error enum, lazy JWKS, `customFetch`): adopted; `aud`/`jti` strict string checks adopted (Q5
  default yes); "missing vs malformed" split made explicit.
- R3 (config): adopted with the orchestrator-confirmed defaults — unset = `access`, no compose change (Q2);
  `http://localhost:<port>` only outside production (Q3).
- R4 (`/healthz` label, `auth_denied`): adopted. Q4 → `jwks_unavailable` answers 401 (fail closed, A12).
- R5 (recursive scoping guard), R6 (`check-image.sh`), R7 (tests), R9 (docs): adopted.
- R8 (F8/F9 + photo slowloris out of this diff, gated before Access removal): adopted; Q1 resolved as the deferral,
  with no option chosen now (A-T5).
- Risks 1–6: accepted as documented (A-T7); risk 3 (owner mismatch) is already part of the M-21 check.

## Assumptions
- **A-T1 — Unset `TUDO_AUTH_MODE` = `access`.** Production keeps running unchanged with no compose edit; M-21 (umbrella
  M-20) adds `TUDO_AUTH_MODE: identity` and `MM_IDENTITY_ISSUER`. Within umbrella A4 ("production requires exactly
  one valid config": access still fails closed without `CF_ACCESS_*`/owner).
- **A-T2 — Issuer shape.** Production: exactly `https://api.mmlabs.online` (A12). Outside production: any
  `https://<host>` (A12) or exactly `http://localhost:<port>` for the local Identity API (consumers.md *Local
  development*). This is a dev-only refinement of A12; it cannot apply when `NODE_ENV=production`.
- **A-T3 — Fail closed.** `jwks_unavailable` → 401 like every other failure (A12 "fail closed"); no 503, no fallback.
- **A-T4 — Stricter than the checklist, never looser:** `aud` must be a string (not an array), `jti` a non-empty
  string, `maxTokenAge` 900 s (rejects a future `iat` beyond 30 s and caps any token at the 15-min TTL of A15), `sub`
  must already be canonical (`toUserId(sub) === sub`). If Identity ever raises its TTL above 15 min, tokens older
  than 15 min are rejected (fail closed) — noted in `server/README.md`.
- **A-T5 — F8/F9 and photo-upload slowloris stay out of T-019.5.** The ticket notes (T-019.3 F8/F9, T-019.2 note 2)
  ask for owner budget / per-IP / shorter body deadline / sign-up gate. They become exploitable only once strangers
  can get a `tudocuatui:` token *and* reach the server; through M-21 Cloudflare Access is still in front, and nobody
  can join before T-019.10. **The orchestrator creates a separate ticket "Abuse limits before Access removal"**
  (AI global-ceiling exhaustion, tag-photo slot holding, photo PUT slowloris) that becomes a dependency of T-019.9
  (and thus M-22) and of T-019.10. The choice among its options is made in that ticket's plan, not here; this plan
  chooses none of them.
- **A-T6 — `TUDO_OWNER_SUB` is not read in identity mode** (umbrella A2/A4); compose keeps it for `migrate`.
- **A-T7 — Accepted risks (consult):** an Identity outage makes `/api` answer 401 after the 300 s cache goes stale
  (each request waits ≤ 5 s, deduped); unknown-`kid` cooldown counts from the last successful fetch; one `auth_denied`
  log line per 401 (json-file rotation bounds disk); `/healthz` exposes the auth mode label; an Identity host move
  needs a code release (pinned issuer).
- **A-T8 — Size.** Production code ≈ 250 changed lines; tests ≈ 450; script + docs ≈ 60. Larger than the ~400-line
  guide mainly because of the required failure-case tests; the umbrella sized this slice M and it is one coherent
  review unit, so no split.
- **A-T9 — Hotspots.** No ticket in `IN_PROGRESS`/`REVIEW`/`DONE` other than the T-019 umbrella (no own diff) edits
  these files. T-019.6 (`server/photos.js`) and T-019.9 (`server/index.js`, `server/app.js`, `check-image.sh`,
  `access.js`) come later and will rebase on this. `src/App.tsx` is not touched.
- **A-T10 — Numbering.** Ming items use the current numbering (M-21 = switch to identity, M-22 = remove Access; the
  umbrella's M-20/M-21).

**Beyond the umbrella plan:** no new Ming step, no new secret, no env var other than `TUDO_AUTH_MODE` and
`MM_IDENTITY_ISSUER`, no F8/F9 option chosen or left open for Ming now. The only refinements of A12 are A-T2 (dev-only
`http://localhost:<port>`) and A-T4 (stricter checks); A-T5 adds a gating ticket, created by the orchestrator, whose
options are decided in its own plan.

## Blocking questions
None.

## Split proposal
None (see A-T8). Follow-up ticket to be created by the orchestrator: "Abuse limits before Access removal" (A-T5),
gating T-019.9 / M-22 and T-019.10.
