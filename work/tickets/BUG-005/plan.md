Status: READY

# Plan — BUG-005: AI settings button uses a sun-like icon instead of an "AI" icon

## Feature summary
Bug ticket (D42): the reference is the bug report in `work/tickets/BUG-005/ticket.md`.

- Report (Ming, 2026-11-17): "Đổi lại icon chỗ set AI key thành AI" (change the icon of the AI key settings button to "AI").
- Expected: "The button that opens "Cài đặt AI" shows an icon that reads as AI (an "AI" text badge, as Ming asked),
  clearly different from the theme toggle; its accessible label stays "Cài đặt"."
- Actual: "It shows the `settings` icon: a circle with eight rays, almost the same drawing as the `sun` icon the theme
  toggle shows in dark mode."
- Scope: "Replace the icon of the settings button in `Header.tsx` with an "AI" icon (e.g. a new `ai` entry in
  `Icon.tsx` …). Keep `aria-label` (`SETTINGS_COPY.open`) and the button behaviour unchanged."
- Out of scope: renaming the settings screen or changing its content; other icons in the top bar.
- D42 (`work/decisions.md`): "Every bug fix ships with a regression test that fails before the fix … until then a
  browser-only bug gets a unit-level regression test where one can reproduce it, plus a one-off Playwright check
  (… script outside the repo) whose result is recorded in impl-log and review."

**Root cause — confirmed.** `src/features/layout/Header.tsx:42` renders `<Icon name="settings" />` inside the
`aria-label={SETTINGS_COPY.open}` button (`Header.tsx:41`). `src/components/Icon.tsx:73-78` draws `settings` as
`<circle r="3">` plus eight radiating strokes — the same construction as `sun` at `src/components/Icon.tsx:34-39`
(`<circle r="4">` plus eight rays). The theme toggle (`Header.tsx:37-39`) shows `sun` in dark mode / `moon` in light
mode right next to it, so the settings button reads as a second brightness control. Introduced by T-010 (its plan
asked for a "gear" path; the drawn path has no gear teeth).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: fails before the fix, passes after (ticket AC 1). | `src/features/layout/Header.test.tsx › AI settings button shows the "ai" icon, not the sun-like "settings" icon (BUG-005)`. Reviewer confirms it fails with the fix reverted (`git stash` the `Header.tsx` + `Icon.tsx` change, or reason from the diff: before the fix the svg has no `data-icon` and draws `settings`) and passes after. |
| 2 | The settings button shows an icon that reads as "AI", clearly different from the theme toggle (ticket Expected). | Unit: `src/components/Icon.test.tsx › "ai" draws its own glyph, different from "sun" and "settings"`. Visual: one-off Playwright screenshots (390px and 1280px, light and dark) of the top bar, recorded in impl-log; reviewer looks at them. |
| 3 | Accessible label stays "Cài đặt" (`SETTINGS_COPY.open`) and clicking still calls `onSettings` (ticket Scope). | Same Header test: `getByRole("button", { name: SETTINGS_COPY.open })` finds it, `fireEvent.click` calls `onSettings`. Diff shows `aria-label` and `onClick` on `Header.tsx:41` unchanged. |
| 4 | No other top-bar icon changes (ticket Out of scope). | Diff review: in `Header.tsx` only line 42 changes; in `Icon.tsx` only the new `ai` entry and the `data-icon` attribute are added; `sun`/`moon`/`settings` paths untouched. |
| 5 | Works at 390px and in dark mode (ticket AC 2, R9). | One-off Playwright screenshots (see AC 2); the icon uses `stroke="currentColor"`, so it follows `.icon-btn` colour in both themes. |
| 6 | All checks pass (ticket AC 3, R8). | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all green. |

## Ming verification after merge
- Look at the top bar on the real phone and on desktop after deploy (light and dark): the button left of sign-out
  shows "AI" and no longer looks like the sun. PR screenshots come from the one-off Playwright check against
  `pnpm dev`; the production look is Ming's to confirm.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/components/Icon.tsx` | Add an `ai` entry to `paths` (glyph below). Add `data-icon={name}` to the root `<svg>`. | The new icon (Scope); `data-icon` gives tests a stable hook — the svg is `aria-hidden` and has no other identifier (ticket Technical notes suggest "a `data-icon` attribute"). |
| `src/features/layout/Header.tsx` | Line 42: `<Icon name="settings" />` → `<Icon name="ai" />`. Nothing else. | The fix. |
| `src/features/layout/Header.test.tsx` | Add the BUG-005 regression test (existing file; keep the existing test). | AC 1, AC 3. |
| `src/components/Icon.test.tsx` (new) | Unit tests for the `ai` glyph and `data-icon`. | AC 2. |

`ai` glyph (24×24 viewBox, inherits the shared `stroke="currentColor"`, `strokeWidth="1.8"`, round caps/joins; no
`<text>` element, so it does not depend on fonts):

```tsx
ai: (
  <>
    <path d="M3.5 19 8.5 5l5 14" />   {/* A: legs from apex (8.5,5) to (3.5,19) and (13.5,19) */}
    <path d="M5.3 14h6.4" />          {/* A crossbar, ends on the legs at y=14 */}
    <path d="M18.5 5v14" />           {/* I stem */}
    <path d="M16.5 5h4M16.5 19h4" />  {/* I serifs, so it does not read as "l" or "1" */}
  </>
),
```

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/layout/Header.test.tsx › AI settings button shows the "ai" icon, not the sun-like "settings" icon (BUG-005)` — **regression, unit (jsdom)**. Render `Header` with `onSettings={vi.fn()}` (and the other required props as in the existing test); `const btn = screen.getByRole("button", { name: SETTINGS_COPY.open })`; `expect(btn.querySelector("svg")?.getAttribute("data-icon")).toBe("ai")`; `fireEvent.click(btn)` → `onSettings` called once. **Fails before the fix** (svg has no `data-icon`, and the button draws `settings`; even with `data-icon` added alone it would read `"settings"`). | AC 1, AC 3 |
| `src/features/layout/Header.test.tsx › theme toggle keeps its sun/moon icon` — render with `dark={true}` then `dark={false}`; button `"Đổi giao diện"` svg has `data-icon` `"sun"` / `"moon"`. | AC 4 (the fix did not swap the wrong icon) |
| `src/components/Icon.test.tsx › "ai" draws its own glyph, different from "sun" and "settings"` — render `<Icon name="ai" />`, `<Icon name="sun" />`, `<Icon name="settings" />`; the `ai` svg has at least one child element, contains no `<circle>`, and its `innerHTML` differs from both others. | AC 2 |
| `src/components/Icon.test.tsx › sets data-icon to the icon name` — `<Icon name="moon" />` svg has `data-icon="moon"` and keeps `aria-hidden`. | The test hook is stable and does not change accessibility |
| One-off Playwright check (D42; session's preinstalled Playwright, script outside the repo, not committed): `pnpm dev` with the dev token proxy, screenshot `header.topbar` at 390×844 and 1280×800 in light and dark (`prefers-color-scheme` / theme toggle). Record paths and result in impl-log; attach to the PR. | AC 2, AC 5 |

## Approach
1. `Icon.tsx`: add the `ai` entry (glyph above) next to `sparkle`; add `data-icon={name}` on the `<svg>`. Leave all
   other entries, including the now-unused `settings`, untouched (R7; removal is a follow-up).
2. `Header.tsx:42`: use `name="ai"`. Do not change `aria-label`, `className` or `onClick`.
3. Write the Header regression test first and confirm it fails on the unfixed code (record the failing output in
   impl-log), then apply steps 1–2 and confirm it passes. Add `Icon.test.tsx`.
4. Run the one-off Playwright check; record screenshots in impl-log.
5. Run all checks.

Rules: R6 — no new UI copy (the aria-label stays `SETTINGS_COPY.open`; "AI" is drawn as paths, not text). R7 — only
the four files above. R8 — regression + unit tests, green checks. R9 — 390px and dark mode screenshots; the glyph
uses `currentColor`. R1–R5 not touched (no data access, no secrets, no storage).

## Specialist input used
None (no consult files; areas `ui` only).

## Assumptions
- "Thành AI" means the letters "AI" drawn as the icon (the ticket's Expected: "an "AI" text badge"); a sparkle-only
  icon would not satisfy Ming's wording, and sparkle + "AI" does not fit legibly in 18px.
- `data-icon` on every `Icon` svg is harmless (a data attribute, not exposed to assistive tech) and is the smallest
  stable test hook.
- Hotspots: `src/features/layout/Header.tsx` and `src/components/Icon.tsx` are not named in the BUG-002/003/004
  ticket files at planning time; if another plan in this batch also edits them, expect a trivial rebase. `src/App.tsx`
  is not touched.

## Blocking questions
None.

## Split proposal
None (XS: ~15 lines of product code plus tests).

## Follow-ups (not in this diff)
- The `settings` entry in `Icon.tsx` becomes unused; remove it or redraw it as a real gear if a settings icon is
  needed later.
