## Attempt 1 — 2026-11-09

### Files touched
| File | Required because |
|---|---|
| `src/test/fakeSupabase.ts` (new) | Typed fake client: thenable query builder with scripted FIFO and call log, storage `vi.fn`s, `auth.getUser/signOut` |
| `src/data/repo.supabase.test.ts` (new) | `createSupabaseRepo` tests (list, locations, save + photo branches, remove, wear) |
| `src/data/useWardrobe.test.tsx` (new) | `renderHook` tests: local mode, `message()`, Supabase mode |
| `vitest.config.ts` | Replaced the `src/data/mappers.ts` threshold with the `src/data/**` glob threshold |
| `package.json`, `pnpm-lock.yaml` | `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2` (devDependencies, via `pnpm add -D`) |

### Tests added / changed
- `repo.supabase.test.ts`: 1 + list 6 + locations 3 + save 9 + photo 14 + remove 3 + wear 8 = all rows of the plan table.
- `useWardrobe.test.tsx`: 9 local-mode tests, `message` test, 4 Supabase-mode tests (getter-based `vi.mock` of `@/lib/supabase` worked, no fallback file).

### Checks (actual output summary)
- typecheck: `tsc --noEmit` exit 0
- format:check: "All matched files use the correct format."
- test: 11 files, 209 tests passed
- test:coverage: 209 passed; thresholds met (no threshold errors). Summary: Statements 100% (348/348), Branches 100% (291/291), Functions 100% (76/76), Lines 100% (293/293); "7 files fully covered"
- build: `vite build` ok

### Deviations from the plan
- `vitest.config.ts`: main had moved (F-401, F-004.1, F-601.1). Kept the `include` and threshold entries for `src/lib/text.ts` and `src/features/import-export/csv/parse.ts`; only swapped the `mappers.ts` entry for `"src/data/**"`. `filters.ts` entry kept.
- Table/view names in the tests are the real `tudo_*` names (`tudo_items_with_stats`, `tudo_items`, `tudo_locations`, `tudo_item_photos`, `tudo_wear_logs`); the plan used the unprefixed names.
- `src/data/demo.ts` (F-004.1) falls inside the `src/data/**` gate; `demo.test.ts` already covers it, so the aggregate is 100%. No scope change.
- `crypto.randomUUID` spy worked in jsdom; fixed UUID asserted.
- Not done (as planned): `@testing-library/jest-dom`; `ticket.md` Handoff left untouched per instruction.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
1. `copyPhoto`: if the `tudo_item_photos` insert fails, the copied file stays in storage (`uploadPrimary` cleans up).
2. `removePhotos` ignores `storage.remove` and photo-row `delete` errors.
3. `remove()` deletes photos before the item; if the item delete fails the item survives without its photo.
4. `save()` rejects when the re-fetch fails after a successful upsert.
5. `importMany` rejects at the first failure and adds none of the saved items to state until refresh.
6. F-101 auth tests (`cooldown.ts`, `authMessages.ts`) as a separate ticket (High-path tier).

### Scope self-check
- Could the diff be smaller? No; test-only plus config and dev dependencies.
- Diff size: ~3 new files (~900 lines incl. tests), config +1/-1, package.json +2.

## Attempt 2 — 2026-11-09 (REWORK)

### Files touched
- `src/data/repo.supabase.test.ts` — required because review Issue 1 (AC4) asked for call-log assertions. Test-only; no source change.

### Changes per finding (Issue 1)
Added call-log assertions to all 18 listed tests, using the existing `call()` / `methods()` helpers:
- list (5 tests): `order created_at desc` call on the items view.
- locations (2 tests): full 4-entry `tudo_locations` log.
- save/photo: blob URL (upload args + photo insert), insert-error (insert with `NEW_PATH`, `pending()` 0), no-user (items upsert, no photo calls), list-rows failure (`eq item_id`, no delete), copy insert error (insert call), external URL ok (insert with width/height), external URL fails (no photo calls, re-fetch `eq id`).
- remove delete-error: photo-rows delete index is lower than the `tudo_items` `eq id` index.
- wear: `-1` lookup error (order call, no delete, no ITEMS calls); two null/stats tests assert `select wear_count, last_worn`.
- Nits skipped (cosmetic, outside this rework).

### Check results
- typecheck: `tsc --noEmit` no errors
- format:check: "All matched files use the correct format."
- test: 209 passed (209)
- test:coverage: exit 0; Statements 100% (348/348), Branches 100% (291/291), Lines 100% (293/293)
- build: `vite build` built

### Scope self-check
Only the test file and this log changed.
