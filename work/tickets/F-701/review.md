## Attempt 1 — 2026-11-14
Verdict: PASS

### Checks (run by reviewer)
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0)
- format:check: "All matched files use the correct format." (197 files)
- test: without Postgres, 835 passed and 102 skipped, the same counts as impl-log.md. With a throwaway Postgres 16 (`TEST_DATABASE_URL`, scram auth): 77 files and 937 tests passed, 0 skipped. The first run used trust auth and failed one test, `migrate.cli.test.ts › exit 1 on wrong password`, because trust auth accepts any password. That failure came from the setup, not the code, and the test passed with password auth.
- build: `vite build`, built in 268ms

### Acceptance criteria
- [x] 1 Valid ids only (Claude; Gemini moved to F-701.1 per C4/A1). Evidence: `server/ai/tagging.test.ts` (schema, category, colors/seasons, strings, tags, structure), `claude.test.ts › tag: success returns raw tool input` and `› tag: bad responses`, and `tagPhoto.test.ts › success › returns a sanitized suggestion` (`bag` becomes null, `purple` is dropped, `winter` is deduped, a 121-char name becomes null). `parity.test.ts › server vocabulary equals src/data/mappers.ts` also passes. All green.
- [x] 2 Clear error codes. Evidence: `tagPhoto.test.ts › error codes` (server_misconfigured, db_unavailable, not_configured, invalid_model, key_unreadable, provider status mapping, provider_bad_response, 57P01 → 503 and other errors → 500 internal with requestId). `› rate limit`: 100 calls pass, the 101st gets 429 before getSecret, and a call 24 h later passes. `› in-flight cap`: ai_busy with Retry-After.
- [x] 3 The key never leaves the server and nothing secret is logged. Evidence: `claude.test.ts › tag: key only in x-api-key to the pinned URL`. `tagPhoto.test.ts › secrets and logs › the sentinel never leaves the server` covers success, a 401 echo and a throwing fetch; the image base64 appears only in the provider request body. `› ai_tag logs have fixed fields only` checks the keys {code,event,id,ms}.
- [x] 4 Image size limit. Evidence: `tagPhoto.test.ts › upload guards` (415, declared 413, streamed 413, bad magic bytes, empty body, short body → invalid_photo, connection closed, no secret read).
- [x] 5 `/test` unchanged after the `loadSettingsKey` refactor. Evidence: the existing `routes.test.ts` POST /test suites pass, and new `loadSettingsKey` cases were added. The refactor (`server/ai/routes.js:42-52`, `:80-82`) keeps the same order and the same responses.
- [x] 6 Checks green and local mode unchanged. `git diff --stat origin/main...HEAD -- src/` lists only `src/features/settings/copy.ts` and `src/shared/ai/errors.ts`, both additive (+4 each). Nothing in `src/` calls the endpoint.

Ming verification after merge (not verified here, carry into the PR):
- M-23 (optional): real-key smoke test of `POST /api/ai/tag-photo` with a small JPEG after deploy, checking for `{"suggestion":{…}}` with a Vietnamese `name`.

### Issues
None.

### Out-of-plan change: `tsconfig.server.json` `paths: {"@/*": ["./src/*.ts"]}`
Accepted. The plan requires the parity test to import `src/data/mappers.ts`, which imports `@/types/item`. Without the mapping, the server typecheck fails. Checked:
- The mapping affects tsc resolution only. Node ignores tsconfig, so it adds no runtime resolution and does not ship anything into the image. The Dockerfile copies only `server/`, `db/migrations`, `dist` and production `node_modules`.
- No server runtime file imports `src/` or `@/`. `grep -rnE "(\.\./)+src/|@/" server --include=*.js` returns nothing, and the only `src/` imports under `server/` are in `parity.test.ts`.
- Risk added: a future `import "@/…"` in server runtime JS would now pass typecheck, and vitest too (it uses the Vite alias). `server/index.cli.test.ts` spawns `node server/index.js`, which loads `api.js`, so such an import in the request path would fail there with ERR_MODULE_NOT_FOUND. The same risk already existed for relative `../../src/*.ts` imports, because `allowImportingTsExtensions` is on. The added risk is small and covered by the CLI test. A guard test is listed under Follow-ups.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: `WardrobeRepo` and local mode untouched.
- R2: no schema change.
- R3: the key is passed only to `tagPhotoWithClaude` and appears only in `x-api-key`, sent to a pinned URL with `redirect: "error"`. No `VITE_*` change, and the sentinel tests are green.
- R4 (as amended by D27/D34): the image stays in memory and is never stored, logged or echoed.
- R5: nothing derived is stored.
- R6: the new copy is Vietnamese and lives in `copy.ts`; ids in, ids out.
- R7: every changed file is in the plan except `tsconfig.server.json`, which is justified above. The F-701 `ticket.md` and consult file are orchestrator and loop artifacts.
- R8: every new pure function has tests.
- R9: no UI change.
- R10: `AGENTS.md`, `.figma/` and `vite.config.ts` untouched.

### Nits (do not block)
- `server/ai/claude.js` `tagPhotoWithClaude`: the `blocks.length !== 1` check is stricter than the plan's "exactly one tool_use block". A model that adds a text block alongside the forced tool call would get `provider_bad_response`. Forced `tool_choice` should not produce that, but if M-23 shows it does, relax the check to one `tool_use` block.
- `server/ai/tagPhoto.js`: `res.once("close", …)` is registered only after the body is read. A disconnect during upload is handled by `readBody` instead, which is fine. A comment saying so would help.
- `server/ai/tagPhoto.js` catch: a non-DB bug also goes through `mapDbError` and logs `event: "db_error"`. This matches `routes.js`, but the event name is slightly misleading.

### Follow-ups (out of scope)
- Add a boundary test that fails if any non-test file under `server/` imports from `src/` or `@/`, to make the image's "no src/" guarantee explicit.
- Tag a stored photo by id (A7).
- F-701.1: Gemini adapter, catalog models and the `/test` check, reusing `tagging.js`.
