## Attempt 1 — 2026-11-09
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit`) — no errors.
- format:check: "All matched files use the correct format." (51 files).
- test: `pnpm test` — 11 files, 209 tests passed.
- test:coverage: `pnpm test:coverage` exit 0, no threshold errors. Summary: Statements 100% (348/348), Branches 100% (291/291), Functions 100% (76/76), Lines 100% (293/293). The text reporter hides fully covered files ("7 files fully covered"), so I listed files with a json-summary run into the scratchpad: `src/data/demo.ts`, `mappers.ts`, `repo.ts`, `useWardrobe.ts` all 100/100; `photos.ts` is absent. Matches impl-log.
- build: `pnpm build` — `vite build` ✓ built.
- Threshold spot check (plan AC3), run without renaming files: `pnpm exec vitest run --coverage --exclude src/data/repo.supabase.test.ts` → exit 1, `ERROR: Coverage for lines (71.57%) does not meet "src/data/**" threshold (80%)` (same for statements 68.08% and branches 67.69%). The gate works.
- `pnpm why react` → only `react@19.2.4`. `@testing-library/react@16.3.3` deduped onto it.

### Acceptance criteria
- [x] 1. `pnpm test` and `pnpm test:coverage` green locally. Evidence: both runs above. Both new files run; the totals match impl-log.
- [ ] 2. Green in CI. Can't be checked until the PR exists. `.github/workflows/ci.yml:28` already runs `pnpm test:coverage`, and `ci.yml` is unchanged. Check it on the PR.
- [x] 3. `src/data/**` gate. Evidence: `vitest.config.ts:35` `"src/data/**": thresholds` (80/80/80/75 at `vitest.config.ts:9`). The `mappers.ts` entry is gone. `filters.ts`, `text.ts` and `parse.ts` keep their own entries. The spot check above fails as expected.
- [ ] 4. Every test that hits the DB asserts the call log. **FAILED**, see Issue 1.
- [x] 5. Fake shape, one cast. Evidence: `src/test/fakeSupabase.ts` has no `any`. `grep "as unknown as SupabaseClient"` finds only `repo.supabase.test.ts:54` and `useWardrobe.test.tsx:48`. Grepping for `: any|as any` in the fake and the tests finds nothing.
- [x] 6. No behaviour change. Evidence: `git diff origin/main...HEAD -- src/data/repo.ts src/data/useWardrobe.ts src/lib/supabase.ts` is empty. Bugs are only pinned by "(records current behaviour)" tests.
- [x] 7. All checks green (see above).
- [x] 8. Single React. Evidence: `pnpm why react` shows 19.2.4 only. `package.json` devDependencies have `@testing-library/dom` `10.4.2` and `@testing-library/react` `16.3.3`, exact versions.

Scope: every changed file is in the plan's file list. `vitest.config.ts` keeps main's newer `text.ts`/`parse.ts` entries, which is justified in impl-log Deviations. Real `tudo_*` table names are correct, matching `repo.ts:110,123,140,184,244`. No unjustified out-of-plan change.

### Issues
#### Issue 1 — 🔴 blocker — AC4: call log not asserted in 18 DB-hitting tests
- **Where**: `src/data/repo.supabase.test.ts`, at these tests (line = `test(` line):
  - list: `:107` "does not call storage when no item has a photo", `:113` "uses an empty photo…", `:127` "returns [] when data is null", `:132` "throws the query error", `:138` "throws the signing error"
  - locations: `:158` "returns [] when data is null", `:163` "throws the query error"
  - save › photo: `:311` "blob: URL is uploaded too", `:335` "photo-row insert error removes the uploaded file and throws", `:344` "throws 'Chưa đăng nhập'…", `:367` "removing photos throws when listing photo rows fails", `:400` "copy row insert error throws and leaves the copied file", `:409` "an external http URL is uploaded best effort", `:416` "a failing external URL is ignored…"
  - remove: `:467` "throws the item delete error after photos are gone"
  - wear: `:544` "-1 throws the lookup error", `:557` "returns 0 and an empty string when stats are null", `:562` "throws the stats query error"
- **Expected**: The plan's AC4 verification row and ticket AC3 say every test that hits the DB has an `expect(fake.calls)…` / `toContainEqual` assertion on `{ table, method, args }`. The consult warned that a thenable FIFO fake hides which chain consumed a scripted result.
- **Actual**: These tests assert only the result, the rejection identity, or storage mocks. Nothing in them checks which table and chain produced the result. Some of them don't prove what their names claim:
  - `:467` says "after photos are gone" but never checks that the `tudo_item_photos` delete happened before the `tudo_items` delete.
  - `:335` never checks that the photo-row insert with `NEW_PATH` was attempted.
  - `:311` never checks the upload path.
- **Fix instruction**: Change only the test file. Add at least one call-log assertion to each test listed above, using the existing `call()` / `methods()` helpers. Use these where the test has a specific point:
  - `:107`/`:113`/`:127`/`:132`/`:138`: `expect(fake.calls).toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }))`, or `toEqual` on the full 3-entry log as in `:93`.
  - `:158`/`:163`: `toEqual` on the 4-entry `tudo_locations` log as in `:150`.
  - `:311`: `expect(fake.storage.upload).toHaveBeenCalledWith(NEW_PATH, resized, { contentType: "image/jpeg", upsert: false })`, plus the `tudo_item_photos` insert call with `storage_path: NEW_PATH`.
  - `:335`: `toContainEqual(call("tudo_item_photos", "insert", { item_id: ID, storage_path: NEW_PATH, is_primary: true, width: 800, height: 600 }))` and `fake.pending()` is 0.
  - `:344`: `toContainEqual(call("tudo_items", "upsert", itemToRow(item, null)))` and `methods("tudo_item_photos")` equals `[]`.
  - `:367`: `toContainEqual(call("tudo_item_photos", "eq", "item_id", ID))` and `methods("tudo_item_photos")` does not contain `"delete"`.
  - `:400`: `toContainEqual(call("tudo_item_photos", "insert", { item_id: ID, storage_path: NEW_PATH, is_primary: true }))`.
  - `:409`: the insert call with `NEW_PATH` and `width`/`height`.
  - `:416`: `methods("tudo_item_photos")` equals `[]`, and the log contains `call(ITEMS, "eq", "id", ID)`.
  - `:467`: `fake.calls` contains `call("tudo_item_photos", "delete")`, and its index is lower than the index of `call("tudo_items", "eq", "id", ID)`.
  - `:544`: `toContainEqual(call("tudo_wear_logs", "order", "worn_on", { ascending: false }))` and no `delete` or `ITEMS` calls.
  - `:557`/`:562`: `toContainEqual(call(ITEMS, "select", "wear_count, last_worn"))`.

  Re-run all checks and paste the results into impl-log Attempt 2.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: local mode is untouched. Local-mode hook tests run on the real local repo, and the `supabase` getter mock is reset to `null` in `useWardrobe.test.tsx:57-60`.
- R3: no secrets.
- R4: the `{user}/{item}/{uuid}.jpg` path is asserted at `repo.supabase.test.ts:282,380`.
- R5: wear stats come from `tudo_items_with_stats` (`:492-504`).
- R7: no source change.
- R10: `vite.config.ts`, `AGENTS.md` and `.figma/` are untouched.

R8 is otherwise met, apart from Issue 1. R2, R6 and R9 do not apply.

### Nits (do not block)
- `src/test/fakeSupabase.ts:36,56-67` uses casts (`{} as Builder`, `null as unknown`). Plan Approach step 2 says "no cast inside the module". AC5's grep (no `any`, no `SupabaseClient` cast) still passes, so this is cosmetic.
- `useWardrobe.test.tsx:221` filters upserts by method only. `c.table === "tudo_items"` would make it exact.
- The `test:coverage` text report shows only totals because v8 `skipFull` hides fully covered files. To show `repo.ts`/`useWardrobe.ts` as the plan expected, a reader would need the HTML report. No change needed.

### Follow-ups (out of scope)
- Same list as impl-log: the `copyPhoto` orphan on insert failure, `removePhotos` ignoring errors, `remove()` ordering, `save()` re-fetch failure after upsert, `importMany` partial state, and the F-101 auth tests ticket.

## Attempt 2 — 2026-11-09
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `pnpm typecheck` (`tsc --noEmit`) — no errors.
- format:check: "All matched files use the correct format." (51 files).
- test: `pnpm test` — Test Files 11 passed (11), Tests 209 passed (209).
- test:coverage: `pnpm test:coverage` exit 0. Statements 100% (348/348), Branches 100% (291/291), Functions 100% (76/76), Lines 100% (293/293). "7 files fully covered."
- build: `pnpm build` — `vite build` ✓ built (index JS 227.94 kB).
- Threshold spot check (AC3): `pnpm exec vitest run --coverage --exclude src/data/repo.supabase.test.ts` still fails on the `src/data/**` gate (lines 71.57%, statements 68.08%, branches 67.69%). The gate still works.
- These results match impl-log Attempt 2.

### Scope
The rework commit `7cb660c` touches only `src/data/repo.supabase.test.ts` (+81/−3) and `impl-log.md`. Commit `8338031` is the orchestrator moving ticket.md's state to REVIEW. `git diff origin/main...HEAD -- src/data/repo.ts src/data/useWardrobe.ts src/lib/supabase.ts` is still empty, so there is no behaviour change (AC6). The rest of the branch diff is unchanged from Attempt 1.

### Attempt 1 Issue 1 (AC4): resolved
All 18 tests now assert the call log. Line numbers below are the current `test(` lines in `src/data/repo.supabase.test.ts`. `ITEMS` = `tudo_items_with_stats` (`:17`), which matches `repo.ts:110,184,265`.
- list `:107`, `:114`, `:129`, `:135`, `:142`: each has `toContainEqual(call(ITEMS, "order", "created_at", { ascending: false }))`.
- locations `:163`, `:174`: each has `toEqual` on the full 4-entry `tudo_locations` log (from, select name, order sort_order, order name).
- save › photo:
  - `:328`: `storage.upload` called with `(NEW_PATH, resized, { contentType: "image/jpeg", upsert: false })`, and the `tudo_item_photos` insert with `storage_path: NEW_PATH`, width 800, height 600.
  - `:365`: asserts the insert with `NEW_PATH` and `fake.pending()` is 0.
  - `:384`: asserts the `tudo_items` upsert with `itemToRow(item, null)` and `methods("tudo_item_photos")` equals `[]`.
  - `:408`: asserts `eq("item_id", ID)` on `tudo_item_photos` and that the log has no `delete`.
  - `:443`: asserts the insert `{ item_id, storage_path: NEW_PATH, is_primary: true }`.
  - `:459`: asserts the insert with `NEW_PATH` and width/height.
  - `:475`: asserts there are no `tudo_item_photos` calls and that the re-fetch `call(ITEMS, "eq", "id", ID)` happened.
- remove `:528`: the index of the `tudo_item_photos` `delete` is above -1 and below the index of the first `tudo_items` `eq`. That entry is asserted to be `call("tudo_items", "eq", "id", ID)`, so the test now proves the "after photos are gone" ordering.
- wear:
  - `:612`: asserts `order("worn_on", { ascending: false })` on `tudo_wear_logs`, no `delete`, and no `ITEMS` calls.
  - `:630` and `:636`: each asserts `call(ITEMS, "select", "wear_count, last_worn")`.

Every assertion matches the fix instruction from Attempt 1. Expected args match the source in `repo.ts`. The tests pass, so the asserted chains are the ones that actually ran.

### Acceptance criteria
- [x] 1. `pnpm test` and `pnpm test:coverage` green locally (above).
- [ ] 2. Green in CI. Can't be checked until the PR exists; `.github/workflows/ci.yml:28` runs `pnpm test:coverage`. Check it on the PR.
- [x] 3. `src/data/**` gate works (`vitest.config.ts:35`, plus the spot check above).
- [x] 4. Every test that hits the DB asserts the call log (see above).
- [x] 5. Fake shape with one cast. No change since Attempt 1.
- [x] 6. No behaviour change (empty source diff).
- [x] 7. All checks green.
- [x] 8. Single React. No dependency change in this attempt.

### Rules R1–R10 (CLAUDE.md)
No violations. This attempt changed only a test file. R1 is unaffected, R7 holds, and R8 is now fully met.

### Nits (do not block)
- These Attempt 1 nits are still open and were deliberately skipped: the casts in `src/test/fakeSupabase.ts:36,56-67` and the method-only upsert filter at `useWardrobe.test.tsx:221`.
- `repo.supabase.test.ts:528`: the `itemEq` lookup takes the first `tudo_items` `eq`. That is fine today because `remove()` has only one, but it would get fragile if more were added.

### Follow-ups (out of scope)
- Same as Attempt 1: the `copyPhoto` orphan on insert failure, `removePhotos` ignoring errors, `remove()` ordering, `save()` re-fetch failure after upsert, `importMany` partial state, and the F-101 auth tests ticket.
