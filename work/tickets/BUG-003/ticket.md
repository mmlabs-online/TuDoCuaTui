# BUG-003: Hero banner photos are cut off on mobile

| Field | Value |
|---|---|
| Type | bug |
| State | MERGED |
| Severity | S3 |
| Priority | P2 |
| Size | XS |
| Milestone | M1 |
| Epic | E5 — UI |
| Areas | ui |
| Gate | none |
| Found in | unknown (production, reported 2026-11-17) |
| Introduced in | unknown — the mobile hero CSS is already in v0.2.0 (Figma Make export) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-17 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/74 |

## Report
Ming, 2026-11-17: "Lỗi UI trên màn hình mobile. Banner bị mất ảnh" (UI bug on mobile: the banner loses its photos).
Screenshot (light mode, narrow mobile viewport, about 490px wide): the hero card shows the title, the "62 món lâu chưa
mặc" line and the Import/Export buttons; at the right edge the two collage photos ("Mới mua", "Yêu thích") are
cropped by the card edge, the second one mostly hidden. The sticky top bar also sits over the first title line.

## Environment
- Mode: API (identity) · mobile browser · light (dark not checked) · viewport ≤ 650px (seen at ~490px, reproduced at 390px and 490px)

## Steps to reproduce
1. Have at least 2 items with photos.
2. Open the main screen at a viewport ≤ 650px wide (e.g. 390px).
3. Look at the photo collage on the right of the hero banner.

## Expected
- Both collage photos and their labels sit fully inside the hero card (a small decorative overlap is fine), not
  hidden behind the card edge; the title, text and Import/Export buttons stay readable and unobstructed.

## Actual
- At 390px the first card ends at x=373 (card edge 370) and the second card spans x=327–440, so ~70% of it is
  outside the card and clipped by `overflow: hidden`. Same at 490px (second card 427–540 vs card edge 470).

## Root cause
**Confirmed** (Playwright on the real `src/index.css` with the hero markup, 390px and 490px; script outside the repo).
`src/index.css:2233-2251` (`@media (max-width: 650px)`): `.hero-collage` is `position: absolute; right: -45px;
width: 190px; transform: scale(0.8)`, and `.collage-2` is placed at `left: 88px` with `width: 112px`, so it ends at
200px — past the collage box, which itself starts 45px outside the card. `.intro { overflow: hidden }`
(`src/index.css:2221` block) then crops the photos.

## Scope
- Adjust the ≤ 650px hero collage CSS so both visible collage cards fit inside the hero card at 390px–650px, without
  covering the hero text or the Import/Export buttons.

## Out of scope
- The sticky top bar overlapping the hero title on scroll (seen in the screenshot; separate follow-up if Ming wants it).
- Desktop/tablet hero layout (> 650px); collage content (which items are picked).

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after (name the test). jsdom
      cannot see layout, so: a one-off Playwright check (D42) asserting both visible `.collage-card` boxes lie within
      the `.intro` box (± a few px) at 390px and 650px, recorded in impl-log and review.
- [ ] The expected behaviour above holds in light and dark mode at 390px, 490px and 650px; screenshots attached to the PR.
- [ ] All checks pass.

## Technical notes
- Files: `src/index.css` (the `@media (max-width: 650px)` hero block only).
- Test level: browser-only (CSS layout) → Playwright one-off, script outside the repo (D42).

## Notes / answers from Ming

## Handoff
- 2026-11-17 — claude — recorded; record PR https://github.com/mmlabs-online/TuDoCuaTui/pull/71

### 2026-11-17 — claude — DONE
- Done: attempt 1 (scale 0.68 collage) passed review on raw CSS and shipped in PR #71; the BUG-004 reviewer's cross-check on the compiled CSS found card 1 overlapping the hero text and the Export button at 360–414px, so re-review → REWORK. Attempt 2 adds ≤430px / ≤380px collage steps; review PASS. Fix PR https://github.com/mmlabs-online/TuDoCuaTui/pull/74.
- In progress / next: Ming merges PR #74 and checks on a real phone (labels are ~6px at ≤380px).
- Gotchas: CSS layout checks must use the compiled CSS (vite build); raw src/index.css has no Tailwind preflight.
