# Consult — software-architect — F-701 (2026-11-13)

## Findings

**F1. The ticket text is out of date.** It still describes a Supabase Edge Function, the `tudo-` name, zod, the Anthropic SDK and "both providers". Since then: D23/D30 move the work onto the Node server, AI is API-mode only; D33 per-user keys arrive in T-019.3 (BACKLOG, behind T-019.2), so F-701 runs while there is still a single `ai_settings` row; the feature list F-701 still says "storage path or image" and "Supabase secrets" (amended by D21, D30, D33) — flag in the plan.

**F2. T-018.2 already provides the seams:** `store.getSecret()` (SQL only); `openStoredKey(kek, secret)` (only AAD site; T-019.3 changes it to v2 there only); pure adapter `server/ai/claude.js` (`{fetch, key, model, timeoutMs}`); `mapClaudeError(status)`; `AI_ERROR_STATUS` kept equal to `src/shared/ai/errors.ts` by `parity.test.ts`; `createLimiter` keyed by `CallKind`; `initAi` sets `ai = null` when the KEK is missing or request auth is off (503 for free). `handleTest` (`server/ai/routes.js` 59–72) already runs `getSecret` → provider/model check before decrypting → `openStoredKey` → adapter.

**F3. Gemini cannot be called today.** `AI_MODELS.gemini = []`, `isAllowedModel("gemini", x)` is always false, `/test` answers 400 `invalid_model`; `providerErrors.js` says "the Gemini half is F-701's or later".

**F4. In the editor, a new photo is not stored anywhere yet.** `Editor.tsx` `upload()` keeps a data URL in browser state; it reaches Drive (`PUT /api/items/:id/photo`) only on save. So for F-702's main case (new item, photo just picked) there is no photo id/Drive file; F-703 (bulk import) also tags before save. For an existing item the browser already holds the bytes (or will after T-019.6, `blob:`).

**F5. The server has no colour list.** `server/validate.js` has `CATEGORIES`, `DEPRECATED_CATEGORIES`, `SEASONS`; colours are free strings. Allowed colour ids exist only in `src/data/mappers.ts` `COLOR_TO_DB`. The server image has no `src/`, so the server needs its own copy plus a parity test.

**F6. No zod and no Anthropic SDK in `package.json`.** Server validation is hand-written; T-018.2 kept `claude.js` as plain `fetch` (fake-fetch tests, pinned host, `redirect:"error"`, no key leak).

**F7. Reusable photo-upload guards** in `server/photos.js`: `image/jpeg` + magic bytes, 2 MB `MAX_BYTES`, 30 s body deadline, `rejectUnread`, in-flight cap 3; `readBody`/`rejectUnread` not exported. Browser `resizeImage` (1200 px, JPEG ~0.82) fits Claude's limits (< 5 MB, long edge ≤ 1568 px).

## Recommendations

**R1. Endpoint `POST /api/ai/tag-photo`, raw JPEG body** (`image/jpeg`, ≤ 2 MB, magic `FF D8 FF`; no JSON, no item id). Success `200 {"suggestion": {name, category, colors[], seasons[], material, brand, tags[]}}`, `Cache-Control: no-store`. Route via `match()` (`parts.length === 4 && a === "ai" && b === "tag-photo"`, `POST`), `Sec-Fetch-Site` guard applies; dispatch to the AI module. Uploading (vs tagging a stored photo by id) works for unsaved items (F-702) and bulk import (F-703), keeps Drive off the AI path, and needs no ownership lookup (no IDOR under T-019.2). Trade-off: re-sending ~150–300 KB for existing items. `?photo=<id>` can be a follow-up.

**R2. Check order** (mirrors `/test`): 1) `ai === null` → 503 `server_misconfigured`; 2) `limiter.check("tag")` → 429 (`rejectUnread`); 3) content type not `image/jpeg` → 415, declared length > 2 MB → 413 (`rejectUnread`); 4) in-flight ≥ 2 → 503 + `Retry-After`; 5) `!store` → 503 `db_unavailable`; 6) `getSecret()` null → 409 `not_configured`, provider/model not allowed (all Gemini today) → 400 `invalid_model`; 7) read body with deadline + cap, magic bytes → 400 `invalid_photo`; 8) `openStoredKey` → 409 `key_unreadable`; 9) adapter. Export `readBody`/`rejectUnread` (or move to `server/upload.js`), don't copy. Abort the provider fetch on response `close`. Factor 6+8 into `loadSettingsKey(ai)` → `{ok, provider, model, key} | {ok:false, status, code}`, used by `/test` and tag (deliberate small refactor of `handleTest`, R7).

**R3. Claude call: plain `fetch` to the Messages API with forced tool use.** `tagPhotoWithClaude({fetch, key, model, image, timeoutMs = 45_000})` in `claude.js`. `POST https://api.anthropic.com/v1/messages` (pinned), `redirect:"error"`, `AbortSignal.any([timeout, callerSignal])`; headers exactly `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Body: `model`, `max_tokens: 1024`, one user message with `{type:"image", source:{type:"base64", media_type:"image/jpeg", data}}` then a short instruction; `tools: [TAG_TOOL]`, `tool_choice: {type:"tool", name:"tag_item"}`. `TAG_TOOL.input_schema`: enums from server lists (`category` from `CATEGORIES`, never deprecated; `colors` from `COLOR_IDS`; `seasons` from `SEASONS`), `maxItems`/`maxLength`; English id descriptions (R6); `name`/`material`/`tags` in Vietnamese; `brand` only if legible, else `null`. Response: cap body (64 KB) → else `provider_bad_response`; require `stop_reason === "tool_use"` and exactly one `tool_use` named `tag_item`, return its raw `input`; `max_tokens`/`refusal`/non-JSON/missing tool → `provider_bad_response`; non-2xx → cancel body, `mapClaudeError(status)` (529 → `provider_unavailable`). No retries. Tool use (not structured outputs) because stable; server re-validates. Describe as "schema-guided, server-validated", never trusted.

**R4. Provider-agnostic sanitizer `server/ai/tagging.js` `parseTagSuggestion(raw)`.** Unknown/deprecated enum values dropped; category `bag`/`sport`/`home`/unknown → `null` (not `"other"`); colours deduped, in `COLOR_IDS`, max 3; seasons deduped, in `SEASONS`; strings trimmed + NFC, NUL dropped, caps as `parseItemInput` (name 120, brand/material 200); tags ≤ 5, 1–30 chars; only the 7 known own properties read. Structural failure (not a plain object) → `provider_bad_response`. Output DB ids; F-702 maps via `mappers.ts` `*_FROM_DB` (R6). `TAGGERS = { claude: tagPhotoWithClaude }` map in the route.

**R5. Server vocabulary + parity.** `COLOR_IDS` in `server/validate.js`; TS test: `COLOR_IDS` = `Object.values(COLOR_TO_DB)`, `CATEGORIES` = `Object.values(CATEGORY_TO_DB)`, `SEASONS` = `Object.values(SEASON_TO_DB)`. Add `provider_bad_response: 502` and `invalid_photo: 400` to `server/ai/catalog.js` and `src/shared/ai/errors.ts` (parity test). Optional `TagSuggestion` type in `src/shared/ai/`. Only additive `src/` changes; local mode unchanged (R1).

**R6. Gemini: Claude only in F-701; split Gemini into F-701.1.** Gemini rows → 400 `invalid_model` before decryption. F-701.1 needs catalog models, a `/test` key check, a `generateContent` adapter (`inline_data`, `responseMimeType: application/json`, `responseSchema`), reuse of `parseTagSuggestion`, `mapGeminiError` (invalid key is 400 `API_KEY_INVALID`; allowlisted reason parsing like `drive.js` `reasonOf`), key in `x-goog-api-key`, never `?key=`.

**R7. Limits.** `tag` in `rateLimit.js` `{max: 100, windowMs: 24 h}`; optional burst 20/10 min. In-flight cap 2. Body deadline 30 s, provider timeout 45 s, `max_tokens` 1024, image ≤ 2 MB JPEG. F-702 must `resizeImage` before posting.

**R8. Logs and secrets.** Log exactly `{event:"ai_tag", id, code, ms}` (+ numeric `status`). Never log image, suggestion, error body, key or error object. Sentinel suite: key only in `x-api-key` on one call to the pinned URL; 401 body echoing the sentinel and fetch error with the sentinel never reach response/headers/logs; image bytes base64-equal to the upload and nowhere else.

**R9. T-019.3 changes (not F-701):** `loadSettingsKey(ai, userId)`; AAD v2 in one place; `check(kind, userId)` with a global ceiling including `tag`; in-flight cap stays global; two-user isolation test (B → `not_configured`, no fetch). Append a dated note to `work/tickets/T-019.3/ticket.md`. Nothing changes after T-019.6.

**R10. Tests (fake fetch).** `claude.test.ts › tagPhotoWithClaude`: request shape (URL, method, redirect, exact headers, forced `tool_choice`, schema enums = server lists, base64 round-trip, signal); success; text-only / `max_tokens` / `refusal` / two `tool_use` / malformed JSON / over cap → `provider_bad_response`; statuses 401, 403, 404, 429, 500, 529; timeout, sentinel network error, caller abort. `tagging.test.ts`: sanitizer table. Route tests: each guard step (no fetch / no `openStoredKey` on early rejects), 415, 413 (declared and streamed), bad magic, `not_configured`, Gemini → `invalid_model`, `key_unreadable`, limiter 100 then 429 (exactly 100 fetches), in-flight 503, client disconnect aborts fetch, `ai:null` 503, `GET` 405 `Allow: POST`, cross-site 403, fixed-field logs, sentinels. Vocabulary parity test.

## Risks
- Prompt injection via text in the photo: bounded (enums + capped strings, fills the user's own form, never executed); don't echo provider text.
- Photos leave the server to Anthropic under the user's key (intended, D21); name it under R4 in the plan; F-702 disclosure line?
- Model ids / API drift taken on trust (T-018.2 A8); add an optional real-key smoke M-item.
- In-memory limiter resets on restart and is global until T-019.3 (real window only if Identity goes live before T-019.3).
- Memory: 2 in-flight × (2 MB + 2.7 MB base64 + JSON) fine; don't raise caps without checking.
- Hotspots: `server/ai/{routes,claude,catalog,rateLimit}.js`, `server/api.js`, `server/photos.js`, `src/shared/ai/errors.ts` (T-019.2/.3/.5).
- Cost: Opus vision on the user's key; no retries, `max_tokens` 1024, limiter; F-702 should debounce.

## Open questions (for Ming at plan approval)
1. Gemini: Claude-only now + split Gemini (recommended), or block until Gemini exists? (AC1 "both providers")
2. zod / Anthropic SDK named in the ticket: replace with hand-written validation + plain `fetch` (recommended; no new runtime dependency)?
3. Daily limit 100/day for `tag`; burst limit wanted?
4. New error codes `provider_bad_response` (502) and `invalid_photo` (400) OK?
5. Disclosure in F-702 ("ảnh sẽ được gửi tới Claude bằng key của bạn")?
6. Endpoint path `/api/ai/tag-photo` (recommended) or under `/api/ai-settings/...`?
