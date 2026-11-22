# Software Architect Consult — F-706.3: Owner-only shared AI key storage, replacement and test

## Findings
1. **Crypto & Versioning (D33, D52)**:
   - Existing BYOK keys in `server/ai/crypto.js` are sealed with `VERSION = "v2"` and AAD `tudocuatui-ai-key|v2|${userId}|${provider}`.
   - Bumping `VERSION` or modifying `openKey` would break existing v2 BYOK decryption for all users (violating AC 3).
   - App keys are shared server secrets with no user binding; they must be bound to their provider and app scope.
2. **Owner-Only Authentication**:
   - The owner is identified by `TUDO_OWNER_SUB` (`ownerSub` in `server/app.js` and `server/api.js`).
   - AC 1 requires: "Non-owners get 403 on every key route, and no response ever contains the key or its hint for them."
   - Server must reject any caller where `!ownerSub || userId !== ownerSub` with 403 before inspecting or querying keys.
3. **Provider Key Checking**:
   - `server/ai/claude.js` has `checkClaudeKey`.
   - `server/ai/gemini.js` has `checkGeminiKey`.
   - `openai` is included in the new shared key table (ai-stylist-notes.md:74). A dedicated pure key checker `checkOpenAiKey({ fetch, key, timeoutMs })` is needed (calling `https://api.openai.com/v1/models` without tokens spent).
4. **Inertness until F-706.4**:
   - Existing AI routes (`/api/ai/tag-photo`, `/api/ai/suggest-outfits`) must NOT read the shared key yet. They continue using BYOK `loadSettingsKey(ai, userId)`.

## Recommendations
1. **Crypto Architecture in `server/ai/crypto.js`**:
   - Keep existing `VERSION = "v2"`, `sealKey`, `openKey`, `openStoredKey` completely intact.
   - Add dedicated app-key functions:
     ```js
     const APP_KEY_VERSION = "app-v1";
     export async function sealAppKey(kek, provider, plaintext) { ... }
     export async function openAppKey(kek, provider, sealed) { ... }
     ```
   - Format: `app-v1:${base64(iv || ciphertext + tag)}`.
   - AAD: `new TextEncoder().encode(\`tudocuatui-app-key|v1|\${provider}\`)`.
   - Tampering, wrong KEK, or mismatched provider throws unreadable error.
2. **Admin AI Keys Module (`server/ai/appKeys.js`)**:
   - Encapsulates DB operations and crypto:
     - `listAppKeys(pool)`: returns list of `{ provider, keyHint, updatedAt }` using `withAppKeys(pool, ..., { readOnly: true })`.
     - `putAppKey(pool, kek, provider, plaintext)`: validates `validateApiKeyFormat(plaintext)`, seals with `sealAppKey`, upserts into `ai_app_keys`, returns `{ ok: true, keyHint }`.
     - `deleteAppKey(pool, provider)`: deletes from `ai_app_keys` (idempotent), returns `{ ok: true }`.
     - `testAppKey(pool, kek, provider, fetch)`: loads sealed key, decrypts with `openAppKey`, calls appropriate checker (`checkClaudeKey`, `checkGeminiKey`, `checkOpenAiKey`), returns `{ ok: true }` or mapped error. Never returns the key.
3. **HTTP Routes (`server/api.js` & `server/ai/adminRoutes.js`)**:
   - Endpoints:
     - `GET /api/admin/ai-keys`
     - `PUT /api/admin/ai-keys/:provider`
     - `DELETE /api/admin/ai-keys/:provider`
     - `POST /api/admin/ai-keys/:provider/test`
   - Authorization guard:
     ```js
     if (!ownerSub || userId !== ownerSub) {
       return sendError(res, 403, "forbidden");
     }
     ```
   - Rate limiting: protect test calls from brute force with existing limiter (`ownerSub` exempt from global limiters, but test calls can be bounded).
4. **OpenAI Key Checker (`server/ai/openai.js`)**:
   - Pure function `checkOpenAiKey({ fetch, key, timeoutMs = 10_000 })`:
     - Calls `GET https://api.openai.com/v1/models` with header `Authorization: Bearer ${key}`.
     - 200 -> `{ ok: true }`.
     - 401 -> `{ ok: false, code: "invalid_key" }`.
     - 429 -> `{ ok: false, code: "provider_rate_limited" }`.
     - others / network timeout -> `{ ok: false, code: "provider_unavailable" }`.

## Risks
- Leaking the plaintext key in responses or logs:
  - Enforce R3: plaintext key is decrypted only in memory at the moment of provider dispatch, never returned in HTTP responses or stored in logs.
- Disruption of existing v2 BYOK decryption:
  - Unit tests must explicitly verify that existing v2 ciphertexts continue to decrypt with `openKey` and `openStoredKey`.

## Open Questions
- None.
