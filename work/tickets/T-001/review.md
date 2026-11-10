# Review — T-001

## Attempt 1 — 2026-11-10
Verdict: PASS

### Checks (run by reviewer)
- typecheck: `tsc --noEmit` exit 0, no errors.
- format:check: "All matched files use the correct format. Finished … on 96 files".
- test: Test Files 27 passed (27), Tests 396 passed (396).
- test:coverage: 396 passed; All files 99.82 / 99.09 / 100 / 99.79.
- build: `vite build` ✓ built (dist/assets/index-*.js 242.49 kB).
These match impl-log.md Attempt 1.

### Acceptance criteria
- [x] 1. Supabase mode: editor hides "Tự điền từ ảnh". Evidence: `src/features/items/Editor.tsx:138` `{showMockAi && (…)}`; `src/App.tsx:169` `showMockAi={wardrobe.mode === "local"}`; test `Editor.test.tsx › mock AI › hides "Tự điền từ ảnh" when showMockAi is false` (`src/features/items/Editor.test.tsx:75`) passes.
- [x] 2. Supabase mode: Photos tab hides the "Dùng AI nhận diện…" checkbox. Evidence: `src/features/import-export/ImportPhotosTab.tsx:22`; pass-through `src/features/import-export/ImportModal.tsx:30,104`; `src/App.tsx:224`; test `ImportModal.test.tsx › mock AI › Photos tab hides the AI checkbox when showMockAi is false` (`ImportModal.test.tsx:143`) passes.
- [x] 3. Local mode unchanged (D9). Evidence: `Editor.test.tsx:80`, `ImportModal.test.tsx:148` and `App.test.tsx › App import/export (local mode) › shows the mock AI controls in local mode` pass; the button's onClick and the checkbox markup are unchanged (re-indented only).
- [x] 4. R1: `grep -n "supabase\|import.meta.env"` on Editor.tsx, ImportModal.tsx and ImportPhotosTab.tsx returns nothing. Mode comes from `wardrobe.mode`, the same way as `showSignOut` (`src/App.tsx:88`). Only callers are `App.tsx:162`, `App.tsx:219` and `ImportModal.tsx:104`. The props are required, so the compiler checks every caller.
- [x] 5. Checks green (above).

### Deviations from the plan
- App test in the `App import/export (local mode)` describe instead of `App (local mode)`: accepted. It reuses `openImport`, and it covers what the plan asked for.
- `setup(importMany, showMockAi = true)` in ImportModal.test.tsx: the new param is unused by callers. Harmless (see nit).
- Diff +87/-26 vs the plan's 40–60 estimate: the extra lines are re-indentation from the two `{showMockAi && (…)}` wraps plus the tests. No logic beyond the plan.

### Scope
Changed files (`git diff origin/main...HEAD --stat`): the 7 files in the plan's list plus the ticket folder. No out-of-plan files.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found. R1 covered above. R2–R5 not touched. R6: no new copy. R7: within the plan. R8: both branches unit-tested, plus an App regression test. R9: only removes an element. The next sibling `.remove-photo` keeps its own margin (`src/index.css:621`), so the mobile and dark layouts are not hurt; Ming checks this after merge. R10: not touched.

### Nits (do not block)
- 💭 `ImportModal.test.tsx:21`: the `showMockAi` param on `setup` is never passed. It could be dropped and `showMockAi` hard-coded to `true`.

### Follow-ups (out of scope)
- Remove `showMockAi` and the mock onClick when F-702/F-703 land (already in impl-log).
- Supabase mode is not tested end to end through `App`. The prop tests and a code read cover it. An App-level Supabase-mode test could come with the F-005 test-harness work.
