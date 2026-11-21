# BUG-012: Outfit suggestion says "Mùa Đông" in hot weather

| Field | Value |
|---|---|
| Type | bug |
| State | REVIEW |
| Severity | S2 |
| Priority | P1 |
| Size | XS |
| Areas | ui, data |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | v0.3.0 (F-704.1, commit 1d53aee) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-20 |
| Claimed by | claude@2026-11-21T12:35:26Z |
| PR | — |

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
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `suggest.test.ts` › "hot weather in a winter month does not report Đông", plus a modal test for the heading).
- [ ] The expected behaviour above holds.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/outfits/suggest.ts`, `copy.ts`, `OutfitsModal.tsx` (or the "Hôm nay mặc gì?" component).
- Hotspot: T-032 (AI outfits tidy-ups) also edits `src/features/outfits/`.

## Notes / answers from Ming

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)
