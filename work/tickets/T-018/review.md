## Attempt 1 — 2026-11-12
Verdict: PASS

Scope: slice T-018.1 only (approved split). Diff `git diff origin/main...HEAD` at `2b24fa0` (branch `ticket/T-018`). Ticket AC 3 (`POST /test`) is in T-018.2 and was not expected here.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json`) exit 0. `allowImportingTsExtensions` works for `parity.test.ts`.
- format:check: `pnpm format:check` exit 0, "All matched files use the correct format." (196 files).
- test: `TEST_DATABASE_URL=<throwaway pg> npx vitest run --maxWorkers=2 --coverage --coverage.reportOnFailure`: 75 files, **883 passed, 3 failed, 8 skipped**, no coverage threshold error. `server/ai` coverage 98.0 % stmts / 96.6 % branches / 96.8 % funcs / 98.4 % lines (with the DB test).
  - The 3 failures are pre-existing Windows-only failures, **verified on `origin/main`** (exported with `git archive origin/main` into a scratch dir, same `node_modules`, same DB): the identical 3 tests fail there with the identical errors:
    - `server/api.test.ts › body > 256 KB -> 413 …` (`fetch failed`, `read ECONNRESET`)
    - `server/api.db.test.ts › rejects before Drive: 415, 413 …` (`read ECONNRESET`; same class, only visible with a DB, so the implementer's non-DB run did not list it)
    - `server/index.cli.test.ts › starts on PORT … SIGTERM exits 0` (`expected null to be +0`: no POSIX SIGTERM exit code on Windows)
  - With the default worker count the run also produced hook/test timeouts (`App.test.tsx`, `migrator.db.test.ts`, `migrate.cli.test.ts`, once `store.db.test.ts` afterAll). The same class of timeouts happens on `origin/main` under full parallel load (base run: 6 failed, including `app.db.test.ts`, `migrator.db`, `migrate.cli`, `App.test`). With `--maxWorkers=2` and in isolated runs they all pass, including all 5 `store.db.test.ts` tests. Machine load, not this diff.
  - DB: throwaway container `postgres:16-alpine` (name `t018-review-pg`, port 55499, throwaway password), removed afterwards with `docker rm -f`. DB tests run: `server/ai/store.db.test.ts`, `schema.db.test.ts`, `migrator.db.test.ts`, `migrate.cli.test.ts`, `app.db.test.ts`, `api.db.test.ts` (full suite).
- build: `pnpm build` exit 0 (vite built in 775 ms).
- `scripts/check-image.sh`: not run (needs the CI `image` job); reviewed by reading, see AC 7.
- impl-log vs my run: consistent. The impl-log's "2 pre-existing failures" omitted `api.db.test.ts` 413 because its full run had no DB; it is the same pre-existing ECONNRESET class and fails on `origin/main` too. Not a mismatch.

### Acceptance criteria
- [x] AC 1 — key stored only encrypted; never in an endpoint, log line or error body — evidence: `server/ai/routes.test.ts › sentinel never leaves the server › is absent from bodies, headers and logs across PUT, GET and DELETE` (PUT ok / invalid model / extra field / bad JSON / over-size / store throwing an error whose `message` and `detail` hold the sentinel; GET; DELETE; checks bodies, headers, both apps' logs and the saved ciphertext) ✓; `server/ai/store.db.test.ts › stores ciphertext, never the key` ✓ (real Postgres, `select` of the row does not contain the sentinel, `openKey` returns it); `crypto.test.ts` asserts thrown messages never contain the plaintext ✓. Code: `routes.js:46-50` logs fixed fields only; `routes.js:90-94` logs `dbLogFields` only.
- [x] AC 2 — GET masked view only; PUT rejects invalid provider/model via the shared rule — evidence: `routes.test.ts › GET › view shape: exactly the 6 keys, masked hint, no-store` ✓, `› a model no longer in the catalog -> modelSupported:false` ✓, `› PUT validation › rejects with the shared rule codes` (incl. `gemini` + any model → `invalid_model`, `bad_request` for extra/mistyped fields) ✓, `› 415 …, 400 invalid_json, 413 above 4096 bytes` ✓, `› PUT key handling` (3 tests, incl. `key_required`) ✓; `parity.test.ts` (3 tests) ✓ proves `server/ai` equals `src/shared/ai`.
- [x] AC 4 — KEK unset: defined error, rest of API works — evidence: `routes.test.ts › KEK off › every AI route answers 503 server_misconfigured; the rest of the API works` ✓; `index.cli.test.ts › no AI_KEK: logs 'ai not configured'` ✓, `› valid AI_KEK: logs 'ai configured', value not printed` ✓, `› malformed AI_KEK exits 2 with 'config error: ...AI_KEK...' and no value` ✓.
- [x] AC 5 — local mode unchanged (R1), checks green incl. migration runner — evidence: `git diff --stat origin/main...HEAD -- src/` = only `src/shared/ai/errors.ts` (4 codes) and `src/shared/ai/boundary.test.ts`; no runtime change in the client. `server/migrator.test.ts › real db/migrations files are well-formed …` ✓, `migrator.db.test.ts › applies all migrations to a fresh database` ✓, `schema.db.test.ts › no table has RLS or a user_id column` ✓ (real Postgres, reviewer-run). Checks green apart from the 3 pre-existing Windows failures above; CI (Linux) is the authority for those.
- [x] AC 6 — server port and `src/shared/ai` agree — evidence: `server/ai/parity.test.ts` (constants, validate fixture table, mask) ✓.
- [x] AC 7 — R3 boundary covers the new names — evidence: `src/shared/ai/boundary.test.ts:13-14` adds `AI_KEK`, `ai_settings`; test ✓. `scripts/check-image.sh:58` regex now includes `AI_`; `scripts/check-image.sh:114` adds `expect_exit 2 "server with malformed AI_KEK" "${ACCESS[@]}" -e AI_KEK=not-a-kek "$IMAGE"`. Read: `expect_exit` runs with `--network none` and the CI-dummy Access env, so the server gets past the Access and Drive config and exits 2 in the AI block (`server/index.js:52-61`) before touching the DB. Correct; it runs in the CI `image` job.

### Ming verification after merge (not verified by the reviewer; carry into the PR)
- Review the migration `db/migrations/20261112160000_ai_settings.sql` (High tier); the next release's deploy applies it through `migrate` (expand-only).
- After that release, with no `TUDOCUATUI_AI_KEK` yet: `docker compose -p tudocuatui logs --tail 20 tudocuatui` shows `ai not configured`; `https://tudocuatui.mmlabs.online/api/ai-settings` (signed in through Access) shows `{"error":{"code":"server_misconfigured"}}`; items and photos work as before.

### Scope
Every changed file is in the plan's *Files* list, except:
- `work/ming-todo.md`: one ticked line "Approve plan for T-018" in *Plan approvals and escalations*, written by the orchestrator in commit `9fd6e6b` (plan approval), not by the implementer. That is the `/run` plan-approval bookkeeping; the plan's "not touched" note refers to M-16. Accepted.
- `work/tickets/T-018/ticket.md`: orchestrator state/claim/handoff. Accepted.
No unjustified out-of-plan change. Nothing from T-018.2 (POST /test, Claude adapter, deploy drafts, M-16, Dockerfile, package.json) is in the diff.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: no client runtime change; `AI_ERROR_STATUS` gains 4 entries only; local mode untouched.
- R2: new migration file only, no applied migration edited; no RLS and no `user_id` by D25 (checked by `schema.db.test.ts`); `src/types/database.ts` not regenerated, correct because it is Supabase-only (plan §9).
- R3: `AI_KEK` is server env only; no `VITE_*`; boundary test and image env check extended; the key never leaves `server/ai`.
- R4, R6, R9: not applicable (no photos, no UI). R5: nothing derived stored. R7: in plan. R8: unit + DB tests, coverage threshold `server/ai/**` added (`vitest.config.ts:64`). R10: `AGENTS.md`, `.figma/`, Figma plugins in `vite.config.ts` untouched.

### Nits (do not block)
- `server/ai/routes.js:90-94` uses the generic `mapDbError`, which can in theory return `invalid_input` (23514), `conflict` (23505/40001/40P01) or `not_found` (23503). None of these is in `AI_ERROR_STATUS`, so T-010 would show them as `internal`. With validated inputs, the singleton `on conflict` upsert and `for update`, only a serialization/deadlock `conflict` is conceivable. Optional: map non-`db_unavailable` results to `internal` in the AI route, or add `conflict` to the catalog in T-018.2.
- `server/ai/routes.js:76-78`: `sealKey` runs outside the `try`, so a (theoretical) WebCrypto failure goes to the app's outer handler as 500. Already noted in impl-log follow-ups.
- `server/ai/rateLimit.test.ts`: the plan's "a failed check records nothing" is implied by the code (`rateLimit.js:27`) but not asserted directly (e.g. 31st fails, then advance just past the first call's window and expect exactly one pass).
- `server/ai/rateLimit.js`: the `save` budget is consumed before body validation (plan order 2 → 3), so malformed PUTs count against the 30/h. Fine for one user; worth a one-line comment.

### Follow-ups (out of scope)
- The 3 Windows-only failures (`api.test.ts` and `api.db.test.ts` 413 ECONNRESET, `index.cli.test.ts` SIGTERM exit code) and the hook timeouts under full parallel load on this machine: pre-existing on `origin/main`; candidate `debt` issue (platform-tolerant assertions, or a `hookTimeout` / `maxWorkers` for DB files).
- A12: `migrate` will receive `AI_KEK` through the shared env file in T-018.2; keep the `debt` issue for a separate env file.
- `work/tickets/T-018/security-review.md` exists untracked in the working tree (not part of this diff, not written by the reviewer); the orchestrator should commit or discard it deliberately.
