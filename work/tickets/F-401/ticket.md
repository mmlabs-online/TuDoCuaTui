# F-401: Make search diacritic-insensitive

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E4 — Search & Filters |
| Areas | data |
| Gate | none |
| Depends on | F-005 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-07 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/11 |

## Goal
Searching "ao so mi" finds "Áo sơ mi", and search covers every useful text field.

## Feature reference
`docs/feature-list.md` F-401. Decisions: `work/decisions.md`.

## Scope
- `src/lib/text.ts`: `normalize(s)` = lowercase, NFD, strip combining marks, `đ/Đ` → `d`, collapse spaces.
- Search across name, brand, colors, tags, material, notes and location. Today it searches only name, brand,
  colors and notes.
- Update the search placeholder to match.

## Out of scope
- Fuzzy matching or typo tolerance.

## Acceptance criteria
- [ ] Unit tests for the normaliser: every Vietnamese vowel with every tone, `đ`, mixed case, and both
      composed and decomposed input.
- [ ] "ao so mi", "AO SƠ MI" and "Áo sơ mi" give the same results.
- [ ] Searching a tag or a location finds the item.

## Technical notes
- Files: `src/lib/text.ts` (+ test), `src/features/items/filters.ts`, the search input component.
- F-601.2 reuses `normalize` for value matching.
- Can run in parallel with F-004.x if it only touches `filters.ts` and `src/lib/`; the one-line placeholder
  change can be rebased.
- Expected tier: Medium.

## Test plan
- Unit: `normalize`, `matchesFilters` with a query.
- Manual: type unaccented queries on a phone keyboard.

## Notes / answers from Ming
- 2026-11-07: Ming delegated the open decisions to Annie ("tự quyết định"). The choices are in `work/decisions.md`; ticket text that says "decision Dn" refers to them.

## Handoff

### 2026-11-08 — claude — DONE
- Done: took over the stale claim (another session, 2026-11-07); its attempt 2 commit was unpushed, now pushed; review attempt 2 PASS; rebased on main, checks re-run (105 tests).
- In progress / next: Ming merges the PR.
- Gotchas: F-004.1 must carry the new search placeholder when it moves the search input.
