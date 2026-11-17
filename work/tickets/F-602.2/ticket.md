# F-602.2: JSON backup and restore in the app (client)

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | ui, data |
| Gate | none |
| Depends on | F-602 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-17 |
| Claimed by | claude@2026-11-17T15:39:20Z |
| PR | — |

## Goal
Ming can download a full JSON backup and restore it from the app, with clear Vietnamese feedback.

## Feature reference
`docs/feature-list.md` F-602 (split F-602.2; the server half is F-602, slice F-602.1). Decisions: D1, D44, D49.
Wire format and error codes: `work/tickets/F-602/plan.md` (merged with F-602).

## Scope
- `src/data/backup.ts`: types matching the F-602.1 wire format; `precheckBackup` (file ≤ 8 MiB, JSON parses,
  `version === 1`, arrays present, count caps) — the server stays authoritative.
- `WardrobeRepo.exportAll()` / `restore(backup)` in `repo.ts`; thin `call()`s in `repo.http.ts`; minimal
  `src/test/memoryRepo.ts`; `useWardrobe.exportBackup` / `restoreBackup` (then `refresh()`).
- `apiErrors.ts`: Vietnamese messages for `restore_busy`, `restore_conflict`, `request_timeout` on restore and the new
  `invalid_input` reasons.
- `ImportJsonTab.tsx` real flow (pick file or paste → pre-check → confirm "restoring overwrites items with the same
  id and never deletes; photos are not in the file" → run → summary incl. `photosMissing`) and `ImportModal.tsx`
  wiring.
- `App.tsx` JSON export through `exportBackup()` and `download.ts` (CSV unchanged); `copy.ts` / `ExportModal` text.

## Out of scope
- Server changes (F-602, slice F-602.1).
- Restoring photo files (F-605, M3).

## Acceptance criteria
- [ ] Export downloads the server backup; on the real app, export → delete items → restore → export gives identical
      JSON apart from `exportedAt` and photo references.
- [ ] An invalid or oversized file shows a Vietnamese message and nothing is sent or written.
- [ ] The restore summary shows counts, including items whose photo was not restored.
- [ ] 390px and dark mode; tests pass.

## Technical notes
- Expected tier: Medium (no `server/**` change). F-202.1 (PR #72) also edits `repo.http.ts`; rebase if needed.

## Test plan
- Unit: `precheckBackup`; repo calls; `ImportJsonTab` flow and error mapping.
- Manual: export → delete → restore → export → diff on the real app.

## Notes / answers from Ming
- 2026-11-17: split from F-602 by the planner (whole ticket ≈ 900 non-test lines); Ming approved the F-602.1 plan
  and its 8 defaults.

## Handoff
