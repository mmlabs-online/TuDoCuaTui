## Attempt 1 — 2026-11-22

### Files touched
| File | Required because |
|---|---|
| `db/migrations/20261122160000_ai_app_keys.sql` (new) | Plan §1: table `ai_app_keys`, provider PK check, RLS ENABLE + FORCE, 4 maintenance policies (`tudo.maintenance = 'app-keys'`). |
| `server/db.js` | Add `withAppKeys(pool, fn, { readOnly })` (narrow access path on `tudo.maintenance = 'app-keys'`). |
| `server/migrator.js` | Add `APP_KEYS_VERSION = "20261122160000"` and `ai_app_keys` to `RLS_TABLES`. |
| `server/ai/crypto.js` | Add `sealAppKey` and `openAppKey` with version prefix `app-v1:` and provider-bound AAD `tudocuatui-app-key|v1|${provider}`. Legacy BYOK v2 untouched. |
| `server/ai/openai.js` (new) | Add pure key checker `checkOpenAiKey({ fetch, key, timeoutMs })` against `https://api.openai.com/v1/models` (validates key without consuming tokens). |
| `server/ai/appKeys.js` (new) | Store module `createAppKeyStore`: provider allowlist, `list`, `put` (upsert + hint), `delete`, `test`. |
| `server/ai/adminRoutes.js` (new) | Owner-only router for `/api/admin/ai-keys*`: strictly enforces `userId === ownerSub` (403 for non-owners), handlers for GET, PUT, DELETE, POST test. |
| `server/api.js` | Mount `/api/admin/ai-keys*` route and dispatch to `handleAdminAiKeys`. |
| `server/app.js` | Instantiate `appKeys` store in `aiContext` and pass to `handleApi`. |
| `server/ai/routes.js` | Add `appKeys` optional property to `AiContext` typedef. |
| `server/ai/crypto.test.ts` | Unit tests for `sealAppKey`/`openAppKey`, provider binding, tamper resistance, cross-isolation with BYOK v2 ciphertexts. |
| `server/ai/openai.test.ts` (new) | Unit tests for `checkOpenAiKey` (success, 401 invalid key, network timeout, error status). |
| `server/ai/appKeys.test.ts` (new) | Unit tests for provider allowlist, format validation, and inertness static checks (no AI execution route touches shared keys). |
| `server/ai/adminRoutes.test.ts` (new) | Integration tests verifying 403 on all routes for non-owners (leaking no secrets) and full CRUD/test workflows for owner. |
| `server/ai/appKeys.db.test.ts` (new) | Real Postgres test suite for CRUD, upsert on conflict, decryption test, and RLS isolation. |
| `server/rls.db.test.ts` | Truncate `ai_app_keys`, catalog snapshot, `pg_policies` snapshot, GUC isolation, and `app keys (F-706.3)` test suite. |
| `server/schema.db.test.ts` | Forced-tables list update and `ai_app_keys` constraints unit tests. |
| `server/migrator.db.test.ts` | Migration count 10 -> 11, force-guard test for `ai_app_keys`, and `beforeCredit` cleanup helper. |
| `docs/data-model.md` | Document `ai_app_keys` table definition, AAD binding, and maintenance policy. |
| `db/migrations/README.md` | Document `20261122160000_ai_app_keys.sql` as app-wide secret table. |
| `server/README.md` | Document `/api/admin/ai-keys*` owner-only endpoints. |

### Tests added / changed
- New test suites:
  - `server/ai/openai.test.ts` (5 tests)
  - `server/ai/appKeys.test.ts` (5 tests)
  - `server/ai/adminRoutes.test.ts` (2 tests)
  - `server/ai/appKeys.db.test.ts` (3 tests)
- Extended test suites:
  - `server/ai/crypto.test.ts` (+3 tests for app keys)
  - `server/rls.db.test.ts` (+1 test suite `app keys (F-706.3)` with CRUD & isolation checks)
  - `server/schema.db.test.ts` (+1 test for constraints and allowlist)
  - `server/migrator.db.test.ts` (+1 test for unforced table guard on `ai_app_keys`)

### Checks (actual output summary)
- `pnpm format:check`: all 353 matched files use the correct format (`oxfmt --check`).
- `pnpm typecheck`: clean (`tsc --noEmit && tsc -p tsconfig.server.json`).
- `pnpm test`: 8 test files, 109 tests passed against real Postgres 17 test cluster (`TEST_DATABASE_URL`).
- `pnpm build`: client build succeeded (`vite build`).

### Out-of-plan files
None.

### Deviations from the plan
- In `server/ai/adminRoutes.test.ts`, the router uses standard server error shape `{ error: { code: ... } }` produced by `sendError` from `server/http.js`.
- In `server/ai/appKeys.db.test.ts`, tests connect via `createTestDb({ owner: true })` as a `NOSUPERUSER` role to ensure RLS policies are actively exercised in real Postgres.

### Follow-ups (noticed, not done)
- F-706.4: AI routes cutover to fallback/shared app key.
- F-706.6: Admin UI panel in frontend settings.
