## Attempt 1 — 2026-11-12

Slice T-018.1 only. Nothing from the T-018.2 outline (POST /test, Claude call, deploy drafts, M-16) was implemented.

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261112160000_ai_settings.sql` | Singleton `ai_settings` table (D25: no RLS, no `user_id`), checks, `updated_at` trigger, rollback block. Sorts after the newest migration on `main` (20261112140000). |
| `server/ai/catalog.js` | C1/C4: JS port of catalog + `AI_ERROR_STATUS` (with the 4 new codes) |
| `server/ai/validate.js` | C1: port of validate plus `parseSettingsBody` |
| `server/ai/mask.js` | C1: port of mask |
| `server/ai/crypto.js` | AES-256-GCM seal/open, AAD `tudocuatui-ai-key\|v1\|single\|<provider>` (C11); exports typedef `AiKek` because `CryptoKey` is not a global type under `lib: ES2023` |
| `server/ai/config.js` | C3: `loadAiConfig`, `AiConfigError` |
| `server/ai/store.js` | SQL for `ai_settings`: `get`, `save` (one transaction), `clearKey` |
| `server/ai/rateLimit.js` | C5: in-memory limiter, save 30/h, test 20/h |
| `server/ai/routes.js` | GET / PUT `/api/ai-settings`, DELETE `/api/ai-settings/key` |
| `server/api.js` | 2 new routes in `match()`; dispatch after the `Sec-Fetch-Site` guard, before the UUID check |
| `server/app.js` | optional `ai` dep; one limiter per app; store from `ai.store` or the pool |
| `server/index.js` | `loadAiConfig`, exit 2 on malformed, import KEK once, log `ai configured` / `ai not configured` |
| `src/shared/ai/errors.ts` | C4: 4 codes added to `AI_ERROR_STATUS` (line 1 untouched) |
| `supabase/functions/_shared/ai/errors.ts` | byte-identical mirror (`mirror.test.ts`) |
| `src/shared/ai/boundary.test.ts` | `AI_KEK`, `ai_settings` added to `FORBIDDEN` |
| `tsconfig.server.json` | `allowImportingTsExtensions` so `parity.test.ts` can import `src/shared/ai/*.ts`; the step worked, no fallback needed |
| `vitest.config.ts` | coverage threshold `server/ai/**` (R8) |
| `scripts/check-image.sh` | `AI_` in the image-env regex; `expect_exit 2 "server with malformed AI_KEK"` |
| `server/README.md` | `AI_KEK` row, "AI settings (T-018)" section, D28 wording fix on the Drive line |
| `work/decisions.md` | D30 appended |
| `work/tickets/{T-010,F-701,F-702,T-016}/ticket.md` | dated notes (plan Approach §8); F-701 `Depends on` is now `T-018.2` |
| `work/tickets/T-018/impl-log.md` | this log |

### Tests added / changed
- `server/ai/parity.test.ts` › constants are equal; validate agrees on a fixture table; mask agrees
- `server/ai/crypto.test.ts` › round trip and differing seals; rejects wrong KEK / provider / tampering / truncation / `v2:` / bad base64; `importKek` bad inputs
- `server/ai/config.test.ts` › unset/empty/valid; malformed values name `AI_KEK`, never the value
- `server/ai/rateLimit.test.ts` › 30 then 31st fails, window expiry, kinds separate, default clock
- `server/ai/validate.test.ts` › `parseSettingsBody`
- `server/ai/routes.test.ts` › GET view shape; PUT validation; PUT key handling; DELETE key; rate limit; routing and guards; KEK off; store unavailable; sentinel never leaves the server
- `server/ai/store.db.test.ts` (`skipIf(!dbAvailable)`) › singleton and column checks, trigger, save/get/clearKey, `key_required`, ciphertext-only storage
- `server/index.cli.test.ts` › no `AI_KEK` logs 'ai not configured'; valid `AI_KEK` logs 'ai configured' without the value; malformed exits 2

### Checks (actual output summary)
- typecheck: `pnpm typecheck` clean (`tsc --noEmit && tsc -p tsconfig.server.json`). Needed `pnpm install --frozen-lockfile` first (node_modules was missing `jose`, `pg`, `@testing-library/*`; no tracked file changed).
- format:check: "All matched files use the correct format."
- test: `pnpm test --coverage`: 67 files passed, 2 failed, 783 tests passed, 2 failed, 109 skipped (DB tests, no `TEST_DATABASE_URL` in that run). The 2 failures are **pre-existing on this Windows machine** and fail identically with my changes stashed: `server/api.test.ts › body > 256 KB -> 413 ...` (ECONNRESET) and `server/index.cli.test.ts › starts on PORT ... SIGTERM exits 0` (exit code null: no POSIX SIGTERM on Windows). They are not in code I touched; CI (Linux) is the authority. `server/ai` coverage: 86% lines, 86% branches, 81% functions without the DB test (thresholds 80/75).
- build: `pnpm build` ok (vite built, no errors).
- DB tests: no `TEST_DATABASE_URL` was set locally, so I ran a throwaway `postgres:16-alpine` container (removed afterwards, throwaway password): `store.db.test.ts`, `schema.db.test.ts`, `migrator.db.test.ts` = 3 files, 33 tests passed.
- Not run: `scripts/check-image.sh` (needs the CI `image` job / a built image); review the script diff.

### Out-of-plan files
None. (`pnpm install` only changed ignored `node_modules`.)

### Follow-ups (noticed, not done)
- The two Windows-only test failures above (api.test 413 ECONNRESET, index.cli SIGTERM exit code) could be made platform-tolerant; unrelated to T-018.
- A12 (from plan): `migrate` will also receive `AI_KEK` through the shared env_file in T-018.2; keep the `debt` issue for a separate env file.
- `routes.js` seals the key outside the `try`; a `sealKey` failure would surface via the app's outer handler as 500 `internal` (not realistic with a valid imported KEK).

### Scope self-check
- Could the diff be smaller? No: each file is in the plan's list; tests are the ones the plan lists.
- Diff size: 21 files, about +1,050 / -8 lines including tests (production code about 450).
