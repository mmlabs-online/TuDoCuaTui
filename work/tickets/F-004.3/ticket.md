# F-004.3: Extract modals and shrink `App.tsx` under 250 lines

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | ui |
| Gate | none |
| Depends on | F-004.2 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/19 |

## Goal
Import and export get their own feature folder, so the real import/export tickets can replace the mocks
without touching `App.tsx`.

## Feature reference
`docs/feature-list.md` F-004 (split F-004.3). Decisions: `work/decisions.md`.

## Scope
- `src/features/import-export/`: `ImportModal` (with one component per tab), `ExportModal`, and the
  `download` helper.
- Move the toast into `src/components/Toast` with a `useToast` hook.
- Put each feature's UI copy in one place (`copy.ts` per feature), as feature-list §7 requires.

## Out of scope
- Replacing the mocks (F-601, F-602, F-603, F-604).

## Acceptance criteria
- [ ] `src/App.tsx` is under 250 lines.
- [ ] Screenshots are identical before and after; the import mock and the export still behave as today.
- [ ] Build, typecheck and tests pass.

## Technical notes
- Files: `src/App.tsx`, `src/features/import-export/*`, `src/components/Toast.tsx`.
- Expected tier: Medium.

## Test plan
- Manual: screenshots; open each import tab; export JSON and CSV.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-09 — claude — DONE
- Done: planned, implemented and reviewed in one attempt (PASS). Import/export modals, Toast/useToast and download helper extracted; import-export `copy.ts`; App.tsx 458 → 225 lines. PR #19.
- In progress / next: Ming merges PR #19 and decides on the proposed F-004.4 (copy for items/layout/shell/components; see plan.md › Split proposal) — not created yet, needs `/ticket`.
- Gotchas: feature-list §7 (no scattered literals) is only met for import-export + auth until F-004.4 lands.
