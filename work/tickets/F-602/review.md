## Attempt 1 — 2026-11-17
Verdict: REWORK

Reviewed: slice F-602.1 (server only), branch `ticket/F-602` at `41d6aff`, diff vs `origin/main`. Checks run in a
fresh native WSL clone of that commit (`pnpm install --frozen-lockfile`) against a throwaway `postgres:16`
container (127.0.0.1, removed afterwards). Clone and container are gone.

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json`) exit 0.
- format:check: "All matched files use the correct format." exit 0.
- test: `pnpm test` with `TEST_DATABASE_URL` set: 117 files passed, **1511 passed, 0 failed, 0 skipped**. Verbose
  run of the 5 touched suites: 85 passed; `server/backup.db.test.ts` 15/15 passed (not skipped; near-cap case
  1.39 s). Matches impl-log. (A first run whose container failed to bind its port skipped the DB suites; that run
  is discarded.)
- build: `pnpm build` exit 0.

### Acceptance criteria (plan.md verification table)
- [x] AC1 export → delete → restore → export identical (except `exportedAt`, `photo_id`) —
  `backup.db.test.ts` "AC1: export, delete items, restore…" and "AC1: full wipe including locations round-trips"
  pass; `wear_count`/`last_worn` compared via `items_with_stats` (R5).
- [ ] AC2 restoring the same file twice changes nothing — the two DB tests pass for files the server itself
  exported, but a file that passes `parseBackup` with upper-case ids is **not** handled correctly: the first
  restore writes a duplicate item. See Issue 1.
- [x] AC3 cross-account — "AC3: B restores A's file…" passes (A snapshot identical, B ids derived, refs remapped,
  `item_photos` for B empty, `photosMissing` = 1, second run unchanged); plus merge-by-name, parent remap, foreign
  wear-log id, squatted derived id tests.
- [x] AC4 server half (invalid / oversized / mid-transaction failure writes nothing) — "AC4: every derived id
  squatted -> 409", "AC4: an invalid file -> 400 … zero rows", "AC4: a body over the cap -> 413 … zero rows";
  `validate.test.ts` parseBackup cases. (Issue 2 is a validation gap with a safe outcome, not a failed AC.)
- [x] AC5 limits — `backup.test.ts` 415, 413 by Content-Length, 400, 503 `restore_busy` + `Retry-After`, 429 with
  slot released, 408 with slot released; `rateLimit.test.ts` custom limits; wiring read in `server/app.js:52-62`
  (`perUser: 1, total: 1, exempt: ownerSub`, 10/h user, 60/h global, 60 s / 10 s body timeouts, per D49).
- [x] AC6 export scoped, no derived/secret fields — "export: caller's rows only, exact keys…" passes.
- Other things checked: no `item_photos` write anywhere in `server/backup.js` (only a read of
  `items_with_stats.primary_photo_id`); no `ON CONFLICT DO UPDATE`; every write is `ON CONFLICT DO NOTHING` or an
  `IS DISTINCT FROM`-guarded, `user_id`-scoped UPDATE; `parent_id <> id` guarded (`backup.js:242`); advisory xact
  lock first; slot released in `finally`; log line carries counts only. Router keeps the `Sec-Fetch-Site` guard
  for POST (`api.js:97-102`).

### Issues
#### Issue 1 — 🔴 blocker — correctness / idempotency (upper-case UUIDs create duplicate items)
- **Where**: `server/validate.js:243` (`reqId` returns the id as given; `UUID` regex is case-insensitive, line 41)
  together with the string comparisons in `server/backup.js:181`, `:293`, `:303`, `:333`.
- **Expected**: any file `parseBackup` accepts restores without duplicates and with correct counts.
- **Actual** (reviewer probe against real Postgres, owner role, RLS on): a file with one location, one item and one
  wear log whose ids are upper case (`AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA`, …) returns 200 but writes **two**
  items: one at `aaaaaaaa-…` (file id, inserted, then not recognised as owned because Postgres returns lower case
  and `ownedIds.has(p.cand)` compares against the upper-case candidate) and one at the derived id
  `f3235ba7-…` that carries the wear log. Summary says `items.inserted: 1, remapped: 1` and
  `wearLogs: { inserted: 1, unchanged: 1 }` for a single log. The orphan duplicate stays forever (second run:
  `n = 2`, no further change).
- **Fix instruction**: in `parseBackup`, normalise every id to lower case where it is read (make `reqId` return
  `v.toLowerCase()`; `optId` goes through it), before the duplicate checks and reference sets, so `locIds`,
  `itemIds`, `parent_id`, `location_id`, `item_id`, `photo_id` all compare in one form. Add a
  `validate.test.ts` case (upper-case ids come out lower case; `A…`/`a…` in one list → `duplicateId`) and a
  `backup.db.test.ts` case: a file with upper-case ids restores to exactly 1 location / 1 item / 1 wear log with
  `items.remapped: 0`, and a second restore is unchanged.

#### Issue 2 — 🟡 should-fix — validation gap reaches the SQL layer inside the restore transaction
- **Where**: `server/validate.js` (`parseBackup` string fields, incl. those it gets from `parseItemInput`) and
  `server/backup.js:129/:137/:328` (`jsonb_to_recordset($2::jsonb)`).
- **Expected**: plan step 5, "never trigger a SQL error" inside the restore transaction; bad input answers 400
  `invalid_input` **with** `field` and `reason` from validation.
- **Actual** (probe): an item `name` containing a lone surrogate escape (`"A\ud800B"`, valid JSON) passes
  `parseBackup`; `JSON.stringify` re-emits `\ud800`, Postgres rejects it while parsing the jsonb parameter, the
  transaction rolls back (0 rows, safe) and the client gets 400 `invalid_input` with no `field`/`reason`. The same
  character in a location name (bound as a text parameter) is silently stored as U+FFFD instead.
- **Fix instruction**: in `parseBackup`, reject any string value that is not well-formed UTF-16
  (`!s.isWellFormed()`, Node 22) with reason `invalidValue` and the indexed field — location `name`, and for items
  every string and string-array element the row carries (`name`, `brand`, `size`, `material`, `notes`, `colors[]`,
  `seasons[]`, `tags[]`). Do it in `parseBackup` (e.g. a check over the parsed item value) rather than changing
  `parseItemInput`, so the PUT path is untouched (R7). Add one `validate.test.ts` case per kind (item field,
  array element, location name).

### Rules R1–R10 (CLAUDE.md)
No violations found. R1: no client code in this slice. R2 (Postgres equivalent): no migration; every query runs in
`withUser` and filters `user_id = $caller`. R3: no secrets. R4: no Drive call, no `item_photos` write. R5:
`wear_count`/`last_worn` not exported, recomputed by the view (tested). R6: server returns codes/reasons only.
R7: every changed file is in plan.md's file list (`work/ming-todo.md` / `ticket.md` are workflow files);
`restoreBodyTimeouts` dep in `app.js` is inside a planned file and justified in impl-log. R8: new logic has unit
and DB tests (gap per Issue 1). R9/R10: n/a.

### Nits (do not block)
- 💭 `backup.db.test.ts:327` is named "…; the rerun is a no-op" but never reruns (the cross-account rerun is
  covered in the AC3 test). Either add the second `restoreOk("b", file)` + snapshot compare, or rename.
- 💭 `backup.js` UPDATE of a location sends `name = mine.name` when only `sort_order` changed; harmless, but
  `set sort_order = $4` alone would be clearer.

### Follow-ups (out of scope)
- `debt` issue (already planned): `readJson` body timeouts on the other JSON routes.
- Order-dependent rename of two owned locations whose names are swapped in the file (converges on a second run;
  noted in impl-log).
- The orchestrator still owes the `security-ai-generated-code-auditor` pass on this diff (ticket requirement);
  an untracked `work/tickets/F-602/security-review.md` exists in the Windows checkout and was not read for this
  verdict.

### Ming verification after merge (carried to the PR)
- None for this slice alone (no UI uses the endpoints). Optional: `GET /api/backup` with a signed-in session on the
  deployed app returns the JSON. The manual export → delete → restore → export diff belongs to F-602.2.

## Attempt 2 — 2026-11-17
Verdict: PASS

Reviewed: slice F-602.1 (server only), rework commit `c135a89`, branch `ticket/F-602` at `d63b493`
(= `origin/ticket/F-602`), diff vs `origin/main`. Checks were run in a fresh native WSL clone of the remote branch
(`pnpm install --frozen-lockfile`) against a throwaway `postgres:16` container on 127.0.0.1:55447. The clone and
the container have been removed. The branch merges cleanly into the current `origin/main` (`git merge-tree`).

### Checks (run by reviewer)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` exit 0.
- format:check: "All matched files use the correct format." exit 0.
- test: `pnpm test` with `TEST_DATABASE_URL` set: 117 files passed, **1514 passed, 0 failed**. This matches the
  impl-log. A verbose run of the 5 touched suites gave 88 passed. `server/backup.db.test.ts` ran 16 tests, none
  skipped, including the new "upper-case ids in the file restore to one of each, ids kept lower case, rerun changes
  nothing" (69 ms) and the near-cap case (1.38 s).
- build: `pnpm build` exit 0.

### Rework verification
- **Issue 1 (= security S1), fixed.** `server/validate.js:245-246`: `reqId` now returns `v.toLowerCase()`, and
  `optId` goes through it. So location, item and wear-log ids, `parent_id`, `location_id`, `item_id` and
  `photo_id` are all lower case before the duplicate and reference checks. Reviewer probe against real Postgres
  (owner role, RLS on):
  - The attempt-1 file (upper-case location, item and wear-log ids) now gives 200 with `items.inserted: 1,
    remapped: 0` and `wearLogs.inserted: 1`. Rows are exactly 1/1/1. The second run reports everything
    `unchanged`, and the snapshot is identical. In attempt 1 this wrote 2 items.
  - User A's own export with every UUID upper-cased, restored by A: all `unchanged`, snapshot identical. Restored
    by B: 2/3/4 rows with derived ids. B's second run leaves the rows unchanged.
  - New tests: `validate.test.ts` "lower-cases every id; A and a in one list are a duplicate", and the
    `backup.db.test.ts` case above.
- **Issue 2, fixed.** `server/validate.js:50` adds `lone()` (`/\p{Surrogate}/u`, which matches only unpaired
  surrogates in `u` mode). It is checked at `:263` for the location name, and at `:312-322` on every string and
  string-array element of the parsed item value. `parseItemInput` and the PUT path are unchanged. Reviewer probe
  (raw JSON body with `\uD800`/`\uDC00`/`\uDFFF` escapes) covered item `name`, `tags[1]`, `notes` and location
  `name`. Each gives 400 `{code: "invalid_input", field: "items[0].name" | "items[0].tags[1]" | "items[0].notes" |
  "locations[0].name", reason: "invalidValue"}` with 0 rows. The only log lines are the restore event
  (`code: invalid_input`) and the access line. There is no DB error line, so the request never reached SQL. A
  valid surrogate pair (emoji in a name) still restores with 200. New test: `validate.test.ts` "rejects lone
  surrogates with field and reason" (item field, array element, location name).
- Nit 1 from attempt 1 was handled: the test was renamed. The AC3 test and the probe cover the cross-account
  rerun.

### Acceptance criteria (plan.md verification table)
- [x] AC1: `backup.db.test.ts` "AC1: export, delete items, restore…" and "AC1: full wipe…" pass.
- [x] AC2: "AC2 same account…" passes, and so does the upper-case-id rerun test. The reviewer probe shows
  hand-edited upper-case files are now idempotent too.
- [x] AC3: "AC3: B restores A's file…" passes, plus the merge-by-name, parent-remap, foreign wear-log id and
  squatted derived id tests.
- [x] AC4 (server half): "AC4: every derived id squatted -> 409", "AC4: an invalid file -> 400 …", "AC4: a body
  over the cap -> 413 …" and the `parseBackup` unit cases pass. Lone surrogates now fail in validation.
- [x] AC5: the `backup.test.ts` limit cases (415/413/400/503/429/408) and the `rateLimit.test.ts` custom limits
  pass. The wiring in `server/app.js` is unchanged since attempt 1.
- [x] AC6: "export: caller's rows only, exact keys…" passes.

### Scope
The rework touched `server/validate.js`, `server/validate.test.ts` and `server/backup.db.test.ts`, which are all
in the plan's file list, plus the ticket workflow files. No out-of-plan change.

### Rules R1–R10
No violations. R1/R3/R4/R9: no change from attempt 1 (no client code, no secrets, no photo writes). R2: no
migration. R5: derived values still come from the view. R6: the server returns codes and reasons only. R7: the
rework is limited to the two issues and the test rename. R8: the new logic has unit tests and DB tests.

### Nits (do not block)
- 💭 (carried) The `backup.js` location UPDATE still sends `name = mine.name` when only `sort_order` changed.
  This is harmless.

### Follow-ups (out of scope)
Carried from attempt 1 and the security review:
- A `debt` issue for `readJson` body timeouts on the other JSON routes.
- The order-dependent swap of two owned location names (it converges on a second run).
- Security N7: the global restore slot (`total: 1`) together with the 60 s slow-body window. Revisit if sign-up
  opens beyond invited users.
- Security N8: export is not bounded by `BACKUP_CAPS`. An account with more than 3000 items exports a file that
  restore rejects. Cover this in F-602.2 copy or a debt issue.

### Ming verification after merge (carried to the PR)
- Nothing is required for this slice alone, because no UI uses the endpoints yet. Optional check: `GET
  /api/backup` with a signed-in session on the deployed app returns the JSON. The manual export → delete →
  restore → export diff belongs to F-602.2.
