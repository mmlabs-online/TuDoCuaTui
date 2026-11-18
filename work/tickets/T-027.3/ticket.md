# T-027.3: Polish the bulk photo import UI

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P2 |
| Size | S |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | ui |
| Gate | none |
| Depends on | T-027.1 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-18 |
| Claimed by | claude@2026-11-18T02:27:36Z |
| PR | — |

## Goal
The bulk photo import tab reads well on a phone and its code has no leftovers. Follow-ups from F-603 and F-703
(split of T-027).

## Feature reference
Not a feature-list item: polish of F-603 / F-703. Sources: `work/tickets/F-603/review.md` and `impl-log.md`
(follow-ups, nits), `work/tickets/F-703/review.md` and `impl-log.md` (follow-ups, nits). Rules R6 (copy in one
place), R9 (390px and dark mode).

## Scope
- In the edit phase with many files, the file list scrolls inside the modal and is never hidden under the footer at 390×844.
- Per-row AI labels update while the batch runs, not only at the end.
- The AI note under the checkbox is readable on desktop (not 8px).
- Errors in the failed list are always Vietnamese (non-API errors included).
- AI settings load only when the Photos tab is shown, not when only CSV or JSON is used.
- Move `formatWait` to one shared module used by auth and import-export (respecting `auth/boundary.test.ts`).
- Remove dead code (`if (editing)`, `disabled={!editing}` inside `editing &&`), the duplicate `@/data/photoImport`
  import, and the repeated AI stop-reason code in `photoImport.ts`.

## Out of scope
- Runner behaviour (T-027.1) and the photo worker (T-027.2).

## Acceptance criteria
- [ ] At 390×844 with 10 files picked, the whole list can be reached and nothing is hidden under the footer (Playwright one-off, light and dark).
- [ ] Per-row AI labels change during the run (unit test).
- [ ] No English error text in the failed list (unit test with a non-API error).
- [ ] Opening the import modal on the CSV or JSON tab makes no AI settings request (unit test).
- [ ] `formatWait` exists once and both features use it.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/import-export/ImportPhotosTab.tsx`, `ImportModal.tsx`, `usePhotoImport.ts`, `copy.ts`,
  `src/data/photoImport.ts`, `src/index.css`, a shared copy/format module, tests.

## Test plan
- Unit tests; one-off Playwright check at 390px light and dark (D42).

## Notes / answers from Ming
Plan approved (2026-11-18) — Ming approved plan.md including the import swap and moved `formatWait` tests in `src/features/auth/**`.

## Handoff
