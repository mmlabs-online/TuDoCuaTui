# Implementation log — F-701

## Attempt 1 — 2026-11-14

### Files touched
| File | Required because |
|---|---|
| `server/ai/tagging.js` (new) | prompt, JSON schema, `parseTagSuggestion` sanitizer |
| `server/ai/claude.js` | `tagPhotoWithClaude` (forced tool use, 64 KB cap) |
| `server/ai/tagPhoto.js` (new) | `handleTagPhoto`: check order, in-flight cap, abort on disconnect, `ai_tag` log |
| `server/ai/routes.js` | `loadSettingsKey` extracted from `handleTest`; limiter typedef gets `tag` |
| `server/ai/rateLimit.js` | `tag` kind, 100 per 24 h |
| `server/ai/catalog.js`, `src/shared/ai/errors.ts` | four new codes (parity) |
| `src/features/settings/copy.ts` | Vietnamese messages for the new codes (exhaustive `AI_ERRORS`) |
| `server/validate.js` | `COLOR_IDS` |
| `server/photos.js` | export `readBody`, `rejectUnread`, `MAX_BYTES` (no behaviour change) |
| `server/api.js` | route match + dispatch before the UUID check |
| `server/README.md`, `work/ming-todo.md` | endpoint docs; optional M-23 |
| `work/tickets/T-019.3/ticket.md`, `work/tickets/F-702/ticket.md` | dated notes assigned by the plan |
| tests: `tagging.test.ts` (new), `tagPhoto.test.ts` (new), `claude.test.ts`, `routes.test.ts`, `rateLimit.test.ts`, `parity.test.ts` | per plan |

### Tests added / changed
- tagging.test.ts: schema, happy path, category, colors/seasons, strings, tags, structure
- claude.test.ts › tagPhotoWithClaude: pinned URL/headers, body shape, success, bad responses, 64 KB cap, HTTP errors, timeout/network/abort
- tagPhoto.test.ts: success, error codes, upload guards, rate limit, in-flight cap, disconnect, method/origin, sentinel, log fields
- routes.test.ts › loadSettingsKey; rateLimit.test.ts › tag kind; parity.test.ts › vocabulary

### Checks (actual output summary)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: all matched files use the correct format
- test: 71 files passed, 6 skipped; 835 tests passed, 102 skipped (DB tests skipped: no Postgres)
- test:coverage: exit 0; Statements 82.68%, Branches 84.9%, Functions 85.05%, Lines 82.09%
- build: built in 507ms

### Out-of-plan files
- `tsconfig.server.json` — added `paths: {"@/*": ["./src/*.ts"]}`: the parity test now imports `src/data/mappers.ts` (as the plan requires), which uses the `@/` alias; the server typecheck failed without it.

### Follow-ups (noticed, not done)
- F-701.1 (Gemini) is created by the orchestrator.
- Tagging a stored photo by id (A7).
- `api.test.ts` has no route table, so the plan's optional entry was not added; method/origin/404 cases are in `tagPhoto.test.ts`.

### Scope self-check
- Could the diff be smaller? No; production is about 330 lines, the rest tests and docs.
- Diff size: about +407 / -18 on tracked files, plus 4 new files.
