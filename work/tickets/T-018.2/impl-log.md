# Implementation log — T-018.2

## Attempt 1 — 2026-11-13

### Files touched
| File | Required because |
|---|---|
| `server/ai/providerErrors.js` (new) | Ticket scope: `mapClaudeError(status)` |
| `server/ai/claude.js` (new) | Ticket scope: `checkClaudeKey`, pure adapter (C6) |
| `server/ai/crypto.js` | `openStoredKey`: one code for every open failure (G2) |
| `server/ai/store.js` | `getSecret()` (SQL only) + typedef |
| `server/ai/validate.js` | `parseTestBody`: body exactly `{}` (C3) |
| `server/ai/routes.js` | `POST /api/ai-settings/test` handler, `fetch` in `AiContext` |
| `server/ai/config.js` | `initAi`: G1 (`delete env.AI_KEK`) and Y1 (refuse when request auth off) |
| `server/api.js` | route match for `/api/ai-settings/test` (POST) |
| `server/app.js` | optional injected `fetch` in the `ai` dep |
| `server/index.js` | AI block uses `initAi` |
| `server/README.md` | `/test`, new codes, limits, Y1, `AI_KEK` row |
| `deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml` | `AI_KEK` secret mapping, format check, `printf`, comments |
| `deploy/deployment-repo/apps/tudocuatui/compose.yml` | comment only (C4) |
| `deploy/deployment-repo/README.md` | section "AI key encryption (T-018)" + setup PR row |
| `work/ming-todo.md` | M-16 |
| `work/tickets/T-019.3/ticket.md` | dated forward note (C5) |
| tests: `server/ai/{providerErrors,claude,crypto,validate,config,routes,store.db}.test.ts`, `server/index.cli.test.ts`, `scripts/deploy-envfile.test.ts` | Plan's *Tests to write* |

### Tests added / changed
- providerErrors.test.ts › maps Claude statuses
- claude.test.ts › pinned URL / x-api-key only; URL-encoded model; status mapping; body never read and cancelled; network, timeout
- crypto.test.ts › openStoredKey (not_configured, round trip, every failure -> key_unreadable, no logging)
- validate.test.ts › parseTestBody
- config.test.ts › initAi (4 cases)
- routes.test.ts › POST /test results, body and guards, rate limit, KEK off / store unavailable, sentinel (success, 401 echo, rejecting fetch, `{apiKey}` body), key_unreadable log fields
- store.db.test.ts › getSecret (skipped locally, see below)
- index.cli.test.ts › Access on + valid KEK = `ai configured`; Access off + valid KEK = `ai disabled: request auth off` and 503 (replaces the old "valid AI_KEK" test)
- deploy-envfile.test.ts › AI_KEK only; with Drive (order); unset/empty; malformed (10 cases, with and without Drive); independent of Drive; static: five secrets

### Checks (actual output summary)
- typecheck: pass (exit 0)
- format:check: pass (exit 0)
- test: 65 files passed, 6 skipped; 757 tests passed, 102 skipped
- test:coverage: same counts; thresholds met (All files 80.36 / 83.7 / 82.17 / 79.66)
- build: pass (`built in 274ms`)
- DB tests (`store.db.test.ts` and the other `*.db.test.ts`, the 6 skipped files) were SKIPPED: no `TEST_DATABASE_URL` / Postgres here. `getSecret` is unverified against real Postgres; CI must run it.
- `git diff main -- src/` is empty (R1).

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Setup PR `setup/tudocuatui-ai-kek` on `mmlabs-online/deployment` is for the orchestrator at DONE (A9).

### Scope self-check
- Could the diff be smaller? No; each file is in the plan.
- Diff size: about +660 / -35 lines (tests are the bulk).
