## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| `src/data/aiTagging.ts` (new) | `TagSuggestion` + `createHttpAiTagger`: the only caller of `POST /api/ai/tag-photo` (R1); errors are `AiSettingsError` (A6) |
| `src/data/aiTagging.test.ts` (new) | AC 4: request shape, bearer/401 retry, error codes, malformed 200, abort |
| `src/features/items/aiFill.ts` (new) | Pure logic: `suggestionToFields`, `fillEmpty`, `undoFill`, `aiAvailability`, `photoSourceFor`, `aiErrorText`, `needsSettings` |
| `src/features/items/aiFill.test.ts` (new) | AC 1, 2, 3, 5 (pure) |
| `src/features/items/useAiFill.ts` (new) | Hook: settings load/retry, `run` (in-flight guard, abort on unmount, stale-photo guard, resize), `undo` |
| `src/features/items/Editor.tsx` | Optional `ai` prop, AI block under the photo actions, `categoryTouched` flag on the category select |
| `src/features/items/Editor.test.tsx` | New `describe("AI fill")` (stateful harness so undo sees updated values); existing tests untouched |
| `src/features/items/copy.ts` | `EDITOR_COPY.ai` Vietnamese strings (R6) |
| `src/App.tsx` | One tagger per App, `aiSettingsRev` bumped when the Settings modal closes, `ai` prop to `Editor` |
| `src/App.test.tsx` | Replaced `the editor has no mock AI button` with two AI tests (button + disclosure; "Mở cài đặt" over the editor, reload on close) |
| `src/index.css` | `.ai-fill`, `.ai-fill-note`, `.ai-fill-error`, `.ai-fill-link`; theme-neutral colours matching `.photo-column`, existing 390px `.ai-btn` rules reused |
| `work/tickets/F-702/impl-log.md` | This log |

### Tests added / changed
- `src/data/aiTagging.test.ts`: posts the blob; returns the suggestion; malformed 200 -> internal; normalises wrong-typed fields; maps every server error code; unknown code -> internal with requestId; non-JSON error body; bearer + 401 retry; 401 twice -> onAuthLost; network; abort not mapped to network.
- `src/features/items/aiFill.test.ts`: `suggestionToFields`, `fillEmpty`, `undoFill`, `aiAvailability`, `photoSourceFor`, `aiErrorText` / `needsSettings`.
- `src/features/items/Editor.test.tsx › AI fill`: disclosure Claude / Gemini; no settings / no key; no photo; resize before post; fills only empty fields; new-item category; undo; pending debounce; error codes (5); nothing to fill; replaced photo ignored; unmount aborts; settings load error + retry / misconfigured; settingsRev reload.
- `src/App.test.tsx › App (UI) › AI fill`: the editor shows the AI button; "Mở cài đặt" opens settings over the editor and closing reloads.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: `pnpm test` -> 6 files / 8 tests failed, 1293 passed. All failures are in `server/ai/tagPhoto.test.ts`, `server/api.test.ts`, `server/index.cli.test.ts`, `server/scoping.test.ts` (ECONNRESET / path separators on Windows) and `src/features/auth/boundary.test.ts` (`src\main.tsx` backslash). Re-running `server` + that boundary test on the stashed baseline (no F-702 changes) fails the same way (7 failed). None of the failing files is touched by this diff. My files: `aiTagging`, `aiFill`, `Editor`, `App` and the other `src/features/items` tests: 9 files, 157 tests passed.
- build: `vite build` ok (105 modules).
- Environment note: `node_modules` had POSIX-only symlinks that native Windows node could not read, so I deleted it and ran `pnpm install --frozen-lockfile` (lockfile unchanged, `git status` shows no package changes).
- `git diff --stat main -- server db` empty; no new `fetch(` under `src/features`.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- A11: Google may use free-tier Gemini inputs; no data-use notice was added (not in the ticket). Orchestrator may raise a `debt` issue or a decision for Ming.
- A6: rename `AiSettingsError` to a neutral name now that the tagger uses it too.
- Pre-existing: 7 server / auth-boundary tests fail on Windows (path separators, socket resets); they pass in the Linux/CI setup the project targets presumably. Worth a `debt` issue if Windows dev is expected.
- Not done (needs the real device): 390px / dark-mode look and the real-provider check (Ming verification section of the plan). `pnpm dev` visual check was not run.

### Scope self-check
- Could the diff be smaller? No: each file is in the plan's list; production code is about 330 lines plus tests.
- Diff size: tracked files +485 / -8, plus new files (aiTagging 91 lines, aiFill, useAiFill, two new test files).
