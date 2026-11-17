# Consult — software-architect — F-701.1 (2026-11-17)

Read-only; no files changed, no network calls.

## Findings

**F1. Where Claude is still hard-wired (these are the only gates)**
- `server/ai/routes.js:48`: `provider !== "claude"` returns `invalid_model` before decryption. The return type at `routes.js:41` is `provider: "claude"`.
- `server/ai/routes.js:84`: `/test` always calls `checkClaudeKey`. There is no per-provider dispatch.
- `server/ai/tagPhoto.js:12`: `TAGGERS = { claude: tagPhotoWithClaude }`.
- `server/ai/catalog.js:18` and `src/shared/ai/catalog.ts:22`: `gemini: []`. The comment at `catalog.ts:12-15` says the list stays empty "until ids are verified".
- Settings: `AiSettingsModal.tsx:141` disables an option when `modelsFor(p).length === 0`, so filling the catalog enables Gemini with no TSX change. Only the label changes: `copy.ts:9` `"Gemini (sắp có)"` → `"Gemini"`.

**F2. Prior art exists in git.** The T-009 Edge Function had a Gemini key check and mapper, removed in `54ea5fb` (T-016): `git show 54ea5fb^:supabase/functions/_shared/core/{gemini,providerErrors}.ts`. It used `GET v1beta/models/{model}` with `x-goog-api-key`, `mapGeminiError(status, reason)` and `geminiReasonOf(body)` reading `error.details[].reason`. `work/tickets/T-009/impl-log.md:41` records that the endpoint and error shape were written from memory and never checked. It is a usable starting point, but it had no `redirect:"error"` and no body cap, and it called `res.json()` on error bodies without a size limit.

**F3. `drive.js` `reasonOf` (`server/drive.js:104-115`) reads the wrong shape for Gemini.** It reads `error.errors[0].reason`, the legacy Drive v3 shape. Generative Language returns the google.rpc shape: `{error:{code,message,status:"INVALID_ARGUMENT", details:[{"@type":"type.googleapis.com/google.rpc.ErrorInfo", reason:"API_KEY_INVALID", domain, metadata}]}}`. Reuse the pattern (parse, then an allowlist, otherwise `"other"`), not the function.

**F4. The prompt and schema are Claude-shaped.**
- `tagging.js:16` says "by calling the tag_item tool once".
- `buildTagSchema()` (`tagging.js:30-61`) is JSON Schema: `type: ["string","null"]`, `null` inside `enum`, `additionalProperties:false` and `maxLength`. Gemini `responseSchema` (OpenAPI 3.0 subset) rejects or ignores parts of this. It uses an uppercase `type` (`OBJECT`/`ARRAY`/`STRING`) and `nullable: true`, and string enums must not contain `null`.

**F5. `readCapped` (64 KB cap) is private to `claude.js:33-61`.** Gemini needs the same function.

**F6. Size limits.** The image cap is `MAX_BYTES = 2 MB` (`server/photos.js:17`), about 2.7 MB as base64. Gemini's inline request limit is about 20 MB in total; Claude's is about 5 MB per image. Our cap is well under both, so nothing changes. JPEG only, as now (`tagPhoto.js:36,53`).

**F7. Settings that need no change.**
- Key format: Gemini keys are `AIza…`, 39 printable ASCII characters, which passes `validateApiKeyFormat` (20–256). The 4-character hint is fine.
- AAD already includes the provider (D33).
- Limiter kinds `test`/`tag`, the per-user limits and the owner lane (D38, `rateLimit.js:209-256`) do not depend on the provider. Gemini shares the same `tag` budget and in-flight slots. That is right; do not add per-provider buckets.

## Recommendations

**Rec 1. Model ids (AC1).** The ids must be confirmed by Ming against Google's current models page (ai.google.dev/gemini-api/docs/models), with the URL cited in `impl-log.md`. Do not take them from me or from memory. This follows the T-009 plan rule (`T-009/plan.md:233`): stable (non-preview), image-input models only, with the cheapest stable flash-class model as the default.
- Candidates I know of, possibly stale by now: `gemini-2.5-flash` (default), `gemini-2.5-pro`, `gemini-2.5-flash-lite`. Newer Gemini 3 ids may exist but are likely preview.
- Because of the plan-approval gate, put this to Ming as a blocking question: he supplies or approves the list.
- Ids must match `MODEL_ID_PATTERN` (no `models/` prefix, no `:`).
- Edit `catalog.ts` and `catalog.js` together; the parity test enforces it.

**Rec 2. New `server/ai/gemini.js`: a pure adapter in the same shape as `claude.js`** (injected `fetch`; no store, KEK or logging).
- `GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/"`, pinned.
- **Key check:** `checkGeminiKey({fetch,key,model,timeoutMs=10_000})` calls `GET GEMINI_BASE + encodeURIComponent(model)`.
  - Headers: exactly `{"x-goog-api-key": key}`.
  - `redirect:"error"` and `AbortSignal.timeout`.
  - On non-2xx, read the error body capped at about 8 KB, only for the allowlisted reason. Cancel the body in `finally`.
- **Tagging:** `tagPhotoWithGemini({fetch,key,model,image,signal,timeoutMs=45_000})` calls `POST GEMINI_BASE + encodeURIComponent(model) + ":generateContent"`.
  - Headers: `x-goog-api-key` and `content-type: application/json`.
  - Signal: `AbortSignal.any([timeout, caller])`, as in `claude.js:109`.
- **Request body:**
  ```
  { contents:[{ role:"user", parts:[
      { inline_data:{ mime_type:"image/jpeg", data:<base64> } },
      { text: <instruction> } ] }],
    generationConfig:{ responseMimeType:"application/json", responseSchema: buildGeminiSchema(),
                       maxOutputTokens: <see Q3>, temperature: 0 } }
  ```
  REST accepts both snake_case and camelCase; pick one (the ticket says `inline_data`) and pin it in a test.
- **`buildGeminiSchema()`:** derive it from `buildTagSchema()` with a small translator in `gemini.js` (not a second hand-written schema), so the enums stay single-source.
  - Uppercase the types.
  - Turn `["string","null"]` into `nullable:true`, and remove `null` from the category enum (use `nullable:true`).
  - Drop `additionalProperties`; keep `required`; keep `maxItems`.
  - Drop `maxLength` unless the docs confirm it is supported. The server re-validates anyway (R4).
  - Optional: `propertyOrdering`. Alternative: the newer `responseJsonSchema` field could take `buildTagSchema()` as is, but I cannot confirm it is GA. Default to `responseSchema` (the ticket says so).
- **Instruction (F4):** split `TAG_INSTRUCTION` into a neutral field list plus a per-provider first line. Claude keeps "calling the tag_item tool once"; Gemini gets "Return one JSON object with these fields". Keep the exported `TAG_INSTRUCTION` byte-identical for Claude so `claude.test.ts:153` stays green, e.g. export `TAG_FIELDS` and build `TAG_INSTRUCTION` from it.
- **Response handling** (read with the shared `readCapped`, 64 KB):
  - Require `candidates[0]` with `finishReason === "STOP"`.
  - Take its `content.parts` that have a string `text` and are not `thought:true`, concatenate them, then `JSON.parse`.
  - It must be a plain object; return `{ok:true, input}` and leave the rest to `parseTagSuggestion`.
  - Map these to `provider_bad_response`: no candidates, `promptFeedback.blockReason`, `finishReason` ∈ {`SAFETY`, `RECITATION`, `PROHIBITED_CONTENT`, `BLOCKLIST`, `SPII`, `MAX_TOKENS`, `OTHER`, …}, or text that is not JSON.
  - Never return or log the text or the reason.
- **Shared reader (F5):** move `readCapped` into a small shared module (e.g. `server/ai/readCapped.js`, taking `maxBytes`) and import it from both adapters. The change to `claude.js` is mechanical. The trade-off is touching `claude.js` versus a 20-line duplicate that could drift; I prefer extracting it.

**Rec 3. `mapGeminiError(status, reason)` plus `geminiReasonOf(text)` in `providerErrors.js`** (update the header comment at line 2). `geminiReasonOf` parses, picks the first `details[]` entry whose `@type` ends in `google.rpc.ErrorInfo`, and returns `reason` if it is in an allowlist, else `"other"`. Ignore `message`.

| Provider answer | Our code (HTTP) |
|---|---|
| 400 + `API_KEY_INVALID` (bad or expired key) | `invalid_key` (422) |
| 401 `UNAUTHENTICATED` | `invalid_key` (422) |
| 403 `PERMISSION_DENIED`, or reasons `API_KEY_SERVICE_BLOCKED` / `SERVICE_DISABLED` / `API_KEY_IP_ADDRESS_BLOCKED` / `API_KEY_HTTP_REFERRER_BLOCKED` | `key_forbidden` (422) |
| 400 `FAILED_PRECONDITION` (e.g. region or free tier unavailable) | `key_forbidden` (422); confirm with Ming |
| 404 `NOT_FOUND` | `model_unavailable` (422) |
| 429 `RESOURCE_EXHAUSTED` | `provider_rate_limited` (429) |
| other 400 `INVALID_ARGUMENT` (our request or schema was rejected) | `provider_unavailable` (502); `provider_bad_response` is the alternative, pick one and test it |
| 5xx (500, 503, 504) and any other status | `provider_unavailable` (502) |
| Redirect (`redirect:"error"` throws), network error, timeout, caller abort | `provider_unavailable` |
| 200 but blocked, empty, `MAX_TOKENS` or not JSON | `provider_bad_response` (502) |

- The ticket's phrase "invalid key is 400 with reason `API_KEY_INVALID`" describes Google's answer. Our response stays `invalid_key` 422, the same code Claude uses, so the UI copy is shared. Make sure the plan says this.
- No new error codes, so `errors.ts`, `catalog.js` and the parity test stay as they are.
- The reason is used for mapping only. The route logs stay fixed-field (`{event, id, code, ms}`), same as now.

**Rec 4. `/test` uses `models.get`** (`GET v1beta/models/{model}`). It spends no tokens, matches Claude's `models.retrieve`, checks both the key (`API_KEY_INVALID`) and the model (404), and needs no image.
- Limitation: it does not prove there is generation quota for that model (e.g. a free-tier Pro quota of 0). Same as on the Claude path; accept it.
- `countTokens` or a 1-token `generateContent` would catch quota but costs a call or request quota. Not recommended.

**Rec 5. Routes.**
- `loadSettingsKey` (`routes.js:48`): drop `provider !== "claude"` and type the result as `AiProvider`. Provider and model are still checked against the catalog before `openStoredKey`.
- `routes.js:84`: `const CHECKERS = { claude: checkClaudeKey, gemini: checkGeminiKey }`.
- `tagPhoto.js:12`: add `gemini: tagPhotoWithGemini`. Both adapters return the same `{ok,input}|{ok:false,code}` union.

**Rec 6. Sentinel and adapter tests (AC2, AC3), in a new `server/ai/gemini.test.ts` mirroring `claude.test.ts`.**
- Fake `fetch` is called exactly once. The URL is exactly `GEMINI_BASE + model` (or `+ ":generateContent"`), with no `?`, no `key=` and no sentinel in it.
- Headers are exactly `{x-goog-api-key, content-type}`, with no `x-api-key` and no `authorization`. Also assert that the Claude adapter never sends `x-goog-api-key`.
- `redirect === "error"`; the signal is present.
- The JSON body does not contain the sentinel; `inline_data.data` base64-decodes to the uploaded bytes; `responseSchema` enums equal `CATEGORIES`, `COLOR_IDS` and `SEASONS`; there is no `additionalProperties` and no `null` inside any `enum`.
- Success returns the raw object.
- These map to `provider_bad_response`: `MAX_TOKENS`, `SAFETY`, `blockReason`, empty candidates, `thought`-only parts, malformed JSON text, a body over 64 KB (cancelled, not buffered).
- Status table: 400 `API_KEY_INVALID`, 400 other, 401, 403, 404, 429, 500, 503, plus an error body over the cap and a non-JSON error body.
- Failures that map to `provider_unavailable`: timeout, a network error whose message is the sentinel, caller abort, redirect.
- Route level (`routes.test.ts`, `tagPhoto.test.ts`): a Gemini row goes through `/test` and `/tag-photo`. A 400 body that echoes the sentinel in `message`, and a fetch rejection carrying the sentinel, never reach the response body, headers or log entries.
- `providerErrors.test.ts`: the mapping table plus `geminiReasonOf` (allowlisted, `"other"`, non-JSON, wrong `@type`).

**Rec 7. Existing tests that break and must change** (do not delete the intent, re-point it):
- `routes.test.ts:196` uses `gemini-2.5-pro` as the *invalid* example. Switch it to an id that is not in the list, e.g. `gemini-x`. Lines 245, 451 and 606 also assume Gemini is rejected; change them to "unlisted Gemini model → `invalid_model`", and add a Gemini happy path.
- `tagPhoto.test.ts:163`: same.
- `catalog.test.ts:21-23` (Gemini empty) becomes "≥1 model, exactly one default, ids match the pattern".
- `form.test.ts:27,32,73-74`.
- `AiSettingsModal.test.tsx:65-68` (option disabled) becomes enabled, with the new label.
- Check that `isolation.db.test.ts:367` still passes; it uses a Claude-shaped fake.

**Smallest file set:**
- New: `server/ai/gemini.js` and `server/ai/gemini.test.ts`, plus the small shared `readCapped` module.
- Edited: `server/ai/claude.js` (import `readCapped` only), `server/ai/providerErrors.js` (+test), `server/ai/tagging.js` (instruction split only), `server/ai/catalog.js`, `server/ai/routes.js`, `server/ai/tagPhoto.js`, `src/shared/ai/catalog.ts` (+`catalog.test.ts`), `src/features/settings/copy.ts`, and the tests listed in Rec 7.
- No migration, no `src/data` change, local mode untouched (R1).

## Risks
- **API drift taken on trust:** the endpoint version (`v1beta`), schema dialect, `thought` parts and the error body shape all come from memory (mine and T-009's). Mitigations: fake-fetch tests pin our assumptions, and an optional Ming real-key smoke check (an M-item, like the Claude one) verifies them once.
- **Thinking models:** Gemini 2.5/3 models spend thinking tokens out of `maxOutputTokens`. 1024 can end in `MAX_TOKENS` with empty text, which becomes `provider_bad_response` and a confused user. See Q3.
- **Cost:** a Pro-class default would be costly on the user's key. Default to flash-class; there are no retries.
- **Privacy:** photos go to Google under the user's key (D21 intent). Under the free tier, Google may use inputs to improve its products; worth a line in Ming's decision (Q4).
- **Prompt injection via text in the image:** bounded as for Claude (R4 sanitizer, enums, caps); `systemInstruction` is optional.
- **Hotspots shared with in-flight T-019.x work:** `routes.js`, `tagPhoto.js`, `catalog.*`.

## Open questions (for Ming at plan approval)
1. The exact Gemini model ids and the default, from Google's current models page. Blocking: no guessed ids ship.
2. Mapping for 400 `FAILED_PRECONDITION` (region or free tier): `key_forbidden` (recommended), or `provider_unavailable`? Mapping for other 400s: `provider_unavailable` or `provider_bad_response`?
3. Thinking budget: set `maxOutputTokens` around 2048 and disable or minimise thinking per model (`thinkingConfig`; the parameter differs between 2.5 and 3), or keep 1024 and accept occasional `MAX_TOKENS`? I recommend listing only models where thinking can be bounded, with a per-model config in the adapter.
4. Is a disclosure needed that Gemini free-tier data may be used by Google? It would be copy only in F-702/Settings, likely a follow-up.
5. OK to extract `readCapped` from `claude.js` into a shared module (touches `claude.js`), versus duplicating it?
