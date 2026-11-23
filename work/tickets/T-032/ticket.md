# T-032: AI outfits tidy-ups from F-704

| Field | Value |
|---|---|
| State | DONE |
| Priority | P3 |
| Size | S |
| Areas | ui |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-19 |
| Claimed by | — |
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

### 2026-11-23 — claude — DONE
- Done: consult (frontend-developer), plan, implement (attempt 1) incl. one-off Playwright at 390 px; reviewer PASS. Branch `ticket/T-032` pushed.
- In progress / next: no GitHub CLI or MCP on this machine; Ming opens the PR from `ticket/T-032` with the body in `work/tickets/T-032/pr.md`, then the PR URL goes into this ticket.
- Gotchas: F-707.1/.2/.4 touch the same files (suggest.ts, aiOutfits.ts, OutfitsModal.tsx); they rebase onto this. F-707.4 should keep `ai.onOpenSettings`.
