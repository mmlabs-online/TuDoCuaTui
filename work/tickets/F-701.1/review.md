## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` → exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- format:check: `pnpm format:check` → exit 0 (262 files, "Finished in 28ms").
- test: `pnpm test` → exit 0. Test Files 101 passed | 10 skipped (111); Tests 1262 passed | 205 skipped (1467). The skipped tests are the DB-backed `*.db.test.ts` suites (no Postgres in this session). This matches the impl-log exactly.
- build: `pnpm build` → exit 0 (`✓ built in 358ms`).

No network calls to Google were made; every provider call in the tests goes through a fake fetch.

### Scope (R7)
`git diff --stat origin/main...HEAD`: every code, test and docs file is in the plan's *Files to create / modify* table.
`work/tickets/F-701.1/{ticket,plan,consult-software-architect,impl-log}.md` are workflow files. `work/ming-todo.md` (M-27)
is not in the diff. That is deliberate: the orchestrator adds it. It is not a gap in the implementation.
These files are unchanged: `server/ai/claude.test.ts`, `server/ai/parity.test.ts`, `server/isolation.db.test.ts`,
`src/data/**`, `vite.config.ts`, `AGENTS.md` and `.figma/`. The only changes under `src/` are the five files AC 6 allows.

### Acceptance criteria
- [x] **1. Gemini models are listed and accepted by `/test` and `/api/ai/tag-photo`.** Evidence:
  - The catalogs match: `server/ai/catalog.js:18-22` and `src/shared/ai/catalog.ts:19-23`. They list exactly Ming's confirmed ids (ticket Notes, 2026-11-17), with `gemini-2.5-flash` as the default.
  - `catalog.test.ts › gemini has exactly the confirmed models, one default` passes, and `parity.test.ts` (unchanged) passes.
  - `routes.test.ts`: `› accepts a Gemini model`, `› calls models.get on the pinned host -> 200 {ok:true}` and `› valid Gemini row -> the key`.
  - `tagPhoto.test.ts › gemini: success returns sanitized suggestion`: `bag` becomes null, `purple` is dropped, the duplicate `winter` is removed and an over-long name becomes null. This goes through the same `parseTagSuggestion` path as Claude.
  - `gemini.test.ts:226 › thinking config exists for every catalog id`.
- [x] **2. Error mapping covers invalid key, permission, model not found, rate limit, server errors and timeout.**
  - `providerErrors.js:55-73` matches plan A2:
    - 400: `API_KEY_INVALID` → `invalid_key`; `FAILED_PRECONDITION` and the 4 blocked/disabled reasons → `key_forbidden`; any other 400 → `provider_unavailable`.
    - 401 → `invalid_key`; 403 → `key_forbidden`; 404 → `model_unavailable`; 429 → `provider_rate_limited`; default → `provider_unavailable`.
  - `geminiReasonOf` (`providerErrors.js:31-50`):
    - It takes the reason only from the first `google.rpc.ErrorInfo` detail, and only if that reason is allowlisted.
    - Without such a detail it falls back to the rpc `status` `FAILED_PRECONDITION`. Anything else gives `"other"`.
    - It never reads `message`, and it never throws on null, a string, an array or a malformed `details`.
  - Tests:
    - `providerErrors.test.ts › geminiReasonOf`: 15 cases, including a `message` that contains `API_KEY_INVALID` → `"other"`.
    - `› mapGeminiError`: 19 rows; every result is a key of `AI_ERROR_STATUS`.
    - Adapter level: `gemini.test.ts:126,154,346,360`. Timeouts use `timeoutMs: 20` with a fetch that hangs. There are also tests for a network error, a caller abort (the fetch's signal is checked as aborted) and a redirect rejection. All of these map to `provider_unavailable`.
    - Route level: `routes.test.ts › Gemini status table` and `tagPhoto.test.ts › gemini: provider errors map to status + code`. The latter includes `MAX_TOKENS` → 502 `provider_bad_response`.
- [x] **3. Sentinel: the key goes only in `x-goog-api-key` to the pinned host, and never appears in a URL, log or response.**
  - Code:
    - `gemini.js:9` pins `GEMINI_BASE`.
    - The headers are exactly `{ "x-goog-api-key": key }` at `:72`, plus `content-type` at `:97`.
    - `redirect: "error"` is at `:73` and `:116`. The timeouts are at `:74` and `:117` (the second also takes the caller's signal through `AbortSignal.any`).
    - Error bodies are capped at 8 KB (`:11`, `:59`); success bodies at 64 KB (`:10`, `:120`).
    - `finally` cancels the body. No `?key=`, no logging, and no `console`/`log(` in `gemini.js`, `readCapped.js` or `providerErrors.js` (grep).
  - Adapter tests (`gemini.test.ts:98`, `:249`):
    - URL: the tests assert the exact URL, `new URL(url).search === ""`, no `key=` and no sentinel in it.
    - Headers: deep equality on the headers, so an extra `x-api-key` or `authorization` header would fail.
    - Request: the tests assert `redirect === "error"`, that the signal is an `AbortSignal`, and that the sentinel is absent from the stringified `[url, init-without-headers]` and from the request body.
    - Results: on error paths (a 400 body that echoes the sentinel in `message`, a `TypeError` that carries the sentinel, and non-JSON text that contains the sentinel), `JSON.stringify(result)` does not contain the sentinel.
  - Route tests: `routes.test.ts › /test Gemini: sentinel never leaves the server` and `tagPhoto.test.ts › gemini: sentinel never leaves the server`.
    - Each runs three cases: success, a 400 that echoes the sentinel, and a fetch that rejects with the sentinel.
    - Each asserts that the response text, the response headers and `JSON.stringify(logs)` lack the sentinel.
    - Each asserts exactly one fetch per case, with the sentinel only in `headers["x-goog-api-key"]`.
    - The tagPhoto test also checks that the base64 of the image never appears in the response or the logs, and that the `ai_tag` log keys are exactly `{code,event,id,ms}`.
  - `tagPhoto.test.ts › provider dispatch`: a Claude row never sends `x-goog-api-key`, and a Gemini row never sends `x-api-key`. These sentinel assertions check exactly what AC 3 says.
- [x] **4. The Gemini option in Settings is enabled, and all checks pass.**
  - `copy.ts:9` now reads `"Gemini"`. `AiSettingsModal.tsx` is unchanged; the option is enabled because the catalog is no longer empty.
  - `AiSettingsModal.test.tsx › lists Gemini as enabled; choosing it selects the default Gemini model`: the option is not disabled, selecting it picks `gemini-2.5-flash`, and Save stays disabled until a key is typed.
  - The invalid-combination half is kept as its own test.
  - The re-pointed `form.test.ts` cases pass. All four checks are green (above).
- [x] **5. The Claude path is unchanged.**
  - `server/ai/claude.test.ts` has no diff against `origin/main` and passes, including `tag: body over 64 KB is cancelled, not buffered`.
  - `TAG_INSTRUCTION` was verified byte-identical against `origin/main` by importing both versions of `tagging.js`: `identical: true`, 943 chars. `buildTagSchema()` output is also identical.
  - `tagging.test.ts › TAG_INSTRUCTION is byte-identical to the F-701 text` pins the literal.
  - The `claude.js` change is mechanical: it imports `readCapped`, keeps `MAX_RESPONSE_BYTES` and changes one call site.
  - `readCapped.js` is the old function word for word, with the cap moved to a parameter. `readCapped.test.ts` covers it.
- [x] **6. Local mode is unchanged (R1).** `git diff --stat origin/main...HEAD -- src/` lists exactly the five allowed files, and `src/data/**` is untouched.

### Additional verification
- **finishReason, blocked responses and MAX_TOKENS.** `gemini.js:121-128` requires `candidates[0].finishReason === "STOP"` and a non-empty joined text from the non-thought parts. `gemini.test.ts:302` covers:
  - `MAX_TOKENS`, both with valid JSON and with empty parts;
  - `SAFETY`, `RECITATION`, `PROHIBITED_CONTENT` and `OTHER`;
  - a missing `finishReason`, and `promptFeedback.blockReason` with no candidates;
  - `candidates: []`, `{}`, and a response with only thought parts or only inline parts;
  - text that is not JSON, and JSON that is an array, a string or `null`;
  - a non-JSON body, `null` JSON, and a body over 64 KB (cancelled after fewer than 10 pulls).

  All of these give `provider_bad_response`. The success test confirms that split parts are joined and that a leading `thought:true` part is skipped.
- **The responseSchema translator keeps the enums single-source.** `buildGeminiSchema()` (`gemini.js:30-55`) walks `buildTagSchema()`; there is no second hand-written schema.
  - `gemini.test.ts:175` checks that the enums deep-equal `CATEGORIES`, `COLOR_IDS` and `SEASONS`, with no dead categories.
  - A recursive walk asserts there is no `additionalProperties`, no `maxLength`, no lowercase or array `type`, and no `null` inside any `enum`.
  - The body-shape test pins snake_case `inline_data`/`mime_type`. It also pins `generationConfig`: `responseMimeType`, `responseSchema`, `maxOutputTokens: 2048`, `temperature: 0` and `thinkingConfig`, with no `systemInstruction` and no `tools`.
- **Re-pointed tests keep their intent.** Each "Gemini is rejected" case now uses the unlisted `gemini-x`:
  - `routes.test.ts`: PUT validation, `/test` `invalid_model`, and `loadSettingsKey`.
  - `tagPhoto.test.ts:163`.

  They still assert `invalid_model` with no fetch and no decryption, and the Claude half of each case is kept. The new happy paths were added next to them, so they replace nothing.
- **Decrypt order.** The provider and model are still checked against the catalog before `openStoredKey` (`routes.js:49`).
- **Type safety.** `TAGGERS` is typed `Record<AiProvider, …>` (`tagPhoto.js:13`), so leaving out a provider fails typecheck.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no `WardrobeRepo` change, and AI remains API-mode only (D30).
- R2: no schema change.
- R3: the key is used only on the server, only in `x-goog-api-key`, and no `VITE_*` variable is involved.
- R4/D27/D34: the image is held in memory for one request, sent only to the pinned Gemini host, and never logged.
- R5: not applicable.
- R6: the single label change is in `copy.ts`.
- R8: every new pure function has unit tests.
- R9: the change is one label in the existing select.
- R10: untouched.

### Nits (do not block)
- The route-level `routes.test.ts › Gemini status table` does not include the 400 `FAILED_PRECONDITION` or other-400 rows. They are covered at the adapter level (`gemini.test.ts` `ERROR_CASES`) and in `providerErrors.test.ts`.
- `src/shared/ai/catalog.ts:12`: the one-line comment is longer than the wrapping used elsewhere, but oxfmt accepts it.

### Ming verification after merge
- **M-27 (optional):** a real-key smoke test with a Gemini key.
  - Press "Kiểm tra" for each listed model (`gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`).
  - Run one `/api/ai/tag-photo` call and expect a `suggestion`.
  - Press "Kiểm tra" once with a broken key and expect the `invalid_key` message.

  This is the only check against the real API. Taken on trust until then: `v1beta`, the `responseSchema` dialect, the `thinkingBudget` values (0/0/128), `finishReason` and the error-body shape (A11). The orchestrator adds M-27 to `work/ming-todo.md`.
- **A12:** if the deployment repo restricts egress, `generativelanguage.googleapis.com` must be allowed there.

### Follow-ups (out of scope)
- A4: a disclosure that Google may use Gemini free-tier data, in F-702 / Settings copy. The F-702 line should name the saved provider.
- A14: optional `propertyOrdering` in the schema; a quota check based on `countTokens` (`models.get` does not check generation quota).
