Status: READY

# Plan — F-704.3: AI-ranked outfit suggestions (slice 1 of 2: server)

> **Split.** Server and client together come to roughly 1,400 changed lines (about 650 product + 750 tests),
> well over the ~400-line guide. This plan covers **only the server slice** (`server/**`, High path, the part
> that needs plan approval). The client slice (toggle, fallback, `createHttpAiOutfits`) becomes a new ticket
> **F-704.4**, outlined under `## Split proposal`; the orchestrator creates it after this plan is approved.

## Scope summary
- `docs/feature-list.md` F-704: "'Hôm nay mặc gì?': suggests 3 outfits from active items using season, weather
  (optional) and stale items first."
- F-701 (same epic, reused here): "Calls … LLM server-side; … strict JSON validation"; "Per-user rate limit
  (e.g. 100 calls/day)"; "AC: returns valid ids only; returns a clear error code on rate limit".
- `work/decisions.md`:
  - D21/D30/D33: each user brings their own key; it is stored encrypted on the server, never returned to the
    browser, and the AI rate limits are per user.
  - D38: the owner `sub` "is exempt from the global AI ceilings and has its own upload/tag slots; per-user limits
    still apply".
  - D44: API only, no local mode.
- Ticket F-704.3, Scope: "A server endpoint (e.g. `POST /api/ai/suggest-outfits`) that sends a compact, text-only
  list of candidate items … to the user's configured provider and returns up to 3 outfits as item-id lists plus a
  short Vietnamese reason each. Strict validation: only ids from the sent candidates, valid combinations by the
  F-704.1 rules; anything else is dropped. Counts against the per-user AI limit".
- Ming's answers (2026-11-18), which override the ticket body:
  - Send attributes **and item names**: category, colours, seasons, material, wear count, last worn, name.
    Never photos.
  - **Separate rate limit**: a new limiter kind `suggest`, about 30/day per user, not the 100/day `tag` budget.
- Out of scope (ticket): photos to the AI, saving outfits (F-801–F-803), weather fetching (F-704.2).
  The modal toggle and fallback UI go to F-704.4.

## Acceptance criteria → verification
Slice-1 subset of the ticket ACs. AC "modal shows AI-picked outfits", "fallback with a Vietnamese note" and
"390px and dark mode" move to F-704.4.

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `POST /api/ai/suggest-outfits` returns at most 3 outfits. Each holds only ids of the **caller's own active** items that were in `candidateIds`. Foreign, unknown, non-active and bikini/other ids are never sent to the provider and never returned, and they are dropped the same way (no existence oracle). | `suggestOutfits.test.ts` › "candidate query is scoped to user, ids, active, allowed categories"; "ids the DB does not return never reach the prompt"; "an alias outside the sent set is dropped". `isolation.db.test.ts` › "suggest-outfits: B sending A's item ids gets {outfits: []} and no provider call; A's stored item is not sent". |
| 2 | Each returned outfit follows the F-704.1 rules: exactly one one-piece (dress, set, ao_dai), **or** one top + one bottom; plus at most one each of shoes, outer and accessory; at most 5 items; no duplicates. Outfits that break a rule are dropped. Duplicate outfits are dropped. The reason is NFC, has no control characters, is non-empty and ≤120 code points, or the outfit is dropped. If nothing survives: `502 provider_bad_response`. | `outfitSuggest.test.ts` › the `validateSuggestions` cases listed under Tests. |
| 3 | Fewer than 2 usable candidates → `200 {outfits: []}`, with no provider call, no settings decryption and no quota used. | `suggestOutfits.test.ts` › "fewer than 2 usable candidates → 200 [] without quota or fetch". |
| 4 | Per-user limit: kind `suggest`, 30 per 24 h per user, plus a global ceiling of 600 per 24 h that the owner skips. The 31st call answers `429 rate_limited`. The `tag` budget is untouched. | `rateLimit.test.ts` › existing `it.each` extended with `"suggest"`; `suggestOutfits.test.ts` › "31st call in 24 h → 429 rate_limited; tag-photo still allowed". |
| 5 | In flight: 1 per user, 2 in total, owner exempt. These are separate from the tag slots. A busy slot answers `503 ai_busy` + `Retry-After: 5` and uses no quota. | `suggestOutfits.test.ts` › "second concurrent call → 503 ai_busy, no quota used"; "tag-photo in flight does not block suggest". |
| 6 | No photos are sent. The provider request is text only: no `image` or `inline_data` part. The prompt holds no UUIDs, only aliases `i1…iN`. Notes, tags, brand, size, price and location are not sent. The key goes only in the provider header and never into a response or log. | `claude.test.ts` / `gemini.test.ts` › "suggest: text-only body, key only in header"; `outfitSuggest.test.ts` › "prompt contains aliases, not UUIDs, and no notes/brand/tags"; `suggestOutfits.test.ts` › "key, names and reason never appear in logs". |
| 7 | Request validation: the body is exactly `{candidateIds, season, weather, avoidIds?}`, at most 8 KB, `application/json`, read with the AI body timeouts. Anything else answers 400 `bad_request` (or 413/415/400 `invalid_json`/408 from `readJson`), sent before any quota is used. | `outfitSuggest.test.ts` › `parseSuggestBody` table; `suggestOutfits.test.ts` › "bad body → 400 bad_request, no quota". |
| 8 | Errors reuse the existing AI codes (`server_misconfigured`, `db_unavailable`, `not_configured`, `invalid_model`, `key_unreadable`, `invalid_key`, `key_forbidden`, `model_unavailable`, `provider_rate_limited`, `provider_unavailable`, `provider_bad_response`, `rate_limited`, `ai_busy`). No new code is added, so `parity.test.ts` is unchanged. | `suggestOutfits.test.ts` › error-mapping table; `parity.test.ts` passes untouched. |
| 9 | The adapter refactor changes no tagging behaviour. Every existing `claude.test.ts`, `gemini.test.ts` and `tagPhoto.test.ts` case passes with no edits to existing assertions. | `git diff` shows only additions in those three test files; `pnpm test` green. |
| 10 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
None for this slice: no UI calls the endpoint yet. Ming's manual test with real Claude and Gemini keys
(ticket Test plan) moves to F-704.4, after the toggle ships. Optional: after a release, with a dev token, call
`POST /api/ai/suggest-outfits` with a few of his own item ids and check that the reason reads as natural Vietnamese
for both providers. This is the only check against the real provider APIs (Gemini schema dialect, Claude tool use
without an image).

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `server/ai/claude.js` | Extract private `claudeToolCall({fetch,key,model,content,tool,signal,timeoutMs})` with the POST, headers, cap, abort and checks from `tagPhotoWithClaude`. `tagPhotoWithClaude` becomes a thin wrapper with the same output. Add `suggestWithClaude({fetch,key,model,prompt,schema,signal,timeoutMs=30_000})` (tool `suggest_outfits`, text content only, `max_tokens` 1024). | Generic adapter (consult rec. 4) | **Yes** |
| `server/ai/gemini.js` | Extract `toGeminiSchema(schema)` (the current walker, taking any schema). `buildGeminiSchema()` = `toGeminiSchema(buildTagSchema())`. Extract private `geminiJsonCall({…, parts, schema, temperature?})`. `tagPhotoWithGemini` becomes a wrapper (still `temperature: 0`). Add `suggestWithGemini(…)` (text part only, 30 s, no `temperature` so the model default applies, same `GEMINI_THINKING`). | Same | **Yes** |
| `server/ai/tagging.js` | Export the existing private `text(v, max)` as `cleanText`, with no behaviour change. | The validator reuses the same text rule (consult rec. 5) | **Yes** |
| `server/ai/outfitSuggest.js` (new) | Pure module: `SUGGEST_LIMITS`, `SUGGEST_CATEGORIES`, `parseSuggestBody`, `buildSuggestPrompt(candidates, {season, weather, avoidIds, today})` → `{prompt, aliases}`, `buildSuggestSchema(aliases)`, `validateSuggestions(raw, aliases, candidatesById)`. | Body checks, prompt and strict validator as plain, unit-tested functions (R8, rule 6) | **Yes** |
| `server/ai/outfitSuggest.test.ts` (new) | Unit tests (see Tests). | R8 | **Yes** |
| `server/ai/suggestOutfits.js` (new) | Route handler `handleSuggestOutfits` in the `tagPhoto.js` style: slot, then body, then candidates, then limiter, then settings key, then adapter, then validator. Fixed-field logs. | The endpoint | **Yes** |
| `server/ai/suggestOutfits.test.ts` (new) | HTTP tests with the fake pool, fake store and fake fetch (pattern of `tagPhoto.test.ts`). | R8, AC 1, 3–8 | **Yes** |
| `server/items.js` | Add `loadSuggestCandidates(pool, userId, ids)`: a read-only `withUser` select on `items_with_stats` with `user_id = $1 and id = any($2::uuid[]) and status = 'active' and category = any($3)`. | All SQL lives here; scoping guard (`scoping.test.ts`) | **Yes** |
| `server/api.js` | Match `/api/ai/suggest-outfits` (POST). Dispatch to `handleSuggestOutfits` with `{ai, pool, userId, id, log, now}`. | Routing | **Yes** |
| `server/app.js` | `aiContext.suggestSlots = createInFlight({perUser: 1, total: 2, exempt: ownerSub})`. | Separate in-flight slots (consult rec. 6) | **Yes** |
| `server/ai/rateLimit.js` | `LIMITS.suggest = {max: 30, windowMs: 24h}`; `GLOBAL_LIMITS.suggest = {max: 600, windowMs: 24h}`. | Ming: a separate `suggest` kind | **Yes** |
| `server/ai/routes.js` | JSDoc only: `AiContext` gains `suggestSlots` and the limiter kind `"suggest"`. `loadSettingsKey`'s parameter narrows to `{kek, store}`, so the hand-built context in `routes.test.ts` still typechecks. | Types | **Yes** |
| `server/ai/claude.test.ts` | Add `suggestWithClaude` cases. Existing cases untouched. | AC 6, 9 | **Yes** |
| `server/ai/gemini.test.ts` | Add `suggestWithGemini` and `toGeminiSchema(buildSuggestSchema(...))` cases. Existing cases untouched. | AC 6, 9 | **Yes** |
| `server/ai/rateLimit.test.ts` | Add `"suggest"` to the `it.each` kind lists and to `KINDS` in "owner lane". | AC 4 | **Yes** |
| `server/isolation.db.test.ts` | One case in the existing `ai_settings` describe (real Postgres, skipped without a DB). | AC 1 against real RLS and scoping | **Yes** |
| `server/README.md` | One paragraph for the endpoint, in the style of the tag-photo paragraph: body, limits, codes, log fields, what is sent. | Docs for Ming | **Yes** |

Changed lines: about 430 product (adapters ~110, `outfitSuggest.js` ~170, handler ~100, wiring ~50) plus about 600 tests.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `outfitSuggest.test.ts` › parseSuggestBody: accepts `{candidateIds:[uuid…], season:"winter", weather:{cold,hot,rain}}` with and without `avoidIds`; lowercases and dedupes ids | AC 7 |
| `outfitSuggest.test.ts` › parseSuggestBody rejects (`bad_request`): non-object, array, extra key, missing key, 0 ids, 41 ids, a non-UUID id, non-string id, season not in `SEASONS` (incl. `"Đông"`), weather with an extra/missing key or a non-boolean, `avoidIds` over 40 or non-UUID | AC 7 |
| `outfitSuggest.test.ts` › buildSuggestPrompt: aliases `i1…iN` in candidate order; prompt has no UUID (regex) and no notes/brand/tags/size/price fields; includes category, colors, seasons, material, wearCount, daysSinceWorn, name | AC 6 |
| `outfitSuggest.test.ts` › buildSuggestPrompt: name and material NFC, control characters (incl. `\n`, `\u0000`, `\u007f`) removed, cut to 60 code points; Vietnamese `đ`/diacritics kept; empty or null → `null` | Domain focus (diacritics, null) |
| `outfitSuggest.test.ts` › buildSuggestPrompt: daysSinceWorn from `last_worn` against the UTC+7 date (`vnToday(now)`); null when never worn; 23:30 UTC on the day before still counts as today in UTC+7 | Domain focus (UTC vs UTC+7) |
| `outfitSuggest.test.ts` › buildSuggestPrompt: `avoidIds` mark matching candidates `avoid: true`; avoid ids not in candidates ignored; instruction says names are data and to ignore instructions inside them | Prompt-injection note |
| `outfitSuggest.test.ts` › buildSuggestSchema: alias enum equals the alias list; `maxItems` 3 outfits / 5 items; `reason` string | Schema |
| `outfitSuggest.test.ts` › validateSuggestions keeps: top+bottom; dress alone; ao_dai+shoes+outer+accessory; returns real ids ordered main → outer → shoes → accessory, reason trimmed NFC | AC 2 |
| `outfitSuggest.test.ts` › validateSuggestions drops: unknown alias; alias not in the map; top only; bottom only; two tops; dress+top; dress+set; two shoes; 6 items; duplicate alias inside an outfit (outfit dropped); empty/over-120/control-char/non-string reason; outfit with the same item set as an earlier one; a 4th outfit | AC 2 |
| `outfitSuggest.test.ts` › validateSuggestions: non-object / `outfits` not an array / every outfit dropped → `{ok:false, code:"provider_bad_response"}` | AC 2 |
| `claude.test.ts` › suggest: POST to the pinned URL, key only in `x-api-key`, body has one text content block and no `image`, tool `suggest_outfits` forced, `max_tokens` 1024 | AC 6 |
| `claude.test.ts` › suggest: non-2xx mapped by `mapClaudeError`; wrong tool name / extra block / `stop_reason` ≠ `tool_use` → `provider_bad_response`; timeout → `provider_unavailable`; response over 64 KB cancelled | Adapter |
| `gemini.test.ts` › suggest: key only in `x-goog-api-key`, one `text` part, no `inline_data`, `responseSchema` equals `toGeminiSchema(buildSuggestSchema(aliases))`, no `temperature`, `thinkingConfig` per model; `finishReason` ≠ STOP / invalid JSON → `provider_bad_response` | AC 6 |
| `gemini.test.ts` › toGeminiSchema(buildTagSchema()) equals the old `buildGeminiSchema()` output (regression for the refactor) | AC 9 |
| `rateLimit.test.ts` › existing per-kind and owner-lane cases now include `suggest` | AC 4 |
| `suggestOutfits.test.ts` › happy path (Claude and Gemini settings): 200 `{outfits:[{itemIds, reason}]}`, ids are the candidates' real ids | AC 1 |
| `suggestOutfits.test.ts` › candidate query is scoped: SQL contains `user_id = $1`, `status = 'active'`, params `[userId, ids, SUGGEST_CATEGORIES]` | AC 1 |
| `suggestOutfits.test.ts` › ids the DB does not return (foreign/unknown) never reach the prompt; the provider answering with an alias for them is impossible, and an alias outside the sent set is dropped | AC 1 |
| `suggestOutfits.test.ts` › fewer than 2 usable candidates → 200 `{outfits: []}`, 0 fetches, 0 `getSecret` calls, quota unchanged (31 such calls then a real call still passes) | AC 3 |
| `suggestOutfits.test.ts` › 31st call in 24 h → 429 `rate_limited`; `/api/ai/tag-photo` for the same user still 200 | AC 4 |
| `suggestOutfits.test.ts` › second concurrent call (provider fetch held open) → 503 `ai_busy` + `Retry-After: 5`, no quota used; a held tag-photo call does not block suggest; owner passes when two other users hold the total | AC 5 |
| `suggestOutfits.test.ts` › bad body / wrong content type / >8 KB → 400/415/413, no quota used, no fetch | AC 7 |
| `suggestOutfits.test.ts` › error table: no AI → 503 `server_misconfigured`; no pool → 503 `db_unavailable`; no settings → 409 `not_configured`; provider 401 → 422 `invalid_key`; provider 429 → 429 `provider_rate_limited`; all outfits invalid → 502 `provider_bad_response`; DB error → mapped, `requestId` on `internal` | AC 8 |
| `suggestOutfits.test.ts` › logs: one `ai_suggest` entry `{event,id,code,ms}`; the key, item names and the reason never appear in any log entry | AC 6, R3 |
| `suggestOutfits.test.ts` › GET → 405 `Allow: POST`; `Sec-Fetch-Site: cross-site` → 403 | Routing |
| `isolation.db.test.ts` › suggest-outfits: B sending A's item ids → 200 `{outfits: []}`, no provider fetch; A with 2 active + 1 `stored` item → the stored item's name is not in the provider request | AC 1 (real RLS) |

## Approach
1. **Limits and slots.** Add `suggest` to `LIMITS` (30/24 h) and `GLOBAL_LIMITS` (600/24 h). Add `suggestSlots` to
   `aiContext` in `app.js`. Update the `AiContext` JSDoc in `routes.js`, and narrow `loadSettingsKey`'s parameter
   type to `{kek, store}` (JSDoc only).
2. **Adapter refactor (behaviour-neutral first).**
   - `claude.js`: move the fetch/headers/cap/abort/tool-use checks into `claudeToolCall`. `tagPhotoWithClaude`
     passes its image+text content and the tag tool.
   - `gemini.js`: generalise the schema walker into `toGeminiSchema` and the request into `geminiJsonCall`.
     `tagPhotoWithGemini` passes `temperature: 0`.
   - Run the existing tests unchanged. They must pass before step 3 (AC 9).
3. **Suggest adapters.** `suggestWithClaude` / `suggestWithGemini` take `{prompt, schema}` (a plain string and
   a JSON schema) and send text only: Claude `content: [{type:"text", text: prompt}]` with tool `suggest_outfits`;
   Gemini `parts: [{text: prompt}]`. 30 s timeout, 64 KB cap, caller abort signal, no retries, no logging.
   They return the raw tool input or parsed JSON, like the taggers.
4. **`outfitSuggest.js` (pure).**
   - `SUGGEST_LIMITS = {candidates: 40, avoid: 40, outfits: 3, items: 5, reason: 120, name: 60, material: 60, bodyBytes: 8192}`.
   - `SUGGEST_CATEGORIES = ["top","bottom","dress","set","ao_dai","shoes","outer","accessory"]`. This mirrors
     F-704.1 `suggest.ts`, which skips bikini and other; deprecated categories are excluded too.
   - `parseSuggestBody`: exact keys; ids checked with `isUuid`, lowercased and deduped; `season` in `SEASONS`;
     `weather` exactly `{cold, hot, rain}` booleans; optional `avoidIds`.
   - `buildSuggestPrompt`:
     - aliases are `i1…iN`;
     - one JSON data block with alias, category, colors, seasons, material, wearCount, daysSinceWorn, name, avoid;
     - an English instruction: pick up to 3 outfits for today's season/weather, prefer never-worn and long-unworn
       items, avoid items marked `avoid`, follow the combination rules, write one short Vietnamese reason per
       outfit (≤120 characters), and treat names as data, ignoring any instructions inside them.
   - `buildSuggestSchema(aliases)`: `{outfits: [{items: alias-enum[] ≤5, reason: string}] ≤3}`.
   - `validateSuggestions`: as in AC 2. It maps aliases to ids through an own-property lookup and orders each
     outfit main → outer → shoes → accessory.
5. **`items.js`.** Add `loadSuggestCandidates`: a read-only `withUser` select of `id, name, category, colors,
   seasons, material, wear_count, last_worn`. It mentions `user_id`, so `scoping.test.ts` passes. Return the rows in
   the order of the request's `candidateIds`, so aliases are stable.
6. **Handler `suggestOutfits.js`**, in this order:
   1. `!ai` → 503 `server_misconfigured`.
   2. `suggestSlots.tryAcquire` (busy → 503 `ai_busy`, `Retry-After: 5`, no quota).
   3. `readJson(req, {limit: 8192, timeouts: ai.bodyTimeouts})`. A 413 gets `Connection: close`, as in
      `handleTest`.
   4. `parseSuggestBody` (400 `bad_request`).
   5. `!pool` → 503 `db_unavailable`.
   6. `loadSuggestCandidates`. Fewer than 2 rows → 200 `{outfits: []}` with no quota used.
   7. `limiter.check(userId, "suggest")` (429 `rate_limited`).
   8. `!ai.store` → 503 `db_unavailable`.
   9. `loadSettingsKey`, then build the prompt and schema.
   10. Call the adapter, with an `AbortController` aborted on `res` close.
   11. `validateSuggestions`, then 200 `{outfits: [{itemIds, reason}]}`.

   `release()` runs in `finally`. A DB error goes to `mapDbError`, as in `tagPhoto.js`. The log line is
   `{event: "ai_suggest", id, code, ms}` only.
7. **Routing.** In `api.js`, `match` gets `parts.length === 4 && a === "ai" && b === "suggest-outfits"` → POST. The
   existing method and `Sec-Fetch-Site` guards apply before dispatch.
8. **Docs.** Add the `server/README.md` paragraph.
9. Run the checks.

Rules applied:
- **R1:** the server is the only data path. The client slice adds a `src/data/` client.
- **R3:** the key stays in `loadSettingsKey` → adapter header. Nothing new in `VITE_*`.
- **R4:** no photos are sent at all.
- **R5:** `wear_count`/`last_worn` are read from `items_with_stats`, never stored.
- **R7:** client work is deferred to F-704.4.
- **R8:** pure logic is in `outfitSuggest.js` with unit tests.
- **Scoping:** every query goes through `withUser`, with `user_id` in the SQL; RLS is the backstop (D32).

## Specialist input used
`consult-software-architect.md`:
- **Rec. 1 (endpoint and body): adopted.** Plus an optional `avoidIds` (A5) so "Đổi gợi ý" gets different
  outfits.
- **Rec. 2 (trust boundary, reload from the DB scoped to user + active): adopted.** The category filter is added
  in SQL as well.
- **Rec. 3 (aliases, JSON data block, sanitized names, no notes/tags/brand): adopted.** Names are sent per Ming's
  answer.
- **Rec. 4 (generic adapter helpers, tag wrappers unchanged, `suggestWith*` 30 s / 64 KB / 1024 tokens):
  adopted.** Gemini omits `temperature` for variety (A6).
- **Rec. 5 (strict validator in `server/ai/outfitSuggest.js`, empty → `provider_bad_response`): adopted.** Reuses
  `text()` exported as `cleanText`.
- **Rec. 6 (`suggest` 30/24 h, global 600, owner exempt, separate slots): adopted.** Ordering refinement: body and
  candidates are checked before the limiter, so malformed and too-small requests use no quota (A7).
- **Rec. 7 (reuse error codes, no new codes): adopted.**
- **Rec. 8 (client `createHttpAiOutfits`, toggle only when AI ready, fallback): deferred to F-704.4** by the split.
- **Risks: accepted.**
  - Prompt injection through names is limited to the user's own key and output, which is validated aliases plus
    plain text.
  - Cost is bounded by 30/day and the slots.
  - The adapter refactor is guarded by AC 9.

## Assumptions
Items marked **(Ming)** are the consult's open questions. Each takes the consult default; please confirm or change
at plan approval.

- **A1 (Ming).** The global `suggest` ceiling is **600 per 24 h**, with the owner exempt (D38). The per-user limit
  is 30 per 24 h (Ming's answer).
- **A2 (Ming).** **At most 40 candidates** per call. The server rejects more than 40 with 400. In F-704.4 the
  client picks them from the rule pool after the weather step, never-worn first, then longest-unworn.
- **A3 (Ming).** In F-704.4 the AI toggle is **off each time the modal opens**. There is no localStorage, so no
  call ever happens without a tap.
- **A4 (Ming).** The reason is **Vietnamese only, ≤120 characters**. The prompt asks for Vietnamese; the server
  enforces the length and character rules but cannot verify the language.
- **A5.** The optional `avoidIds` (≤40, ignored when not among the candidates) marks the items shown last time.
  Without it, "Đổi gợi ý" with AI on would often return the same set.
- **A6.** Gemini suggestion calls omit `temperature`, and Claude calls send none (the provider default), so
  repeated calls vary. Tagging keeps `temperature: 0`.
- **A7.** Order: slot → body → candidates → limiter → key. Malformed bodies and pools with fewer than 2 usable items
  use no quota. A provider error after the limiter does use quota, as in tag-photo.
- **A8.** Response shape `{outfits: [{itemIds: string[], reason: string}]}`, ids ordered main → outer → shoes →
  accessory. The server does not add a shoes/outer/accessory the AI left out; F-704.4 shows what is returned.
- **A9.** Names and materials are cut to 60 code points in the prompt. A missing name is sent as `null`; the
  category still identifies the item.
- **A10.** Hotspots: no other ticket is `IN_PROGRESS`, `REVIEW` or `DONE`. F-704.4 will touch `src/App.tsx` and
  `src/features/outfits/OutfitsModal.tsx`.
- **A11.** Gate: every file here is under `server/**` (High). The reviewer runs with
  `security-ai-generated-code-auditor` (areas include `security`; the diff touches `server/`).

## Blocking questions
None. A1–A4 are non-blocking defaults listed for Ming's approval at the plan gate.

## Split proposal
- **F-704.3 (this plan): server.** Endpoint, adapters, strict validator, `suggest` limits and slots, server tests,
  README.
- **F-704.4 (new ticket, depends on F-704.3): client.** About 250 product + 300 test lines; not a High path.
  - `src/data/aiOutfits.ts`: `createHttpAiOutfits(fetchFn, base, auth).suggest({candidateIds, season, weather,
    avoidIds}, signal)`. It parses `{outfits}` and maps errors through `AiSettingsError` / `isServerErrorCode`,
    like `aiTagging.ts` (R1). It has unit tests.
  - `src/features/outfits/suggest.ts`: extract a pure `candidatePool(items, {now, weather})`. It returns the
    eligible active items after the season/weather step, capped at 40 (never-worn, then longest-unworn) and
    reuses the existing `inSeason` logic. Add `toAiOutfits(result, items)` to map ids back to `Item`s, dropping
    unknown ones. It has unit tests; existing `suggest.test.ts` cases are unchanged.
  - `OutfitsModal.tsx` + `copy.ts`:
    - The "✨ Gợi ý bằng AI" toggle shows only when `aiAvailability` is ready (`hasKey && modelSupported`).
    - It is off on open (A3).
    - Calls happen on toggle-on and on "Đổi gợi ý", sending `avoidIds`. They abort on close.
    - The rule-based set shows while loading and after any error, with a Vietnamese note per code
      (`rate_limited`, `not_configured`, others). An empty `outfits` falls back silently.
    - The AI reason renders as plain text.
    - It must work at 390px and in dark mode.
  - `OutfitsModal.test.tsx` cases with a fake client. No App-level tests (BUG-006).
  - `src/App.tsx`: `aiOutfits` client and `ai={{settings, settingsRev, outfits}}` props.
  - Ming verification there: real Claude and Gemini keys.
