# Implementation log — F-704.3

## Attempt 1 — 2026-11-18

### Files touched
| File | Required because |
|---|---|
| `server/ai/claude.js` | Generic `claudeToolCall`; `tagPhotoWithClaude` is a thin wrapper; new `suggestWithClaude` (text only). |
| `server/ai/gemini.js` | `toGeminiSchema`, private `geminiJsonCall`; `tagPhotoWithGemini` wrapper (still `temperature: 0`); new `suggestWithGemini` (no temperature). |
| `server/ai/tagging.js` | `text` exported as `cleanText` (renamed, no behaviour change). |
| `server/ai/outfitSuggest.js` (new) | Pure body check, prompt, schema, strict validator. |
| `server/ai/suggestOutfits.js` (new) | Route handler. Order: slot, body, candidates, limiter, key, adapter, validator. |
| `server/items.js` | `loadSuggestCandidates` (read-only, `user_id`, active, categories). |
| `server/api.js` | Route `POST /api/ai/suggest-outfits`. |
| `server/app.js` | `suggestSlots` (1 per user, 2 total, owner exempt). |
| `server/ai/rateLimit.js` | `suggest` 30/24 h per user, 600/24 h global. |
| `server/ai/routes.js` | JSDoc only: `AiContext` and limiter kind; `loadSettingsKey` param narrowed to `{kek, store}`. |
| `server/README.md` | Endpoint paragraph. |
| `server/ai/outfitSuggest.test.ts` (new), `server/ai/suggestOutfits.test.ts` (new) | Plan tests. |
| `server/ai/claude.test.ts`, `server/ai/gemini.test.ts` | Added suggest cases (+ import lines). Existing assertions untouched. |
| `server/ai/rateLimit.test.ts` | `"suggest"` added to the `it.each` kind list and `KINDS` (the only edited lines). |
| `server/isolation.db.test.ts` | One case in the `ai_settings` describe; the fake provider fetch also answers `suggest_outfits` (additive). |

### Tests added / changed
- `outfitSuggest.test.ts`: parseSuggestBody accept/reject, buildSuggestPrompt (aliases, no UUID/private fields, sanitising, UTC+7 days, avoid, injection note), buildSuggestSchema, validateSuggestions keep/drop/dedupe/4th/bad shape.
- `claude.test.ts` / `gemini.test.ts`: suggest text-only body and header-only key, error mapping, bad responses, timeout, 64 KB cap; `toGeminiSchema(buildTagSchema())` equals `buildGeminiSchema()`.
- `rateLimit.test.ts`: `suggest` in per-kind and owner-lane cases.
- `suggestOutfits.test.ts` (20 cases): happy path Claude and Gemini, scoped query, DB-filtered ids never reach the prompt, < 2 candidates uses no quota, 31st call 429 with tag-photo still allowed, ai_busy and separate slots and owner lane, bad body/415/413 use no quota, 405/403/404, error table, key and names and reason never logged.
- `isolation.db.test.ts` › "suggest-outfits: B sending A's item ids gets no outfits and no provider call; A's stored item is not sent".
- Existing `claude.test.ts`, `gemini.test.ts`, `tagPhoto.test.ts` pass with no edited assertions.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exit 0, no errors.
- format:check: "All matched files use the correct format." (322 files).
- test: `Test Files 130 passed | 11 skipped (141)`, `Tests 1700 passed | 222 skipped (1922)`.
- build: `vite build` ok (`built in 859ms`).
- DB isolation test: **skipped here** (no `TEST_DATABASE_URL`, no local Postgres server; `describe.skipIf(!dbAvailable)` like the other `*.db.test.ts`). It runs on CI. Not verified against a real database.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- F-704.4 (client) still to create/implement: `createHttpAiOutfits`, `candidatePool`, modal toggle and fallback.
- Real-provider check (Claude tool use without image, Gemini schema dialect) is Ming's optional manual step after release.

### Scope self-check
- Could the diff be smaller? No: the adapter refactor is what keeps tag behaviour identical and shares code with suggest.
- Diff size: modified files +416 / -60; new files 1,178 lines (276 + 108 product, 303 + 491 tests).
