# Implementation log — F-701.1

## Attempt 1 — 2026-11-17

### Model ids (A1) and thinking settings (A3)
- Ids, labels and default as confirmed by Ming on **2026-11-17** ("duyệt F-701.1, giữ đề xuất", ticket.md Notes),
  against https://ai.google.dev/gemini-api/docs/models: `gemini-2.5-pro` (Gemini 2.5 Pro), `gemini-2.5-flash`
  (Gemini 2.5 Flash, **default**), `gemini-2.5-flash-lite` (Gemini 2.5 Flash-Lite). The page was not fetched in this
  session (orchestrator instruction); the confirmation is Ming's.
- `GEMINI_THINKING`: the plan's A3 defaults, approved with A2–A16 "as written": `gemini-2.5-flash` and
  `gemini-2.5-flash-lite` → `{thinkingBudget: 0}`; `gemini-2.5-pro` → `{thinkingBudget: 128}`. Not re-checked
  against the docs page in this session (no network); M-27 is the real check.

### Files touched
| File | Required because |
|---|---|
| `server/ai/readCapped.js` (new) | A5: body reader moved verbatim from `claude.js`, cap as a parameter; shared by both adapters. |
| `server/ai/readCapped.test.ts` (new) | Unit tests for the extracted reader (R8). |
| `server/ai/claude.js` | Mechanical: import `readCapped`, call `readCapped(res, MAX_RESPONSE_BYTES)`; private copy removed. |
| `server/ai/gemini.js` (new) | Adapter: `GEMINI_BASE`, `GEMINI_THINKING`, `GEMINI_TAG_INSTRUCTION`, `buildGeminiSchema`, `checkGeminiKey`, `tagPhotoWithGemini`. |
| `server/ai/gemini.test.ts` (new) | AC 1–3 at adapter level, fake fetch. |
| `server/ai/providerErrors.js` | `geminiReasonOf` (allowlist) and `mapGeminiError`; header comment updated. |
| `server/ai/providerErrors.test.ts` | Gemini reason parser and mapping table. |
| `server/ai/tagging.js` | Split: `TAG_FIELDS` exported; `TAG_INSTRUCTION` = Claude first line + `"\n"` + `TAG_FIELDS` (byte-identical). |
| `server/ai/tagging.test.ts` | Byte-identity literal check of `TAG_INSTRUCTION`; `TAG_FIELDS` is its suffix. |
| `server/ai/catalog.js` | `AI_MODELS.gemini` = confirmed ids. |
| `src/shared/ai/catalog.ts` | Same ids (parity); comment points at the models page and confirmation date. |
| `src/shared/ai/catalog.test.ts` | Exact Gemini list and default. |
| `server/ai/routes.js` | `loadSettingsKey` no longer Claude-only (return type `AiProvider`); `/test` dispatches through `CHECKERS`. |
| `server/ai/routes.test.ts` | Gemini-as-invalid cases re-pointed to unlisted `gemini-x`; PUT accepts Gemini; Gemini `/test` happy path, status table, sentinel; `loadSettingsKey` valid Gemini row. |
| `server/ai/tagPhoto.js` | `TAGGERS` gains `gemini` (typed `Record<AiProvider, …>` so both are required). |
| `server/ai/tagPhoto.test.ts` | Rename of the unlisted-gemini case; Gemini success, error mapping, sentinel, provider dispatch. |
| `src/features/settings/copy.ts` | `providerOptions.gemini` → `"Gemini"`. |
| `src/features/settings/AiSettingsModal.test.tsx` | Gemini option enabled, selecting it picks the Gemini default; Save needs a key; invalid-combination half kept as its own test. |
| `src/features/settings/form.test.ts` | `modelsFor`/`nextModelOnProviderChange`/`canSave` re-pointed to the Gemini list. |
| `server/README.md` | AI section: Gemini `/test` endpoint and tag-photo destination; "Claude only for now" removed. |
| `work/tickets/F-701.1/impl-log.md` (new) | This log. |

Not touched although listed in the plan: `work/ming-todo.md` (M-27) — per orchestrator instruction the orchestrator
adds M-27 itself.

### Tests added / changed
- `server/ai/readCapped.test.ts` › parses JSON under the cap · over the cap -> null and the reader is cancelled · not JSON / empty / no body -> null
- `server/ai/providerErrors.test.ts` › geminiReasonOf › reads only allowlisted ErrorInfo reasons or the rpc status · mapGeminiError › maps Gemini statuses and reasons
- `server/ai/gemini.test.ts` › check: key only in x-goog-api-key to the pinned URL · check: model id is URL-encoded · check: HTTP errors (incl. 8 KB cap with cancel, non-JSON, sentinel echo) · check: timeout, network, redirect · buildGeminiSchema › translates buildTagSchema · GEMINI_TAG_INSTRUCTION · thinking config exists for every catalog id · tag: key only in x-goog-api-key to the pinned URL · tag: request body shape · tag: success returns raw object · tag: bad responses -> provider_bad_response · tag: body over 64 KB is cancelled, not buffered · tag: HTTP errors · tag: timeout, network, abort, redirect
- `server/ai/tagging.test.ts` › TAG_INSTRUCTION is byte-identical to the F-701 text
- `src/shared/ai/catalog.test.ts` › gemini has exactly the confirmed models, one default
- `server/ai/routes.test.ts` › PUT validation (gemini-x) · accepts a Gemini model · not_configured … (catalog, unlisted gemini) · POST /test with a Gemini row › calls models.get on the pinned host -> 200 {ok:true} · Gemini status table · /test Gemini: sentinel never leaves the server · loadSettingsKey › unlisted gemini or unknown model -> 400 invalid_model without decrypting · valid Gemini row -> the key
- `server/ai/tagPhoto.test.ts` › unlisted gemini or unknown model -> 400 invalid_model · gemini › gemini: success returns sanitized suggestion · gemini: provider errors map to status + code · gemini: sentinel never leaves the server · provider dispatch
- `src/features/settings/form.test.ts` › models (re-pointed) · canSave › is true for Gemini with its default model and a valid key
- `src/features/settings/AiSettingsModal.test.tsx` › lists Gemini as enabled; choosing it selects the default Gemini model · disables Save for an invalid combination
- `server/ai/claude.test.ts`, `server/ai/parity.test.ts`: unchanged, green.

### Checks (actual output summary)
- `pnpm format` run first (formatted the new/changed files).
- typecheck: `pnpm typecheck` → exit 0 (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- format:check: `pnpm format:check` → exit 0 ("All matched files use the correct format", 262 files).
- test: `pnpm test` → exit 0 — Test Files 101 passed | 10 skipped (111); Tests 1262 passed | 205 skipped (1467). Skips are the existing DB-backed suites (no Postgres in this session), e.g. `*.db.test.ts`.
- build: `pnpm build` → exit 0 (`✓ built in 751ms`).

### Deviations
- Model order in the catalog follows the plan's A1 table (Pro, Flash, Flash-Lite); default is Flash as confirmed.
- `AiSettingsModal.test.tsx`: the old single test was split into "enabled + default model" and the kept
  "disables Save for an invalid combination" half, so each intent stays named.
- No real network calls; all provider traffic is fake fetch.

### Out-of-plan files
None. (`work/ming-todo.md` was in the plan but deliberately left to the orchestrator.)

### Follow-ups (noticed, not done)
- A4: free-tier data-use disclosure for Gemini (Google may use free-tier inputs) belongs in F-702 / Settings copy;
  the F-702 disclosure line should name the saved provider rather than "Claude" (F-701 plan A5).
- A14: `drive.js` `reasonOf` and `geminiReasonOf` stay separate on purpose (different shapes); optional
  `propertyOrdering` in the Gemini schema; a `countTokens`-based quota check for `/test` (A6: `models.get` does not
  check generation quota).
- A12: if the deployment repo restricts egress, `generativelanguage.googleapis.com` must be allowed there.
- M-27 (optional real-key smoke for each model id, A11) — to be added to `work/ming-todo.md` by the orchestrator.

### Scope self-check
- Could the diff be smaller? No — production changes are the plan's file list; most lines are the tests it requires.
- Diff size: +1067 / -63 lines across 20 files (about +264 / -45 outside test files, including README); log excluded.
