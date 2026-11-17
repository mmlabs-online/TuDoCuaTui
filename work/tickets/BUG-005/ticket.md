# BUG-005: AI settings button uses a sun-like icon instead of an "AI" icon

| Field | Value |
|---|---|
| Type | bug |
| State | MERGED |
| Severity | S2 |
| Priority | P1 |
| Size | XS |
| Milestone | M1 |
| Epic | E5 — UI |
| Areas | ui |
| Gate | none |
| Found in | unknown (production, reported 2026-11-17) |
| Introduced in | v0.2.6 (T-010, commit 0438350) |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-17 |
| Claimed by | claude@2026-11-17T13:49:40Z |
| PR | — |

## Report
Ming, 2026-11-17: "Đổi lại icon chỗ set AI key thành AI" (change the icon of the AI key settings button to "AI").
Screenshot (desktop, light mode, top bar): brand "Tủ đồ · 63 món", then a moon button (theme), then the settings
button circled in red — a small circle with rays that looks like a sun — then Import, Export, "Thêm món đồ".

## Environment
- Mode: API (identity) · desktop browser (also mobile top bar) · light and dark · any viewport

## Steps to reproduce
1. Sign in (the settings button shows only when `onSettings` is set).
2. Look at the top bar next to the theme toggle.

## Expected
- The button that opens "Cài đặt AI" shows an icon that reads as AI (an "AI" text badge, as Ming asked), clearly
  different from the theme toggle; its accessible label stays "Cài đặt".

## Actual
- It shows the `settings` icon: a circle with eight rays, almost the same drawing as the `sun` icon the theme toggle
  shows in dark mode. Next to the moon button it reads as a second theme/brightness control, not AI settings.

## Root cause
**Confirmed** (code reading; matches the screenshot). `src/features/layout/Header.tsx:42` renders
`<Icon name="settings" />`; `src/components/Icon.tsx:73-78` draws `settings` as a circle plus radiating strokes,
the same shape as `sun` (`src/components/Icon.tsx:34-39`). Added by T-010.

## Scope
- Replace the icon of the settings button in `Header.tsx` with an "AI" icon (e.g. a new `ai` entry in `Icon.tsx`:
  the letters "AI" in the same 24×24 stroke style, or `sparkle` + "AI" — planner picks, matching Ming's "thành AI").
- Keep `aria-label` (`SETTINGS_COPY.open`) and the button behaviour unchanged.

## Out of scope
- Renaming the settings screen or changing its content.
- Other icons in the top bar.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after (name the test) — e.g.
      a `Header` test asserting the "Cài đặt" button renders the `ai` icon (not `settings`).
- [ ] The icon is readable as "AI" at 390px and on desktop, in light and dark mode; screenshots in the PR.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/layout/Header.tsx`, `src/components/Icon.tsx`, a Header test (new or existing).
- Test level: unit (jsdom), e.g. a `data-icon` attribute or the icon's `<title>`/test id; the visual check by Playwright one-off (D42).

## Notes / answers from Ming

## Handoff
- 2026-11-17 — claude — recorded; record PR https://github.com/mmlabs-online/TuDoCuaTui/pull/71
