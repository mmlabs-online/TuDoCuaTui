## Attempt 1 — 2026-11-11

### Files touched
| File | Required because |
|---|---|
| `server/api.js` (new) | Router over the raw `pathname`, 405, CSRF, body, validation, 503, DB error mapping |
| `server/items.js` (new) | All parameterised SQL and `toItemRow` |
| `server/validate.js` (new) | Pure input validation, enum constants |
| `server/errors.js` (new) | `mapDbError`, `dbLogFields` |
| `server/http.js` | `readJson` (415/413/400) |
| `server/app.js` | Call `handleApi` after `access.verify`; `now` dep; widened `pool` JSDoc |
| `server/app.test.ts` | Moved two tests off `/api/items`; log-template test; 401-before-handler test |
| `server/api.test.ts`, `server/api.db.test.ts`, `server/validate.test.ts`, `server/errors.test.ts` (new) | Plan test list |
| `server/README.md` | Endpoint table, error codes, wire format, CSRF |
| `vitest.config.ts` | Thresholds on `validate.js` and `errors.js` |

### Tests added / changed
- `validate.test.ts`, `errors.test.ts`: every rule, reason and mapping row from the plan.
- `api.test.ts` (no DB): routing/raw pathname, 405 + Allow, bad id, CSRF, 415, 413 (declared and chunked, exact limit), invalid JSON/UTF-8, invalid bodies, `today` range, 503 without a pool, no-leak 500, 23503/ECONNREFUSED/23505 mapping, save rollback/release, no-connect pool, log route templates.
- `api.db.test.ts` (real Postgres): list/locations/PUT/DELETE/wear scenarios, NFC race (8 concurrent), location rollback, enum drift against `pg_enum`, SEASONS vs check constraint.
- `app.test.ts`: the three changes in the plan.

### Checks (actual output summary)
Local PostgreSQL 16 (scram password auth, temp data dir, removed afterwards).
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`)
- format:check: "All matched files use the correct format."
- test with DB: 55 files, 626 tests passed
- test without DB: 51 passed, 4 skipped files; 584 passed, 42 skipped
- `CI=true TEST_DATABASE_URL=... pnpm test:coverage`: 626 passed, thresholds met (exit 0); `validate.js` and `errors.js` are fully covered so the text reporter omits them
- build: pass
- Smoke: `TUDO_ACCESS_DISABLED=1 node server/index.js` against a migrated local DB, curl on each endpoint (GET items, GET locations, PUT, wear, PUT invalid -> 400, DELETE -> 204): all as expected, log lines show route templates only.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Plan follow-ups still apply (README fail-closed wording; request id on access_denied/readyz_failed; risk-tiers entries for `api.js`/`items.js`).

### Scope self-check
- Could the diff be smaller? Not without dropping planned behaviour. Production JS is 440 lines in the four new files (`api.js` 96, `items.js` 127, `validate.js` 173, `errors.js` 44), plus `http.js` +29 and `app.js` +14, about 483 in total. That is over the ~450 mark in A27 (oxfmt line wrapping inflates it); recorded here as A27 requires.
- Diff size: modified files +88 / -11; new files not counted.

## Attempt 2 (REWORK: security follow-ups from review.md)

### Files touched
| File | Required because |
|---|---|
| `server/validate.js` | Reject NUL in name, brand, size, material, notes, location_name, colors, tags, seasons (`invalidValue` + field) |
| `server/errors.js` | `22021` added to `BAD_INPUT` as backstop |
| `server/http.js` | `readJson` reads via `data`/`end` events; on overflow it removes the listener and pauses `req` instead of destroying it through the async iterator |
| `server/api.js` | On 413, destroy the socket on `res` `finish` (with `Connection: close`) so the JSON 413 is flushed first |
| `server/validate.test.ts`, `server/errors.test.ts`, `server/api.test.ts` | NUL cases for each field; 22021 -> 400; chunked upload in 20 delayed 64 KB writes still gets the JSON 413 |

### Checks
- typecheck: pass
- format:check: all matched files use the correct format
- test (local PostgreSQL 16, scram auth): 627 passed
- `CI=true pnpm test:coverage` (with DB): exit 0, thresholds met
- build: pass
- DB cluster stopped and deleted.

### Out-of-plan files
None.

### Follow-ups
None new.

### Scope self-check
Only the two listed items; about 25 production lines changed.
