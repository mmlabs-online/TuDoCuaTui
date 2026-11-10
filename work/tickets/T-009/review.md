# Review — T-009

## Attempt 1 — 2026-11-10
Verdict: PASS

Branch `claude/loving-fermi-t90upb`, diff base `origin/main`, reviewed at `3bdd6cc`. A security review runs in parallel
(`security-review.md`) and is not repeated here.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (tsc --noEmit) exit 0, no output.
- format:check: `pnpm format:check` "All matched files use the correct format." (129 files).
- test: `pnpm test` 41 files, 488 tests passed.
- test:coverage: `pnpm test:coverage` 488 passed; All files 99.64 % stmts / 98.69 % branches / 100 % funcs / 99.71 % lines;
  per-path thresholds (incl. `src/shared/ai/**`, `supabase/functions/_shared/core/**`) met. Lowest new rows:
  `providerErrors.ts` 95.23 % stmts, `settingsHandler.ts` 98.9 % stmts / 95.77 % branches, `aiSettings.ts` 92.85 % branches.
- build: `pnpm build` "built in 300ms".
- `bash scripts/check-public-supabase-env.test.sh`: 17/17 passed.
- `npx --yes deno@2 check --config supabase/functions/tudo-ai-settings/deno.json supabase/functions/tudo-ai-settings/index.ts`:
  exit 0, no diagnostics; working tree still clean afterwards (the committed `deno.lock` was not rewritten).
- Matches the impl-log's claims (Attempt 1, Checks); no mismatch.

### Acceptance criteria
- [x] **AC1 — save, replace, delete; browser never reads the key back (masked hint only).** Evidence:
  `settingsHandler.test.ts:173` "first save seals the key (AAD user+provider) and returns the mask", `:186` "a new key
  replaces the ciphertext", `:194` keep-key on model change, `:263` deleteKey clears key, keeps provider/model, idempotent;
  `:329` leak check over all paths (no apiKey / ciphertext / provider text in any body or log). `store.ts:73` `getView`
  never selects `key_ciphertext` (`store.test.ts:33`). `settingsHandler.ts:43-53` view = provider, model, `••••`+hint,
  hasKey, modelSupported, updatedAt only. Client wrapper: `aiSettings.test.ts` (supabase repo: apiKey not echoed). Server
  side, zero client privileges: migration `20261110000000_tudo_ai_settings.sql:37-41`. **Live behaviour against the
  hosted project is to be confirmed by Ming (M-10 step 6 smoke test).**
- [x] **AC2 — RLS: no cross-user read/change; anon has nothing.** Evidence (static): migration `:37-41` (RLS on, no
  policies, `revoke all … from public, anon, authenticated`, DML only to `service_role`); pgTAP
  `supabase/tests/rls_ai_settings.sql` — 41 assertions, count matches `plan(41)`: `table_privs_are` empty for anon /
  authenticated on both tables (`:19-22`), RLS + no policies (`:27-30`), 42501 on select/insert/update/delete of own and
  B's rows for authenticated (`:36-45`) and anon (`:50-59`), service_role positive control (`:64-65`), CHECKs (`:66-71`),
  `updated_at` (`:75`), cascade (`:80-81`). Code side: user id only from the verified token (`settingsHandler.ts:77-85`),
  body `user_id` → 400 (`settingsHandler.test.ts:130`, `validate.test.ts:64`), every store query `.eq("user_id", uid)`
  (`store.test.ts:33,51,65,80,90`). All new names are `tudo_`-prefixed, so `grants.sql` N1–N5 stay green.
  **The pgTAP run itself (`npx supabase test db`, `bash scripts/test-db-shared.sh`) needs Docker and is to be confirmed by
  Ming (M-10 step 7).**
- [x] **AC3 — only allowlisted provider/model ids accepted.** Evidence: `validate.ts:12-14` exact match, no trim/case-fold;
  `validate.test.ts:7,16,20,28` (unknown, other provider, case/whitespace variants, zero-model provider);
  `settingsHandler.test.ts:219` rejects before any write, `:233` provider `gemini` → `invalid_model` while its list is
  empty; `:292` `test` re-checks the stored model. DB backstop: provider CHECK + model-format CHECK (migration `:14-15`,
  pgTAP `:66,70`).
- [x] **AC4 — no key or secret in client code, `VITE_*`, logs or error messages (R3).** Evidence: `boundary.test.ts:23-37`
  (no `TUDO_AI_KEK` / `service_role` / table names in non-test `src/**`; `.env.example` gains no AI var); diff grep: the
  only new `console.` is the logger wiring `tudo-ai-settings/index.ts:32`, typed to `{action, code, providerStatus?}`
  (`settingsHandler.ts:17-21`); no new `VITE_*` outside tests; error body is exactly `{error:{code}}` (`http.ts:30-32`,
  `http.test.ts:22`); provider adapters read only the HTTP status / structured reason (`_shared/deno/claude.ts:12`,
  `providerErrors.ts`, `providerErrors.test.ts:24`); unexpected throws → `internal`, code only (`settingsHandler.ts:171-177`,
  `settingsHandler.test.ts:361`). Secrets are Edge Function secrets only (`supabase/functions/.env.example`,
  `supabase/.gitignore` ignores `functions/.env`).
- [x] **AC5 — unit tests for validation; checks pass.** Evidence: all checks above green; `validate.test.ts`,
  `catalog.test.ts`, `mask.test.ts`, `errors.test.ts`, `mirror.test.ts`, plus seven `_shared/core/*.test.ts` files.

### Deviations in impl-log — judgement
- **Anthropic SDK pinned 1.6.0 instead of 1.7.0** — accepted. Exact pin as the plan requires (`deno.json`); `deno check`
  resolves it and typechecks `models.retrieve`. The runtime call is proven only by Ming's smoke test (M-10 step 6).
- **Catalog test changed** ("each provider has ≥1 model" → "gemini has none", `catalog.test.ts:21`) — accepted; it follows
  Ming's approved scope adjustment (Gemini list ships empty). The unique-id / pattern / ≤1-default checks are kept (`:26-33`).
- **Gemini endpoint and error shape from memory** — accepted for now: the path is unreachable (no Gemini models →
  `invalid_model` on save and test), and the module says so (`gemini.ts:6-9`). Must be verified together with the model ids
  before Gemini is enabled (follow-up).
- **Edge env var names from memory** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `index.ts:10-16`) — accepted with a
  risk note: these are the long-documented injected defaults. If the hosted project only injects the new `sb_secret_`
  keys, `createClient(url, "")` throws at boot and the function returns a gateway 5xx (not a JSON `server_misconfigured`);
  no secret leaks either way. M-10 step 6 detects it immediately.
- **Out-of-plan `src/test/setup.ts`** — accepted: one-line guard (`typeof localStorage !== "undefined"`) needed by the
  `// @vitest-environment node` suites (WebCrypto / Response); no behaviour change for jsdom suites.
- **Out-of-plan `supabase/functions/tudo-ai-settings/deno.lock`** — accepted: generated by the plan's own `deno check`
  step, pins integrity hashes for the exact-pinned deps; no runtime effect beyond stricter resolution.
- **Not verified here** (pgTAP run, type regeneration, deploy/secrets/live provider calls, no CI `deno check`) — all are
  outside an agent sandbox without Docker or project access and are listed in M-10 (steps 2–8) as the plan foresaw (A13,
  *Ming verification after merge*). They do not block PASS but **are to be confirmed by Ming (M-10)**.

### Scope
Every changed file is in the plan's file list, or justified under *Out-of-plan files* (`src/test/setup.ts`, `deno.lock`).
Files the plan forbids (`package.json`, `.dockerignore`, `Dockerfile`, `.github/workflows/*`, `src/lib/supabase.ts`,
`docs/feature-list.md`, `work/decisions.md`, `work/backlog.md`, `vite.config.ts`) are untouched. The hand-added
`src/types/database.ts` block (two tables, alphabetical, Row/ComputedFields/Insert/Update/Relationships) matches the
generator shape used elsewhere in the file (A13).

### Issues
None blocking. No 🔴 or 🟡 issues.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: only `src/data/aiSettings.ts` calls `functions.invoke`; local mode → `available:false`, every method rejects
  `not_available` (`aiSettings.ts:69-78`); `getAiSettingsRepo` picks local when `supabase` is null (`:80-82`); no
  component or `WardrobeRepo` change.
- R2: new migration with RLS in the same file; no applied migration edited; types updated (by hand, regen in M-10 step 8).
- R3: see AC4. R4/R5: not affected. R6: no UI copy; English codes. R7: see Scope. R8: checks green, new pure logic tested.
  R9: no UI. R10: `AGENTS.md`, `.figma/`, `vite.config.ts` untouched.

### Nits (do not block)
- 💭 `work/ming-todo.md` M-10 says "Rollback: the commented block **at the end** of the migration"; the rollback block is
  at the **top** (`20261110000000_tudo_ai_settings.sql:8-10`).
- 💭 `tudo-ai-settings/index.ts:10-16`: missing `SUPABASE_URL` / service key crashes at boot instead of returning
  `server_misconfigured`; harmless, but a guard would give a clearer error during M-10.
- 💭 impl-log does not cite doc URLs for the Claude model ids / SDK version / env names (docs unreachable); the Claude ids
  come from the approved plan. The M-10 `test` call (Claude `models.retrieve`) confirms the chosen id exists.

### Follow-ups (out of scope)
- Add verified Gemini model ids and verify the Gemini endpoint + `error.details[].reason` shape against Google's docs
  (small /solo; update `src/shared/ai/catalog.ts` and the mirror together).
- CI `deno check` step for `supabase/functions/**`.
- Bump `@anthropic-ai/sdk` to the latest once it passes Deno's minimum-age rule.
- `key_status` / `key_checked_at`; KEK rotation (`TUDO_AI_KEK_PREV`); README for local `functions serve`;
  feature-list update for D21 and the F-701 rename (`tudo-tag-item-photo`).
