# Security review — T-028.1

## Attempt 1 — security-ai-generated-code-auditor, 2026-11-19

**Overall: PASS. No 🔴 blockers; two 🟡 should-fix items (both about the JWKS key filter) and three 💭 notes.** Read
only; the auditor did not run tests or checks (`node_modules` absent), so jose 6.x behaviour (`^6.2.17`) is from the
library's known source.

### Findings
🟡 **1. One key with an unexpected `kty` makes the whole key set unusable** (`server/jwks.js:94`).
- `if (!KTYS.has(key?.kty)) throw` rejects the entire fetched set if any single key has a `kty` outside the allowlist.
  If Identity adds a key of a new type next to its ES256 key (e.g. a post-quantum key during a migration), every
  refetch fails with `parse`; TUDO serves the stale set for 24 h, then answers 503 `auth_unavailable` to every user.
  Not attacker-triggerable, but a legitimate issuer change becomes a full outage.
- Fix: filter instead of rejecting — keep only keys usable for ES256 (`kty === "EC"`, `crv === "P-256"`, `use`
  undefined or `"sig"`, `alg` undefined or `"ES256"`), fail only when none are left, pass the filtered set to
  `createLocalJWKSet`. Add a `jwks.test.ts` case: one EC P-256 key plus one `{kty:"AKP"}` key still verifies.

🟡 **2. The `kty` allowlist is wider than the pinned algorithm** (`server/jwks.js:13`). `KTYS` admits `RSA`, `OKP` and
`oct`. No algorithm-confusion attack today: `algorithms: ["ES256"]` (`identity.js:117`) is checked by jose before the
key getter, and jose's local key set selects only `kty === "EC"`/`crv === "P-256"` for ES256 and honours `use`, `alg`,
`key_ops`. But admitting `oct` (symmetric) in a public key set is the wrong signal; only the `algorithms` option stands
between it and HS256 confusion. Fix: the same filter as finding 1 (defence in depth if `algorithms` is ever widened).

💭 **3. Any other key-lookup error becomes a 503** (`server/identity.js:98-104`). Errors other than `JwksUnavailable` and
the two "no/multiple matching key" codes map to `JwksUnavailable` (503) — e.g. a malformed key published by Identity,
selected by `kid`. Never grants access; reasonable (issuer-side failure); finding 1's filter narrows it. No change.

💭 **4. 503 vs 401 reveals whether a JWKS refresh is failing** (`server/jwks.js:143`). During a refresh failure a random
`kid` gets 503, not 401. Minimal information and what the ticket asks for. Probes cannot cause a refetch storm: the
unknown-`kid` refetch is gated on `lastAttemptAt` (one per 60 s) and shared through `inflight`.

💭 **5. During an outage, expired tokens also get 503** (`server/jwks.js:132`). With no usable keys the error is raised
before jose checks `exp`, `iss`, `aud`, `maxTokenAge`. Fail-closed; the SPA's normal refresh is unaffected.

### Checks that passed
- **Key-carrying headers:** `identity.js:85` checks `jku`, `x5u`, `jwk`, `x5c` with `in` on the parsed protected header
  (empty strings and `null` caught), inside the key getter before `remote` is created or called (also covers an
  injected `jwks`). jose rejects unknown `crit` before the getter (`crit:["jku"]` → 401 `invalid`). Names are
  case-sensitive (`JKU` is not acted on). Compact JWS has no unprotected header. A `__proto__` key from `JSON.parse` is
  an own property. Limitation: HS256 / `alg:none` tokens are rejected as `alg` before the header check (still 401).
- **Algorithm pinning:** ES256 only; jose's key matching requires EC P-256 (see finding 2).
- **JWKS fetch:** URL only from `loadIdentityConfig` (exactly `https://<host>`, forced to `https://api.mmlabs.online`
  in production; `jwksUrl` not read from env). `redirect: "error"`, 5 s `AbortSignal.timeout` covering the body, 200
  only, 64 KiB cap on `Content-Length` and while streaming (after decompression, so no zip bomb). Fatal UTF-8 decoding,
  `JSON.parse` without merge, `keys` must be a non-empty array; a bad response never replaces the cache
  (`jwks.js:112-114` run only on success).
- **Cache:** fresh 300 s; 60 s cooldown after a failed attempt (`:128`); unknown `kid` refetch ≤ 1/min (`:137`); shared
  fetches (`:102`). `fetchedAt` moves only on success, so a revoked key outlives removal by ≤ 300 s normally and ≤ 24 h
  while fetches fail (hard cut-off at `:132`/`:138`; D50).
- **503 never grants access:** `app.js:122-128` both branches return before `handleApi`; the flag exists only on
  `ok: false`; the decision uses the boolean, not code strings.
- **No secrets in responses or logs:** fixed 503 body `{error:{code:"auth_unavailable"}}` + `Retry-After: 30`; logs
  `{event:"auth_unavailable", code}`, `{event:"auth_denied", code}`, `{event:"jwks_refresh_failed", reason}` with fixed
  codes; `identity.js` never reads `err.message`.
- **Claim checks unchanged:** `iss`, `aud`, `typ`, `requiredClaims`, `maxTokenAge` 43200 (D46), string checks on `aud`
  and `jti`, `email_verified === true`, `sub` UUID check, role-prefix check (`identity.js:116-139`).
- **SPA:** `authFetch.ts:44,47` signs out only after two 401s in a row; a 503 passes through without `onAuthLost`;
  `auth_unavailable` has Vietnamese copy (`apiErrors.ts:11`).

### Follow-ups
- If findings 1 and 2 are not fixed here: a small ticket to filter the key set to EC P-256 signing keys.
