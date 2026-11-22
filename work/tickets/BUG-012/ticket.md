# BUG-012: Outfit suggestion says "Mùa Đông" in hot weather

| Field | Value |
|---|---|
| Type | bug |
| State | DONE |
| Severity | S2 |
| Priority | P1 |
| Size | XS |
| Areas | ui, data |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | v0.3.0 (F-704.1, commit 1d53aee) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/103 |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-3). In "Hôm nay mặc gì?" the weather
line read "TP. Hồ Chí Minh · 25–34°C · Mưa 84%". The heading was "Mùa Đông", but every outfit carried the tag
"Trời nóng", so the screen contradicts itself. With weather "Tắt" the heading is also "Mùa Đông" for every city.

## Environment
- Production v0.3.1, Chrome desktop, 2026-11-20.

## Steps to reproduce
1. Click "Hôm nay mặc gì?" in November.
2. Set "Thời tiết" to "TP. Hồ Chí Minh" (hot day).

## Expected
- The heading describes what actually drove the suggestion. When weather is on, show the weather kind (e.g.
  "Trời nóng") or the seasons used, not a calendar winter that contradicts the tags.

## Actual
- Heading "Mùa Đông" + tags "Trời nóng".

## Root cause
**Confirmed**: `src/features/outfits/suggest.ts:27-28` — `seasonOf()` maps the calendar month to one season for the
whole country (Nov → Đông). `eligibility()` (`suggest.ts:96-102`) correctly replaces Đông with Hạ when it is hot,
but `Suggestion.season` returns the calendar season, which the modal shows as `Mùa ${s}`
(`src/features/outfits/copy.ts:7`).

## Scope
- Make the heading match the season/weather actually used (e.g. return the `wanted` seasons or a weather label from
  `eligibility()` and render that).

## Out of scope
- Regional season tables per city, and outfit ranking itself (BUG-013).

## Acceptance criteria
- [x] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `suggest.test.ts` › "hot weather in a winter month does not report Đông", plus a modal test for the heading).
- [x] The expected behaviour above holds.
- [x] All checks pass.

## Technical notes
- Files: `src/features/outfits/suggest.ts`, `copy.ts`, `OutfitsModal.tsx` (or the "Hôm nay mặc gì?" component).
- Hotspot: T-032 (AI outfits tidy-ups) also edits `src/features/outfits/`.

## Notes / answers from Ming
- 2026-11-21: Ming accepted the default to keep the `high-paths` plan gate from `loop.config.md`, so this P1 ticket needs no plan approval. The matching wording change in workspace `CLAUDE.md` §8 is still pending.
- 2026-11-22: M-41 resolved by landing solo commit 288ecbe on main (15s timeout for ItemGrid.test.tsx:89). Rebased onto main.

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)

### 2026-11-21 — claude — BLOCKED
- Done: consult, plan, implementation (attempt 1). Review verdict REWORK with no defect in the BUG-012 code: regression tests fail before the fix and pass after it; format, typecheck and build pass.
- In progress / next: `pnpm test` is red locally because `src/features/items/ItemGrid.test.tsx:89` exceeds the 5 s timeout (6 of 6 full-suite runs, also on `origin/main`; green in GitHub CI). After M-41: re-review, then open the PR. No PR is open yet.
- Gotchas: do not fix `ItemGrid.test.tsx` on this branch (outside the plan, R7). WSL has no git identity; commit with Windows git. Follow-up for warm southern days: spaceM debt #72.

### 2026-11-22 — claude — DONE
- Done: M-41 resolved by solo commit on main. Rebased onto main; all checks passed on native WSL (format:check, typecheck, build, test: 1950 passed, 0 failed in 68s). Review attempt 2 verdict: PASS. PR #103 opened.
- In progress / next: Ming reviews and merges PR #103.
- Gotchas: Follow-up for warm southern days: spaceM debt #72.
