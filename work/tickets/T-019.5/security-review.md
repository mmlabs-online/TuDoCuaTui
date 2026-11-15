# Security review — T-019.5

## Attempt 1 — 2026-11-14 (security-ai-generated-code-auditor, read-only)

**Verdict: no 🔴.** The verifier matches consumers.md checklist 1–6, 8, 10; item 7 replaced on purpose by the A11 prefix check; item 9 is PyJWT-specific; item 11 covered by `maxTokenAge` 900. Read the diff files, tests, jose 6.2.17 `remote.js` and `jwt_claims_set.js`; nothing run.

### Findings
- 🟢 **Algorithm confusion:** `server/identity.js:108` pins `algorithms: ["ES256"]`; jose rejects other algs before the key getter (HS256/RS256 → `alg`, 0 JWKS fetches, `identity.test.ts:102-115`); `alg: none` has an empty third segment → `TOKEN_RE` (`:13`) rejects as `malformed` before jose. Keys only from `createRemoteJWKSet(<issuer>/.well-known/jwks.json)` (`:82`); no `EmbeddedJWK`; header `jwk`/`jku` ignored (test `:236`).
- 🟢 **`iss`/`aud`:** exact `iss` (`jwt_claims_set.js:70`), variants tested (`identity.test.ts:127`); `aud` must be a string (`identity.js:116`), stricter than the checklist.
- 🟡 **`typ` compared case-insensitively, `application/` stripped** (`jwt_claims_set.js:38-41,63`): `AT+JWT` and `application/at+jwt` accepted vs checklist 6 `typ == "at+jwt"`. Same media type per RFC 9068 and still Identity-signed; negligible. Optional: require `protectedHeader.typ === "at+jwt"`.
- 🟢 **Required claims/time:** `requiredClaims` (`:112`) + `maxTokenAge: 900` (forces `iat`, rejects `iat` > 30 s in the future) + `clockTolerance: 30`; `jti` non-empty string (`:117`); `nbf` checked when present; tests `:154-176`.
- 🟢 **`email_verified` `=== true`** (`:119`); false/`"true"`/missing tested.
- 🟢 **`sub`:** `toUserId(sub) === sub` (`:121-122`) rejects uppercase/padded/nil instead of normalising; returned `userId` canonical, so `withUser` cannot 500 on a bad `sub`.
- 🟡 **Role check accepts any `tudocuatui:<x>`** (`:123-130`), per A11; checklist 7 says map roles through the app's role catalog. A future non-granting role (e.g. `tudocuatui:suspended`) would grant access; today only `tudocuatui:member` is issued. Allow-list known roles, or document that any `tudocuatui:` role grants full access and a ban removes every role.
- 🟢 **Token source and size:** only `req.headers.authorization` (`:100`); query/cookie/`cf-access-jwt-assertion` ignored (test `:263`); 7 + 4096 cap before regex and jose (`:103`); linear regex.
- 🟢 **JWKS fetch:** URL from validated issuer; UA `tudocuatui-server`; 5 s timeout, 60 s cooldown, 300 s cache (`:82-88`); jose `redirect: "manual"`, non-200 = error (`remote.js:14,19`); every lookup error except no/multiple match → `jwks_unavailable` → 401 (`:89-96`); lazy, deduped.
- 🟡 **Test gap:** the 301 case (`identity.test.ts:338`) mock never follows redirects; add `expect(init?.redirect).toBe("manual")` in the counting fetch (`:295`).
- 🟢 Accepted: cooldown counts from the last successful fetch; during an outage at most one fetch in flight (dedupe).
- 🟢 **Logs/responses:** `codeOf` (`:50-70`) maps only `err.code` and allow-listed `err.claim`; never `err.message`/payload; `app.js:86-87` logs `{event:"auth_denied", code}`, fixed 401 `unauthorized`; success logs no `sub`/email; `index.js:37` prints fixed config-error messages; test `identity.test.ts:273`. (Access mode still logs jose's raw `err.code`, `access.js:71` — library constants, harmless.)
- 🟢 **Config/production pin:** `auth.js:24-26` exactly `access`/`identity`, unset = `access`; identity + `TUDO_ACCESS_DISABLED=1` rejected (`:27-31`); `loadIdentityConfig` (`identity.js:23-45`) raw == `protocol//host`, no userinfo/port/path/query/fragment (uppercase, IDN, padded fail); production must equal `https://api.mmlabs.online`; `http://localhost:<port>` only outside production; `check-image.sh:57,107-110,161-169`; pin depends on baked `NODE_ENV=production` (asserted).
- 🟢 **`requestAuth`:** `auth.js:47-49` true for access-verified and identity, false for dev-off; `ai/config.js:22` comment updated; T-019.3 merged (A17).
- 🟢 **Auth before DB, no nesting:** `app.js:84` before `handleApi`/body/pool; `identity.js`/`auth.js` import nothing from the DB layer.

### Risks for M-21 and T-019.7
1. 🟡 The "Abuse limits before Access removal" ticket must exist and gate T-019.9/M-22 and T-019.10 (F8/F9, tag slots, photo slowloris). Not exploitable while Access is in front.
2. 🟡 **Shared Google Drive:** `server/photos.js:197` writes every user's photos through the one configured Drive client → once others can join (T-019.10) their photos land in Ming's Drive. Needs an explicit decision before M-22/T-019.10.
3. 🟢 At M-21, `cf-access-jwt-assertion` ignored in identity mode; identity only from the bearer; owner-`sub` mismatch already in the M-21 check.
4. 🟢 T-019.6/T-019.7: token only in `Authorization`; no `?access_token=` or cookie fallback for `<img>` (use blob URLs); the verifier rejects such fallbacks.

### Recommendations
- Optional strict `typ === "at+jwt"` post-check.
- Allow-list granting roles or document "any `tudocuatui:` role grants access".
- Assert `redirect: "manual"` in the JWKS test.
- Create/track the abuse-limits gate and the shared-Drive question.

### Open questions
- Will Identity ever issue `tudocuatui:` roles that should not grant access?
- Where is the multi-user Drive question decided?
