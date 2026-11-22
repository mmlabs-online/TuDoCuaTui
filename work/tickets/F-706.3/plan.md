# Plan: F-706.3 — Owner-only shared AI key storage, replacement and test

Status: READY
Tier: High (touches `server/**` and `db/migrations/**`; Gate: plan-approval)

## 1. Goal
Provide secure, owner-only storage, replacement and testing for one shared AI key per provider (Claude, Gemini, OpenAI) in Postgres. The stored keys remain strictly inert — existing user BYOK routes continue unchanged until the F-706.4 cutover.

## 2. Architecture & Design

### 2.1 Database & Isolation (`ai_app_keys`)
- **Migration**: `db/migrations/20261122160000_ai_app_keys.sql`
- **Schema**:
  ```sql
  create table ai_app_keys (
    provider text primary key check (provider in ('claude', 'gemini', 'openai')),
    key_ciphertext text not null,
    key_hint text not null check (length(key_hint) between 1 and 32),
    updated_at timestamptz not null default now()
  );
  ```
- **RLS (D32)**:
  - `alter table ai_app_keys enable row level security;`
  - `alter table ai_app_keys force row level security;`
  - 4 policies for SELECT, INSERT, UPDATE, DELETE keyed on:
    `current_setting('tudo.maintenance', true) = 'app-keys'`
- **Database Helper (`server/db.js`)**:
  - `withAppKeys(pool, fn, { readOnly = false })`: executes within a transaction setting `tudo.maintenance = 'app-keys'` and `app.user_id = ''`.
  - Inside `withUser`, `tudo.maintenance = ''`, ensuring normal users see 0 rows and cannot write to `ai_app_keys` (42501).
  - Inside `withAppKeys`, `app.user_id = ''`, ensuring user tables cannot be touched.

### 2.2 Cryptography (`server/ai/crypto.js`)
- **Version & BYOK Compatibility**:
  - `VERSION = "v2"` and existing functions (`sealKey`, `openKey`, `openStoredKey`) are **NOT** changed.
  - Legacy v2 BYOK ciphertexts remain fully readable.
- **Dedicated App-Key Sealing**:
  - `sealAppKey(kek, provider, plaintext)`:
    - Prefix: `app-v1:`
    - AAD: `new TextEncoder().encode(\`tudocuatui-app-key|v1|\${provider}\`)`
    - Returns `app-v1:${base64(iv || ciphertext + tag)}`.
  - `openAppKey(kek, provider, sealed)`:
    - Validates `app-v1:` prefix and AAD binding to provider.
    - Fails with `"unreadable"` on tampering, wrong KEK, or provider mismatch.

### 2.3 Provider Key Checkers
- Claude: reuse `checkClaudeKey({ fetch, key, model: "claude-3-5-haiku-20241022" })`.
- Gemini: reuse `checkGeminiKey({ fetch, key, model: "gemini-2.5-flash" })`.
- OpenAI: add pure checker `server/ai/openai.js`:
  - `checkOpenAiKey({ fetch, key, timeoutMs = 10_000 })`: calls `GET https://api.openai.com/v1/models` with `Authorization: Bearer ${key}` (no tokens consumed). Maps 200 -> ok, 401 -> `invalid_key`, 429 -> `provider_rate_limited`, other -> `provider_unavailable`.

### 2.4 Owner-Only HTTP API (`server/api.js` & `server/ai/adminRoutes.js`)
- **Authorization Guard**:
  - Every route under `/api/admin/ai-keys` verifies:
    ```js
    if (!ownerSub || userId !== ownerSub) {
      return sendError(res, 403, "forbidden");
    }
    ```
  - Non-owners get **403 forbidden** immediately. No key or key hint is ever returned.
- **Endpoints**:
  - `GET /api/admin/ai-keys`: returns `{ keys: [{ provider, keyHint, updatedAt }] }` (masked hint only, e.g. `••••1234`).
  - `PUT /api/admin/ai-keys/:provider`: takes `{ apiKey }`. Validates provider and `validateApiKeyFormat(apiKey)`. Seals key with `sealAppKey`, upserts into `ai_app_keys`. Returns `{ ok: true, keyHint }`.
  - `DELETE /api/admin/ai-keys/:provider`: deletes key row for provider. Returns `{ ok: true }`.
  - `POST /api/admin/ai-keys/:provider/test`: decrypts key with `openAppKey`, invokes checker. Returns `{ ok: true }` or provider error code. Never returns the key.

### 2.5 Inertness
- Existing AI routes (`/api/ai/tag-photo`, `/api/ai/suggest-outfits`) continue using BYOK settings via `loadSettingsKey`.
- Nothing outside `/api/admin/ai-keys` accesses `ai_app_keys`.

## 3. Assumptions for Ming
- **A1**: Providers supported for shared keys are `claude`, `gemini`, and `openai`.
- **A2**: Key test endpoints run non-token-consuming model list/lookup endpoints (`GET /v1/models/{model}` for Claude, `GET /v1beta/models/{model}` for Gemini, `GET /v1/models` for OpenAI).
- **A3**: Shared keys use route path `/api/admin/ai-keys` with owner authentication (`userId === ownerSub`).
- **A4**: App keys use format `app-v1:` and AAD `tudocuatui-app-key|v1|${provider}`, keeping v2 BYOK ciphertexts unchanged.

## 4. Test Plan
1. **Unit Tests**:
   - `server/ai/crypto.test.ts`: test `sealAppKey` & `openAppKey` roundtrip, wrong provider rejection, wrong KEK rejection, tampering rejection; verify existing v2 BYOK ciphertexts still decrypt with `openKey`.
   - `server/ai/openai.test.ts`: mock fetch tests for `checkOpenAiKey` (success, 401 invalid_key, 429 rate limit, 503 unavailable, network timeout).
   - `server/ai/adminRoutes.test.ts`: test 403 for non-owners on all 4 routes; test owner operations (GET, PUT, DELETE, POST test); test response shapes contain no plaintext keys.
   - `server/ai/appKeys.test.ts`: test inertness — static scan ensuring no non-admin route imports or calls `appKeys.js`.
2. **Database & RLS Tests (`*.db.test.ts`)**:
   - `server/ai/appKeys.db.test.ts`: CRUD against real Postgres under `withAppKeys`.
   - `server/rls.db.test.ts`: catalog snapshot updated for `ai_app_keys`; verify `ai_app_keys` is inaccessible inside `withUser` (0 rows on select, 42501 on insert).
   - `server/schema.db.test.ts`: verify `ai_app_keys` primary key and check constraints.
   - `server/migrator.db.test.ts`: verify `RLS_TABLES` guard enforces RLS on `ai_app_keys`.
3. **Repo Checks**:
   - `pnpm format:check`, `pnpm typecheck`, `pnpm build`.

## 5. Scope Boundaries
- **In Scope**: DB migration, RLS policies, crypto functions, OpenAI key checker, admin API routes, RLS tests, unit tests.
- **Out of Scope**: Admin UI screen (F-706.6); cutover of AI routes to shared key (F-706.4); OpenAI image adapter (F-708.2); deleting BYOK keys (F-706.8).
