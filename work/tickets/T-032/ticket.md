# T-032: AI outfits tidy-ups from F-704

| Field | Value |
|---|---|
| State | REVIEW |
| Priority | P3 |
| Size | S |
| Areas | ui |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-23T05:18:24Z |
| PR | — |

## Goal
Polish the "✨ Gợi ý bằng AI" flow with the small items the F-704 reviews left.

## Scope reference
`docs/feature-list.md` F-704; follow-ups in F-704.4 and F-704.5 review.md (PR https://github.com/mmlabs-online/TuDoCuaTui/pull/93).

## Scope
- Narrow `AiSuggestInput.season` to `DbSeason` (type only).
- The two small `cleanReason` cleanups from the F-704.4 review.
- Hide the AI toggle when the rule-based set is empty.
- Dark-mode checkbox colours for the toggle (theme variables).
- Settings note: optional "Mở Cài đặt" link only if App wiring stays minimal; otherwise leave text-only.

## Out of scope
- Server changes; saving outfits (F-801–F-803).

## Acceptance criteria
- [ ] `season` is typed as `DbSeason`; passing a label fails typecheck.
- [ ] `cleanReason` cleanups covered by unit tests.
- [ ] With an empty rule set the toggle is not shown (modal test).
- [ ] Toggle readable in dark mode at 390 px (one-off Playwright, D42).
- [ ] All checks pass.

## Technical notes
- Files: `src/data/aiOutfits.ts`, `src/features/outfits/suggest.ts`, `OutfitsModal.tsx`, `src/index.css`, tests.

## Notes / answers from Ming

## Handoff
