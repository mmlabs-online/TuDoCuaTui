# T-001: Hide mock AI controls until M3

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E2 — Items core |
| Areas | ui |
| Gate | none |
| Depends on | F-004.3 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | claude@2026-11-10T03:39:58Z |
| PR | — |

## Goal
Real use in M1 never runs fake AI that overwrites what Ming typed.

## Feature reference
Not in the feature list: comes from a mismatch in `docs/plan-M1.md` §4; accepted in `work/decisions.md` D9.

## Scope
- Hide the "✨ Tự điền từ ảnh" button in the editor. Today it overwrites category, colors, seasons and tags
  with hard-coded values. It comes back with F-702.
- Hide the "Dùng AI nhận diện…" checkbox in bulk import (comes back with F-703).
- Keep both visible in local mode if Ming wants the Figma Make preview unchanged (decision D9).

## Out of scope
- Real AI (E7).

## Acceptance criteria
- [ ] In Supabase mode, neither control is shown.

## Technical notes
- Files: `src/features/items/Editor.tsx`, `src/features/import-export/ImportPhotosTab.tsx`.
- Not in the feature list, so it needs Ming's OK.

## Test plan
- Manual: Supabase mode vs local mode.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff
