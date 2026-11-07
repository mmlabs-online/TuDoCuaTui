# F-601.3: CSV import preview and import run

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | ui, data |
| Gate | none |
| Depends on | F-601.2, F-004.3 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | — |

## Goal
Ming can import a real spreadsheet, see what will happen first, and watch it run.

## Feature reference
`docs/feature-list.md` F-601 (split F-601.3). Decisions: `work/decisions.md`.

## Scope
- Replace the mock in the "CSV / Excel" tab: pick a `.csv` file or paste text → preview of the first 20 rows,
  per-row errors, and counts of rows to import and to skip.
- Import sequentially with a progress bar; locations are find-or-create (as `repo.save` already does).
- Rework `useWardrobe.importMany` to continue after a failed row, add each saved item to the state right away,
  and return per-row results. Today it stops at the first error and adds nothing to the state until the end,
  so a partial import is invisible until a refresh. F-603 reuses this.
- A summary at the end: imported, skipped, failed (with reasons).

## Out of scope
- `.xlsx` files (only CSV; the tab label "CSV / Excel" means "CSV saved from Excel").
- Undoing an import.

## Acceptance criteria
- [ ] The template CSV from the UI imports.
- [ ] A 200-row file imports without errors.
- [ ] Invalid rows are reported and do not block valid ones.
- [ ] Closing the modal mid-import stops after the current row, and the items already saved stay visible.

## Technical notes
- Files: `src/features/import-export/ImportCsvTab.tsx`, `src/data/useWardrobe.ts`.
- New dependency for F-603 (not in the feature list): F-603 builds on the reworked `importMany`.
- Expected tier: Medium.

## Test plan
- Unit: `importMany` with a fake repo that fails on row 3 → rows 1, 2, 4… saved; results correct.
- Manual: a 200-row fixture in Supabase mode; an Excel `;` export; a file with 5 bad rows.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
