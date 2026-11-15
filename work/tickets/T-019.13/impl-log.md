## Attempt 1 — 2026-11-15

### Files touched
| File | Required because |
|---|---|
| server/ai/rateLimit.js | owner lane: `ownerSub` skips and is not counted in the global ceilings (AC1) |
| server/inflight.js | `exempt` user ignores/not counted in `total`; per-user cap still applies (AC1) |
| server/photos.js | `photoSlots` and `bodyTimeouts` from ctx (module singleton removed); `BODY_TIMEOUTS` 15 s total / 5 s idle; `readBody` idle timer (AC1, AC2) |
| server/ai/tagPhoto.js | `readBody(req, ai.bodyTimeouts)` (AC2) |
| server/ai/routes.js | `AiContext` typedef: optional `bodyTimeouts` (typecheck; optional so `routes.test.ts` contexts stay valid) |
| server/app.js | deps `ownerSub`, `bodyTimeouts`; per-app `photoSlots`, `tagSlots` with `exempt`; limiter gets `ownerSub` |
| server/api.js | forwards `photoSlots`, `bodyTimeouts` to `handlePhoto` |
| server/auth.js | identity mode requires `TUDO_OWNER_SUB` (never printed); `ownerSubOf(cfg)` |
| server/index.js | `ownerSub: ownerSubOf(authConfig)` into `createApp` |
| server/README.md | env table, limits and 408 text |
| scripts/check-image.sh | `expect_exit 2` for identity without owner; owner env on identity smoke |
| server/ai/rateLimit.test.ts, server/inflight.test.ts, server/photos.test.ts, server/api.test.ts, server/ai/tagPhoto.test.ts, server/isolation.db.test.ts, server/auth.test.ts, server/index.cli.test.ts | tests listed in the plan; identity fixtures now carry an owner |

### Tests added / changed
- rateLimit.test.ts › "owner lane": passes when others fill the global ceiling (test/save/tag); owner not counted; per-user limit and window still apply; `ownerSub` unset has no owner lane
- inflight.test.ts › "exempt user": acquires with total full / not counted; perUser still applies; idempotent release
- photos.test.ts › "readBody timeouts": idle 408; drip-feed cut at total 408; steady upload ok
- api.test.ts › "photo body timeouts": two slow PUTs -> 408, third not 503 (`start` takes optional `bodyTimeouts`)
- ai/tagPhoto.test.ts › "body timeouts and owner lane": slow body 408 + slot released; owner accepted while B and C hold both shared slots, B again -> ai_busy (`start` takes `ownerSub`, `bodyTimeouts`)
- isolation.db.test.ts › "owner photo PUT succeeds while B and C hold every non-owner slot" (uses its own app with `ownerSub`)
- auth.test.ts: identity missing/blank/malformed/nil owner, `ownerSubOf`; `ID` fixture has an owner
- index.cli.test.ts: identity blank/malformed owner -> exit 2, value not printed; production identity starts with a valid owner

### Checks (actual output summary)
- typecheck: pass (`tsc --noEmit` and `tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format"
- test: Test Files 88 passed | 8 skipped (96); Tests 1111 passed | 168 skipped (1279). The `*.db.test.ts` files are skipped here (no Postgres), so the new isolation.db test was NOT executed; it type-checks and is formatted.
- build: pass (vite build, built in 463ms)
- `bash -n scripts/check-image.sh`: ok (Docker not run)

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Run `server/isolation.db.test.ts` where a test Postgres exists (CI).
- Plan listed `server/app.test.ts` only if it asserts identity config shape; it did not need changes.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: not measured (no git repo in this environment).
