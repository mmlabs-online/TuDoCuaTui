## Attempt 1 — 2026-11-17
Verdict: PASS

### Checks (run by reviewer)
Run on `ticket/F-702` @ 24f1286, Windows 11, Node 22.23.5, pnpm 10.34.9.
- typecheck: clean (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0).
- format:check: "All matched files use the correct format." (274 files).
- test: 5 files / 7 tests failed, 1294 passed, 218 skipped (116 files). All 7 failures are outside this diff:
  `server/ai/tagPhoto.test.ts` (3, ECONNRESET on the 413 upload guards), `server/api.test.ts` (1, ECONNRESET on
  the 256 KB body test), `server/index.cli.test.ts` (1, SIGTERM exit code `null` on Windows), `server/scoping.test.ts`
  (1, `ai\catalog.js` backslash paths), `src/features/auth/boundary.test.ts` (1, `src\main.tsx` backslash path).
  **Baseline verified by the reviewer:** a detached worktree of `origin/main` @ a96a682 (merge-base 4471489 plus two
  board-only commits), fresh `pnpm install --frozen-lockfile`, `pnpm test` → the **same 7 tests in the same 5 files**
  fail (7 failed / 1237 passed / 218 skipped, 114 files), including the same unhandled `UND_ERR_SOCKET` rejection from
  `server/ai/tagPhoto.test.ts`. The branch adds 57 passing tests and 2 test files; it introduces no new failure. The
  failures are pre-existing Windows-environment issues (socket resets, `path.sep`), not caused by F-702.
  F-702 files alone (`aiTagging`, `aiFill`, `Editor`, `App` tests, verbose): 4 files, 114 tests passed.
- build: `vite build` ok.
- impl-log says "6 files / 8 tests failed, 1293 passed"; my run has 5 / 7 / 1294. The extra failure in the implementer's
  run is one more ECONNRESET in the same out-of-diff socket tests (flaky on Windows); the implementer's own baseline
  also reported 7. Not treated as a blocker; noted for accuracy.
- `git diff --stat origin/main...HEAD -- server db supabase package.json pnpm-lock.yaml`: empty.

### Acceptance criteria
- [x] AC1 Only empty fields are filled; existing input is never overwritten — evidence: `aiFill.test.ts › fillEmpty ›
  fills every empty field / treats a whitespace-only string as empty / never overwrites typed values / fills category
  only when fillable / skips fields with no suggestion and never touches other fields` ✓; `Editor.test.tsx › AI fill ›
  fills only empty fields` ✓ (updated keys are exactly `brand, material, seasons, tags`; never name/colors/category);
  `› new item: category filled unless the user picked one` ✓. Code: `src/features/items/aiFill.ts` `fillEmpty`.
- [x] AC2 Undo restores the previous values — evidence: `aiFill.test.ts › undoFill` (3 tests) ✓; `Editor.test.tsx › AI
  fill › "Hoàn tác" restores the previous values` ✓ (update called with `name ""`, `category "Áo"`, `colors []`,
  `tags []`; undo button gone).
- [x] AC3 Without settings/key the button explains setup, "chưa cài đặt AI" → Settings link — evidence:
  `aiFill.test.ts › aiAvailability › no settings or no key -> no_key, even without a photo` ✓; `Editor.test.tsx › AI
  fill › no settings… / no key: button disabled, explains setup, opens settings` ✓; `› error not_configured shows its
  Vietnamese message` ✓ (link shown); `App.test.tsx › AI fill › "Mở cài đặt" opens the AI settings modal over the
  editor; closing it reloads the settings` ✓.
- [x] AC4 Calls F-701 correctly (resized JPEG, bearer, debounce, loading, Vietnamese errors) — evidence:
  `aiTagging.test.ts` 11 tests ✓ (request shape, every server code, unknown → internal with requestId, bearer + 401
  retry, 401 twice → onAuthLost, network, abort); `Editor.test.tsx › resizes the photo before posting`, `› a second tap
  while pending sends nothing` (aria-busy, disabled, loading label), `› error <code>` ×5, `› a result for a replaced
  photo is ignored`, `› unmount aborts the request` ✓.
- [x] AC5 Disclosure names the configured provider — evidence: `Editor.test.tsx › disclosure names Claude` / `› … Gemini`
  ✓ (exact text "Ảnh sẽ được gửi tới Claude/Gemini bằng key của bạn"); `› settings load error: retry; misconfigured has
  no retry` ✓ (button disabled until the provider is known).
- [x] AC6 390px and dark mode — evidence (CSS inspection, per plan): `src/index.css:1939-1963` adds only a flex column,
  11px wrapping text (`overflow-wrap:anywhere`) and light ink `#fff8eb` / `#ffc9a3` on `.photo-column`, whose background
  is `var(--chocolate)` (`#3b2a22` light, `#261d19` dark, `index.css:1339/1354`), so contrast holds in both themes;
  the button reuses `.photo-column .ai-btn` with `width:100%` at ≤650px (`index.css:2695`) and 44px min-height on coarse
  pointers (`:2778`). No fixed widths, so no horizontal scroll at 390px. No live browser check was run (the dev proxy
  hits production data and a real key, D45); the real-phone check is in Ming verification.
- [x] AC7 Checks green / R1 holds — typecheck, format, build green; tests green apart from the 7 pre-existing Windows
  failures shown above to be identical on `origin/main`. No new `fetch(` in `src/features` or `src/App.tsx`; the only
  network call is `src/data/aiTagging.ts` through `createAuthedFetch`.

### Ming verification after merge (carry into the PR)
- On the phone (390px class), light and dark: with a Claude key, "Thêm món đồ" → photo → line reads "Ảnh sẽ được gửi
  tới Claude bằng key của bạn" → tap "✨ Tự điền từ ảnh" → empty fields fill in Vietnamese; a field typed before the tap
  is unchanged; "Hoàn tác" restores the form.
- Switch Settings to Gemini: the line names Gemini; repeat on an existing item with a stored photo.
- "Xoá key" in Settings, reopen an item: button disabled, hint explains setup, "Mở cài đặt" opens Settings over the
  editor. Each tap spends one of the 100 daily calls and the user's provider quota.

### Issues
None.

### Scope
Every changed file is in the plan's file list (`aiTagging.ts/.test.ts`, `aiFill.ts/.test.ts`, `useAiFill.ts`,
`Editor.tsx/.test.tsx`, `copy.ts`, `App.tsx/.test.tsx`, `index.css`, `impl-log.md`); `plan.md` / `ticket.md` are
workflow files. No `server/**`, `db/**`, `src/features/auth/**`, `src/data/aiSettings.ts`, `mappers.ts` or package
changes.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: data access only via `src/data/aiTagging.ts` (`createAuthedFetch`, bearer + 401 retry); no local/demo branch.
- R2/R3/R5: no schema change, nothing secret client-side (only the resized photo goes to `/api`), nothing derived stored.
- R4: the photo is read from the existing `data:`/`blob:` source and sent only to `/api/ai/tag-photo`.
- R6: copy in `EDITOR_COPY.ai` (`src/features/items/copy.ts`) and `SETTINGS_COPY`; ids → labels only via
  `CATEGORY_FROM_DB` / `COLOR_FROM_DB` / `SEASON_FROM_DB` with own-property lookups (`aiFill.ts`).
- R8: every new pure function (`suggestionToFields`, `fillEmpty`, `undoFill`, `aiAvailability`, `photoSourceFor`,
  `aiErrorText`, `needsSettings`, the tagger's parser) has unit tests.
- R9: see AC6. R10 retired.

### Nits (do not block)
- `src/features/items/useAiFill.ts:10` imports `photoSourceFor` but never uses it (the Editor computes `photoSrc`).
- `src/features/items/aiFill.ts:3-4` two separate `import type` lines from `@/shared/ai/catalog`; merge them.
- `.ai-fill-link` ("Mở cài đặt", "Hoàn tác", "Thử lại") is an inline text button with no min-height, so on coarse
  pointers its tap target is well below the 44px the project gives other buttons (`index.css:2778`). Works, but small
  on a phone; consider padding or adding it to the coarse-pointer block.
- After "Nhân bản" (duplicate, same Editor instance and same photo) an earlier fill's "Hoàn tác" is still offered and
  would act on the copy. Harmless (undo only restores unchanged values) and covered by plan A2's accepted edge.
- A stale `fill.error` stays visible after the photo is replaced until the next tap.

### Follow-ups (out of scope)
- Pre-existing Windows test failures (7 tests in `server/ai/tagPhoto.test.ts`, `server/api.test.ts`,
  `server/index.cli.test.ts`, `server/scoping.test.ts`, `src/features/auth/boundary.test.ts`): path separators and
  socket resets on native Windows. Worth a `debt` issue (`project:tudocuatui`) if Windows dev is expected.
- A11 from the plan: no data-use notice for free-tier Gemini inputs; raise as `debt` or a decision for Ming.
- A6: rename `AiSettingsError` to a neutral name now that the tagger uses it too.
