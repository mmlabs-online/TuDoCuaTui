
## Attempt 1 — 2026-11-10 (slice T-013.1)

### Files touched
| File | Required because |
|---|---|
| `server/index.js` | Entry point, env, signals, fixed log lines |
| `server/app.js` | Router, headers, request id, JSON log line |
| `server/http.js` | `sendJson`/`sendError`, security headers |
| `server/static.js` | Path-safe static serving, nginx caching rules |
| `server/access.js` | `loadAccessConfig`, jose JWT verifier |
| `server/db.js` | Pool (max 5, timeouts, date parser), `ping` |
| `server/*.test.ts` (static, access, db, app, app.db, index.cli) | Plan test list |
| `package.json`, `pnpm-lock.yaml` | `jose` ^6 (6.2.17), `start` script |
| `vitest.config.ts` | Thresholds for static/access/http |
| `work/ming-todo.md` | M-13 |

`server/README.md` added after the first commit (start contract, env, logging rules).

### Tests added / changed
- static, access, db, app, app.db, index.cli tests per the plan list (plus a few small extras: HEAD, index-missing 404, pool error code-only, 500 internal, `/api` 401 over a real port with Access on).

### Checks (actual output summary)
- typecheck: clean (tsc app + server)
- format:check: all files correct
- test without DB: 48 files passed, 3 skipped; 543 passed, 27 skipped
- test with local PostgreSQL 16 (scram password auth, TEST_DATABASE_URL): 51 files, 570 passed
- test:coverage (CI=true + DB): 570 passed, thresholds met (static.js 96/93.75/85.7/100, app.js 97.5, db.js 100)
- build: ok
- manual `node server/index.js` (no DATABASE_URL, TUDO_ACCESS_DISABLED=1): `/` and `/some/deep/path` 200 text/html no-cache; real asset 200 immutable; missing asset 404; `/healthz` 200; `/readyz` 503; `/api` 404 JSON (access off). With CF_ACCESS_* set: `/api` 401 JSON. `/version.txt` is not in a local build (written at release) so it falls back to index.html; the rule is covered by static.test.ts. All carry the security headers.
- Postgres was stopped and its data dir deleted afterwards.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Plan follow-ups: risk-tiers entries, gzip/ETag, T-015 healthcheck and check-image rewrite.

### Scope self-check
- Deviation: `access.verify` returns `{ ok, code? }` instead of `boolean`, so the caller can log the jose error code as the plan requires. `createPool` takes an optional `log` for the pool error handler.
- Could the diff be smaller? No.

## Attempt 2 — 2026-11-11

Fixes only the two "Security follow-ups to fix" in review.md.

### Files touched
- `server/static.js` — required because: `stream.pipe(res)` leaked the file descriptor on aborted downloads; now `pipeline(fs.createReadStream(file), res, () => {})` cleans up both sides.
- `server/app.js` — required because: request targets not starting with `/` (absolute-form, `*`) now get 400 `bad_request`; single `pathname` stays the source for the `/api` guard.
- `server/app.test.ts` — required because: new test sends raw absolute-form and `*` requests and expects 400.
- `server/README.md` — required because: note that T-013.2 must dispatch from the same `pathname` inside the guarded `/api` branch.

### Tests added
- app.test: non-origin-form targets -> 400 bad_request. No test for the pipeline change (an aborted-download fd leak is not practical to assert).

### Check results (local PostgreSQL 16, TEST_DATABASE_URL set, then stopped and deleted)
- typecheck: pass. format:check: all matched files correct.
- test: 51 files, 571 tests passed. `CI=true pnpm test:coverage`: 51 files, 571 tests passed. build: ok.

### Out-of-plan files
None.

### Follow-ups
None.

### Scope self-check
- Only the two listed items changed. Smaller diff not possible.
