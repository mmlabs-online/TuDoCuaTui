# F-005: Set up Vitest and test the data layer

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P0 |
| Size | M |
| Milestone | M1 |
| Epic | E0 — Foundation & DevEx |
| Areas | data, architecture |
| Gate | none |
| Depends on | F-003 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/6 |

## Goal
A test harness exists, and the logic that later tickets change (mappers, local repo, filter/sort/stale)
has tests.

## Feature reference
`docs/feature-list.md` F-005. Decisions: `work/decisions.md`.

## Scope
- Vitest + React Testing Library + jsdom; `pnpm test` and `pnpm test:coverage`; add the test step to CI.
- Unit tests: `mappers.ts` (round trip of every category, status, season and color label;
  `rowToItem` with null fields; `itemToRow` trimming, null price, non-UUID ids) and `createLocalRepo`.
- Extract from `App.tsx` into `src/features/items/filters.ts`: `ageInDays`, `isStale` (≥ 90 days or never
  worn), `matchesFilters`, `sortItems`. Test them, including the boundary at exactly 90 days.

## Out of scope
- Changing the behaviour of the extracted helpers. The date bug is reported in T-002: the tests record
  today's behaviour, and T-002 changes it.
- The UI split (F-004).

## Acceptance criteria
- [ ] `pnpm test` is green locally and in CI.
- [ ] Coverage of `src/data/**` is ≥ 80% (scope: see the risks below).

## Technical notes
- Files: `vitest.config.ts`, `src/test/setup.ts`, `src/data/*.test.ts`, `src/features/items/filters.ts` (+ test), `src/App.tsx`.
- Risks: `src/data/**` includes the Supabase repo (~170 lines), `useWardrobe` and `photos.ts`, which uses
  canvas (not available in jsdom). Reaching 80% honestly needs a fake Supabase client. Proposed:
  exclude `photos.ts` from the threshold and cover the Supabase repo with a small hand-written fake client.
  If the fake client grows beyond about 2 hours of work, split it into F-005.2 (decision D6).
- Run this before F-004: the helper extraction edits `App.tsx`.
- Expected tier: Low (tests) plus Medium (the `App.tsx` extraction).

## Test plan
- Unit: as listed.
- Manual: `pnpm test:coverage` and read the report.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### Implementer, attempt 1 (2026-11-07)
- Slice 1 implemented per plan.md: Vitest harness, CI step (`pnpm test:coverage`), mapper, local-repo and filters tests, `filters.ts` extraction (App.tsx behaviour unchanged).
- AC2 (`src/data/**` >= 80%) is NOT complete here: `repo.ts` Supabase half and `useWardrobe.ts` are uncovered. F-005.2 completes it (fake Supabase client, useWardrobe tests, Testing Library packages, global threshold).
- Deviation: jsdom pinned to 27.4.0 (latest 31.0.0 needs Node ^22.22.2; local Node is 22.16).
- Follow-ups: see work/tickets/F-005/impl-log.md.
### 2026-11-07 — claude — DONE
- Done: Vitest 5.1 + coverage-v8 + jsdom, standalone vitest.config.ts (TZ Asia/Ho_Chi_Minh, local mode forced), 54 tests (mappers, local repo, filters), filters extracted from App.tsx with no behaviour change, CI runs test:coverage. Review PASS attempt 1; audit clean. PR #6.
- In progress / next: F-005.2 (fake Supabase client, global 80% gate). Merge #6 before any F-004.x.
- Gotchas: jsdom pinned to 27.x (31 needs Node ≥ 22.22). Tests pinning the T-002 date quirk are labelled "(records current behaviour)" — T-002 must update them.
