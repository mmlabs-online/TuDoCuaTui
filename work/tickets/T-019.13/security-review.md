# Security review — T-019.13

## Attempt 1 — 2026-11-15 (security-ai-generated-code-auditor)

Read-only; nothing run (db suites not executed by the implementer). **No 🔴.**

### 🟢 Verified
- **Owner lane not obtainable by non-owners:** owner value from `TUDO_OWNER_SUB` only, trimmed/lowercased/UUID-checked, nil rejected (`server/auth.js:34-36`); caller id from the verified JWT `sub`, which must already be canonical (`server/identity.js:121-122`); plain `===` (`server/ai/rateLimit.js:66`, `server/inflight.js:16`); flows via `ownerSubOf(authConfig)` (`server/index.js:93`). Null owner short-circuits safely.
- **Access mode:** every request already resolves to the owner; per-user caps were already the tighter bound (plan A5).
- **No meaningful new DoS:** stolen owner token still bound by per-user AI windows, `perUser` slots and the 2 MiB cap (`rateLimit.js:67`, `inflight.js:17`); extra memory ≤ 3 × 2 MiB (16 MiB worst case); release idempotent and symmetric (`inflight.js:16-28`); slots per app (`server/app.js:40,46`).
- **Slowloris:** total + idle timers, idle re-armed per chunk (`server/photos.js:52-57`), cleared in `finish()` (`:46-47`) on end/error/close/413/408; slot released in `finally` (`photos.js:175-177`, `server/ai/tagPhoto.js:76-78`); 408 via `rejectUnread` with `Connection: close`; buffering capped (`photos.js:58-60`); missing `bodyTimeouts` falls back to 15 s / 5 s.
- **`TUDO_OWNER_SUB`:** fails closed with fixed messages → exit 2 (`index.js:40-45`); value never printed (tests `index.cli.test.ts:100-103`, `auth.test.ts:40-51`); error precedence unchanged.
- **No auth/RLS regression:** verifier untouched (`identity.js:99-135`); photo queries scoped by `user_id` via `withUser`.
- **`check-image.sh`:** dummy owner value labelled not secret (lines 24-25, 163); `expect_exit` discards output (line 98).

### 🟡
- **Y1** `server/photos.js:55-61`: the `data` handler doesn't check `done`; a chunk after `finish` re-arms an idle timer and appends (still capped ~2 MiB). Fix: `if (done) return;` + a unit test.
- **Y2** `server/ai/tagPhoto.js:39-48`: the tag slot is held across `loadSettingsKey` before the body timers start (DB latency, not attacker-driven). Keep the order (deliberate: busy answers cost no quota); follow-up with R8.
- **Y3** slow headers not covered (Node `headersTimeout` 60 s / `requestTimeout` 300 s) — deferred consult R8.
- **Y4** `scripts/check-image.sh:109`: `expect_exit 2` passes on any config error; optionally assert the "TUDO_OWNER_SUB must be set" message without echoing env.

### Recommendations
1. Y1 one-line fix with test. 2. Y2/Y3 to follow-ups. 3. Optional Y4. 4. Ensure CI runs `server/isolation.db.test.ts`.

### Risks
Owner account is the most valuable to steal (bounded by per-user limits, 15-min tokens); wrong `TUDO_OWNER_SUB` gives the lane (availability only) to another account — M-21 check catches it; non-owners can still lock each other out (T-019.14 bounds); shared Drive rate limits and uncapped photo GETs (A4); timers depend on Cloudflare streaming bodies (unmeasured).

### Open questions
Owner lane for photo GETs once an R8 GET cap lands? Is 5 s idle enough on Vietnamese mobile data (product risk)?
