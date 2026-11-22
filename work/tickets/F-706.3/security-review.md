## Attempt 1 — 2026-11-22

### Security audit findings
- **Owner-only Access Control**: Route `/api/admin/ai-keys*` strictly requires `userId === ownerSub` at the router boundary (`server/ai/adminRoutes.js`). Non-owners receive 403 `forbidden` immediately with no key presence, hint, or configuration detail disclosed.
- **RLS & Isolation**:
  - `ai_app_keys` is protected by `alter table ai_app_keys enable row level security` and `alter table ai_app_keys force row level security`.
  - Policies `ai_app_keys_select`, `ai_app_keys_insert`, `ai_app_keys_update`, `ai_app_keys_delete` require `current_setting('tudo.maintenance', true) = 'app-keys'`.
  - User transactions (`withUser`) operate with `tudo.maintenance = ''`, seeing 0 rows on SELECT and failing with 42501 on INSERT/UPDATE/DELETE.
  - `withAppKeys` sets `app.user_id = ''`, ensuring administrative sessions cannot read or tamper with user wardrobe items or photos.
- **Encryption & Key Isolation**:
  - Plaintext keys are sealed with AES-256-GCM using `AI_KEK`.
  - Format prefix `app-v1:` and provider-bound AAD `tudocuatui-app-key|v1|${provider}` prevent cross-provider key re-use.
  - Cryptographic separation ensures legacy BYOK v2 ciphertexts cannot be opened as app keys, and app key ciphertexts cannot be opened as BYOK user keys.
  - Stored ciphertexts are never returned in any API response or log event; only masked hints (`••••${last4}`) are exposed.
- **Provider Key Verification without Token Consumption**:
  - Claude uses Haiku model list check (`server/ai/claude.js`).
  - Gemini uses Flash metadata check (`server/ai/gemini.js`).
  - OpenAI uses `GET https://api.openai.com/v1/models` (`server/ai/openai.js`).
  - None of the test checkers consume AI generation tokens.
- **Inertness**:
  - Static grep tests verify that runtime AI route handlers (`tagPhoto.js`, `suggestOutfits.js`, `outfitSuggest.js`) do not import or read shared app keys. User BYOK functionality remains completely unchanged until F-706.4.

Verdict: **PASS** (no 🔴 blockers).
