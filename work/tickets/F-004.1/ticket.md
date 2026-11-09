# F-004.1: Extract UI primitives and constants from `App.tsx`

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | ui |
| Gate | none |
| Depends on | F-005 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/12 |

## Goal
Start breaking up the 1,547-line `App.tsx` with the parts that have no state, so later UI work does not
collide in one file.

## Feature reference
`docs/feature-list.md` F-004 (split F-004.1). Decisions: `work/decisions.md`.

## Scope
- `src/components/`: `Icon`, `Btn`, `Modal`, `Field`, `Confirm`, `Skeleton`, `Empty`, `FilterSelect`.
- `src/constants/wardrobe.ts`: category names and icons, statuses, seasons, `colorMap`, `frameColors`,
  sort options. Derive the label lists from `mappers.ts` (or the other way round), so there is one source.
- `src/data/demo.ts`: the `starter` demo items, `photos` and default `locations` (about 230 lines).

## Out of scope
- Any visual or behavioural change.

## Acceptance criteria
- [ ] Screenshots of local mode (light + dark, 390px + desktop) are identical before and after.
- [ ] `tsc --noEmit`, `pnpm build` and `pnpm test` pass.
- [ ] Label lists exist in one place only.

## Technical notes
- Files: `src/App.tsx`, `src/components/*`, `src/constants/wardrobe.ts`, `src/data/demo.ts`, `src/data/mappers.ts`.
- Must not break the Figma Make preview: local mode still loads the demo items.
- Expected tier: Medium.

## Test plan
- Unit: the F-005 mapper round-trip test still passes against the shared constants.
- Manual: screenshot comparison in local mode.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-08 — claude — DONE
- Done: took over the stale claim; the earlier session's uncommitted WIP was rebased onto main, verified against plan.md and finished (attempt 1); review PASS (moved-code check).
- In progress / next: Ming merges the PR; screenshots before/after (AC1) are Ming's check.
- Gotchas: conflicts with PR #11 (F-401, search placeholder in App.tsx); whichever merges second rebases.
