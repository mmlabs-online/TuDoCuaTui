## Attempt 1 — 2026-11-13
Verdict: PASS

### Checks (run by reviewer)
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0)
- format:check: pass ("All matched files use the correct format", 185 files, exit 0)
- test: pass without a DB: 65 files passed, 6 skipped; 757 tests passed, 102 skipped (matches impl-log).
  With a throwaway Postgres 16 (`initdb --auth=trust`, port 55432, in the session scratchpad) and `TEST_DATABASE_URL`,
  `pnpm test:coverage`: 70 files passed, 1 failed; 858 tests passed, 1 failed. The one failure is
  `server/migrate.cli.test.ts › exit 1 on wrong password`, which is caused by the reviewer's trust-auth cluster (any
  password is accepted). This branch does not touch that file or `server/migrate.js`. `store.db.test.ts` verbose: 6/6
  passed, including `getSecret: null without a row or key, else provider, model and a v1 ciphertext`. Coverage
  thresholds were not printed because of that environment failure, so CI (`test:coverage` on Postgres 17) remains the
  authority for thresholds.
- build: pass (`✓ built in 309ms`, exit 0)

### Acceptance criteria
- [x] AC1: `/test` maps provider failures to `AiErrorCode`. Evidence: `server/ai/providerErrors.test.ts`;
  `server/ai/claude.test.ts` (status mapping, timeout, network); `server/ai/routes.test.ts › POST /test results`. These
  cover 200, 401→422 `invalid_key`, 403→422 `key_forbidden`, 404→422 `model_unavailable`, 429→429
  `provider_rate_limited`, 500/529→502, TimeoutError and network→502 `provider_unavailable`, 409 `not_configured`,
  400 `invalid_model` (old model, gemini; no fetch), and 409 `key_unreadable`. All pass.
- [x] AC2: The sentinel goes only into `x-api-key` sent to the pinned host. Evidence: `claude.test.ts › sends the key
  only in x-api-key to the pinned URL` (exact URL, GET, `redirect:"error"`, exact headers, AbortSignal, no body);
  `routes.test.ts › POST /test sentinel never leaves the server`. That test checks success, a 401 whose body echoes the
  key, a fetch that rejects with the key in its message, and an `{apiKey}` body. It checks bodies, headers and logs,
  and confirms exactly 3 calls, all to `MODEL_URL`. `server/ai/claude.js` never reads the body
  (`claude.test.ts › reads only the status and cancels the body`).
- [x] AC3: The envfile writes `AI_KEK` only when the value is set and well formed, and fails on a malformed value.
  Evidence: `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml`: the regex is checked before `mktemp`,
  and the value is written with `printf`. `scripts/deploy-envfile.test.ts` covers: AI_KEK only; with Drive (order);
  unset or empty; 10 malformed cases × with and without Drive (exit 1, file unchanged, no temp file left, value not
  printed); independence from the Drive group; static check of five secrets. All pass in this run.
- [x] AC4: Checks are green (see above). `git diff --stat origin/main...HEAD -- src/ AGENTS.md vite.config.ts .figma`
  is empty (R1, R10).
- [x] AC5 (G2): Evidence: `server/ai/crypto.js` `openStoredKey` (bare `catch`, single code);
  `crypto.test.ts › openStoredKey`. `routes.test.ts` checks that the key_unreadable log keys are exactly
  `{action, code, event, id}`.
- [x] AC6 (G1, Y1): Evidence: `server/ai/config.js` `initAi` (`delete env.AI_KEK` in `finally`);
  `config.test.ts › initAi` (4 cases; AI_KEK is removed on every path; no import when refused or unset);
  `index.cli.test.ts`: Access on gives `ai configured`, Access off gives `ai disabled: request auth off` plus 503
  `server_misconfigured`, and a malformed KEK still exits 2.

### Ming verification after merge (carry to PR)
- M-16 (generate the KEK, Bitwarden, `gh secret set TUDOCUATUI_AI_KEK`, delete the local file, merge the setup PR
  `setup/tudocuatui-ai-kek`, run workflow_dispatch and look for `ai configured`, check that `GET /api/ai-settings`
  returns `{"settings":null}`).
- Optional real-key check (A3, M-16 step 8): `POST /api/ai-settings/test` gives `{ok:true}`, and a wrong key gives
  `invalid_key`.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: there are no `src/` changes.
- R2: there is no schema change.
- R3: the KEK lives only in the server env and is removed from `process.env`. There are no `VITE_*` changes. The
  provider key goes only to the hard-coded `https://api.anthropic.com/v1/models/`, with `redirect:"error"`.
- R7: every changed file is in the plan's file list. The `work/ming-todo.md` plan-approval line is orchestrator
  bookkeeping.
- R8: the new pure logic (`mapClaudeError`, `checkClaudeKey`, `openStoredKey`, `parseTestBody`, `initAi`,
  `getSecret`) has tests.
- R10: untouched.
- R4, R5, R6 and R9 do not apply.

### Nits (do not block)
- `scripts/deploy-envfile.test.ts`, malformed cases: the inline comments are off by one. `KEK.slice(0, 42)` is 42
  characters, not "43 chars without '='", and `slice(0, 41) + "=="` is 41 + 2. Both values are still invalid, so the
  coverage holds.
- `server/ai/routes.js` `handleTest`: `openStoredKey` and `checkClaudeKey` sit inside the DB `try`/`catch`. Neither
  throws today, but if one ever did, it would be logged as `db_error`. Consider narrowing the `try` to `getSecret()`
  when T-019.3 touches this code.

### Follow-ups (out of scope)
- A1 cost: with Access off locally, the AI routes cannot be exercised by hand. If T-010 needs a dev escape hatch, it
  belongs to T-019.5 or T-010.
