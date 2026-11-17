## Attempt 1 — 2026-11-17

Slice F-602.1 (server only), plan approved with all 8 defaults (D49).

### Files touched
| File | Required because |
|---|---|
| `server/backup.js` (new) | `GET /api/backup`, `POST /api/restore` handler, `exportBackup`, `restoreBackup`, `uuidv5` / `derivedId`, limits constants |
| `server/validate.js` | `BACKUP_CAPS` and `parseBackup` (reuses `parseItemInput` per row) |
| `server/api.js` | two `match()` entries and one early branch to `handleBackup` after the `Sec-Fetch-Site` check; ctx typedef gets `backup` |
| `server/app.js` | builds the `backup` context (1 in flight per user and in total, restore limiter, body timeouts); new optional dep `restoreBodyTimeouts` (default `RESTORE_BODY_TIMEOUTS`) so tests can use short timeouts |
| `server/ai/rateLimit.js` | `createLimiter` accepts optional `limits` / `globalLimits`; kinds come from the keys; AI defaults unchanged |
| `server/http.js` | `readJson(req, { limit, timeouts })`: opt-in 408 `request_timeout`; unchanged without `timeouts` |
| `server/README.md` | documents the two endpoints, format, summary, limits, new reasons |
| `server/backup.db.test.ts` (new) | AC1-AC4 and export scope against real Postgres (NOSUPERUSER owner role, RLS applies) |
| `server/backup.test.ts` (new) | uuidv5 / derivedId and handler limits without a DB |
| `server/validate.test.ts` | `parseBackup` cases |
| `server/ai/rateLimit.test.ts` | custom-limits cases |
| `server/http.test.ts` (new) | `readJson` timeouts |

### Tests added / changed
- `server/validate.test.ts` › parseBackup (11 cases: shape and key whitelist, NFC names, version/top-level keys, lists and caps, ids and duplicates, item rule reuse with indexed fields, timestamps, location rules incl. cycle, references, wear logs, photo_id)
- `server/ai/rateLimit.test.ts` › limiter with custom limits (2 cases)
- `server/http.test.ts` › readJson (idle 408, total 408, unchanged default and 413, normal body with timeouts, 415/400)
- `server/backup.test.ts` › uuidv5 RFC vector, derivedId properties, handler: 503, 405, 403 cross-site, 415, 413 by Content-Length, 400 invalid_input, 400 invalid_json, 503 after validation, 503 restore_busy + Retry-After, 429 and slot released, 408 and slot released, log fields
- `server/backup.db.test.ts` › export scope; AC1 delete items; AC1 full wipe; AC2 same account; overwrite keeps photos and later wear logs; AC3 + AC2 cross account; location merge by name; clashing rename skipped; parent_id remap; foreign wear-log id; squatted derived id; AC4 all derived ids squatted (409, zero rows); AC4 invalid file (400, zero rows); AC4 over cap (413, zero rows); near caps (3000 items, 50 000 wear logs, about 1.5 s, no 57014)

### Checks (actual output summary)
Run in a native WSL copy of the repo (`~/f602`, `pnpm install --frozen-lockfile`), because `node_modules` in the Windows checkout was being replaced by a Windows-side install (win32 bindings) during this run. The copy holds the same files as the commit.
- typecheck: `pnpm typecheck` passes (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- format:check: "All matched files use the correct format."
- test: `pnpm test` with `TEST_DATABASE_URL` pointing at a throwaway `postgres:16` container (port 55432, stopped afterwards): 117 files, 1511 tests passed, 0 failed, 0 skipped. The DB suites ran (not skipped): `server/backup.db.test.ts` 15 tests passed. In this native-filesystem copy the 15 known CLI spawn timeouts and the flaky tagPhoto 413 test did not fail. On the first run (inside the `/mnt/d` checkout) they did fail as known; one failure there was mine (`scoping.test.ts`: the string `app.user_id` in a `backup.js` comment) and is fixed.
- build: `pnpm build` passes (vite build).

### Out-of-plan files
None. (`server/app.js` gained the optional `restoreBodyTimeouts` dep, which is inside the planned file.)

### Follow-ups (noticed, not done)
- `debt` issue (planned): `readJson` has no body timeouts on the other JSON routes (`PUT /api/items/:id`, `POST .../wear`, ai-settings).
- Restore is order-dependent for two owned locations whose names are swapped in the file: the first rename is skipped (name held by the other row), a second restore converges. No error, documented behaviour is "skipped, no error".
- Restore does not clean up locations or items absent from the file (adds and overwrites only); F-602.2 copy must say so.
- A security review (`security-ai-generated-code-auditor`) on this diff is still to be run by the orchestrator (write endpoint, cross-user id handling).
- The Windows checkout's `node_modules` currently holds a Windows-side install (`.CMD` shims, win32 bindings); under WSL it needs `pnpm install` again.

### Scope self-check
- Could the diff be smaller? No: `backup.js` and `parseBackup` are the feature; the other files carry only the wiring the plan lists.
- Diff size: non-test code about +680 / -24 (`backup.js` 453 lines, `validate.js` +165, `http.js` +34 net, small edits elsewhere); tests about +730 lines.

### Attempt 1 addendum (resume run, Windows checkout)
- Reviewed the working tree against plan.md: nothing missing, nothing outside the plan.
- Only code change: `server/backup.db.test.ts` casts `res.json()` results to `any` (2 places) to fix two `tsc` errors (TS18046 / TS2571) that appeared in the Windows checkout.
- Windows checks (reinstalled `node_modules` natively, `pnpm install --frozen-lockfile`; throwaway `postgres:16` container on port 55433, stopped afterwards, `TEST_DATABASE_URL` set): typecheck passes, format check passes, build passes. `pnpm test`: 1489 passed, 13 skipped, 9 failed. All 9 are Windows-environment failures unrelated to this diff: early-close 413 tests (`fetch failed` / ECONNRESET: `api.test.ts`, `api.db.test.ts`, `tagPhoto.test.ts` x3, and my `backup.db.test.ts` "AC4: a body over the cap" with the same mechanism), `index.cli.test.ts` SIGTERM exit code, `scoping.test.ts` (backslash path separators), `boundary.test.ts`. The 413 case passes in the WSL run above (15/15 in `backup.db.test.ts`).
- Note: the Windows `node_modules` is now a Windows-native install; WSL needs `pnpm install` again.
