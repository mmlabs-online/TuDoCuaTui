Status: READY

# Plan — BUG-003: Hero banner photos are cut off on mobile

## Feature summary
Bug ticket (D42): the reference is the bug report in `work/tickets/BUG-003/ticket.md`.

> **Expected** — "Both collage photos and their labels sit fully inside the hero card (a small decorative overlap is
> fine), not hidden behind the card edge; the title, text and Import/Export buttons stay readable and unobstructed."
>
> **Scope** — "Adjust the ≤ 650px hero collage CSS so both visible collage cards fit inside the hero card at
> 390px–650px, without covering the hero text or the Import/Export buttons."
>
> **Out of scope** — the sticky top bar overlapping the hero title; desktop/tablet hero layout (> 650px); collage content.

`work/decisions.md` D42: "Every bug fix ships with a regression test that fails before the fix (Playwright when jsdom
cannot see the bug) … until then a browser-only bug gets … a one-off Playwright check (the session's preinstalled
Playwright, script outside the repo) whose result is recorded in impl-log and review."

### Root cause — confirmed (planner re-ran it, Playwright on the real `src/index.css`)
`src/index.css:2233-2240` (inside `@media (max-width: 650px)` starting at `src/index.css:2193`):

```css
  .hero-collage {
    position: absolute;
    right: -45px;      /* collage box starts 45px outside the card */
    bottom: 0;
    width: 190px;      /* but .collage-2 (left: 88px + width: 112px, :2249-2252/:2241-2244) ends at 200px */
    height: 190px;
    transform: scale(0.8);
  }
```
`transform-origin: right center` is inherited from the `@media (max-width: 1000px)` block (`src/index.css:2187-2191`),
and `.intro { overflow: hidden }` (`src/index.css:2214-2220`, base at `:1457-1468`) clips whatever passes the card's
right edge. Measured before the fix (light and dark identical): `.intro` right edge 370 / 470 / 630 at 390 / 490 / 650px;
`.collage-1` right edge 373 / 473 / 633, `.collage-2` spans 327–440 / 427–540 / 587–700 → second card ~60–70%
outside the card. The ticket's numbers are correct.

Constraint found while prototyping: just moving the collage inwards (e.g. `right: 6px`) is not enough and makes the
cards cover the "Hôm nay có … món lâu chưa mặc" line at 390px (it ends at x≈245, y≈240–277). The collage must also
shrink towards the bottom-right corner, into the free area right of the Import/Export buttons and below the text.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: fails before the fix, passes after (named). | One-off Playwright check `bug003-hero-collage.cjs` (below, script outside the repo). Run against the pre-fix CSS (`git show HEAD:src/index.css` or `main`) → exits 1 with `inside:FAIL` at 390/490/650 px; run against the fixed `src/index.css` → exits 0 with all 6 rows `inside:PASS clear:PASS`. Both outputs pasted into impl-log; reviewer re-runs both. |
| 2 | Both visible collage cards and their labels lie inside the hero card (± 4px) in light and dark at 390, 490 and 650px. | Same script, assertion `inside` (6 rows: light/dark × 390/490/650). |
| 3 | Title, text and Import/Export buttons stay unobstructed. | Same script, assertion `clear`: no visible `.collage-card` box intersects any `.hero-copy > *` box (eyebrow, h1, text line) or any `.mobile-import .btn` box. Plus visual check of the screenshots. |
| 4 | Screenshots in light and dark at 390, 490 and 650px attached to the PR. | Script writes `hero-<light|dark>-<w>.png` (6 files) to its scratch dir; implementer attaches/links them in the PR body; reviewer opens them. |
| 5 | Only the ≤ 650px hero collage rule changes; > 650px layout unchanged. | `git diff main -- src/index.css` touches only the `.hero-collage` rule inside the `@media (max-width: 650px)` block at `src/index.css:2193`. |
| 6 | All checks pass. | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` all green. |

## Ming verification after merge
- On a real phone (light and dark), open the main screen with ≥ 2 items with photos: both collage photos ("Mới mua",
  "Yêu thích") are fully visible inside the hero card and do not cover the text or Import/Export buttons.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/index.css` | In the `@media (max-width: 650px)` block at line 2193, replace the `.hero-collage` rule (lines 2233-2240) as in **Approach** step 1. No other rule changes. | Root cause. |
| `work/tickets/BUG-003/impl-log.md` | Implementer log, incl. the Playwright before/after output. | Workflow; D42 records the one-off check here. |

No files outside the repo are part of the diff; the Playwright script and HTML fixture live in the session scratchpad.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `<scratch>/bug003/bug003-hero-collage.cjs` › one-off Playwright regression check (browser-only; no unit test can reproduce it — jsdom has no layout, D42) | AC 1–4: `inside` + `clear` assertions at 390/490/650 px × light/dark; fails before the fix, passes after; writes 6 screenshots. |

No unit test: the change is CSS-only, no pure logic changes (R8 does not require one).

### How to load the real CSS with the Hero markup
`pnpm dev` cannot be used: with no Node API answering `/healthz`, the app renders `ServerUnavailable` instead of the
main screen (D44, R1), so the Hero never mounts. Use a static HTML fixture in a scratch dir that links the CSS file and
reproduces `src/features/layout/Hero.tsx` markup inside `.app-shell > main`. Linking `src/index.css` directly via
`file://` works for this check: the browser ignores the unresolvable `@import "tailwindcss"`, and every hero rule is
plain CSS. (Optional higher-fidelity run: `pnpm build` and point the fixture at `dist/assets/index-*.css`.) Dark mode
is the `dark` class on `<html>` (`src/App.tsx:73`).

`<scratch>/bug003/hero.html` (replace `CSSHREF` with the absolute path of the CSS under test, e.g. via `sed`):
```html
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="file://CSSHREF"></head><body><div class="app-shell"><main>
<section class="intro"><div class="hero-copy"><p class="eyebrow">TỦ ĐỒ CÁ NHÂN</p>
<h1>Tủ đồ là <em>phong cách</em><br/> của bạn</h1><p>Hôm nay có 62 món lâu chưa mặc — thử một món nhé?</p></div>
<div class="hero-collage" aria-label="Một vài món đồ trong bộ sưu tập">
<div class="collage-card collage-1"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E" alt="a"><span>Mới mua</span></div>
<div class="collage-card collage-2"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E" alt="b"><span>Yêu thích</span></div>
<div class="collage-card collage-3"><span>Mặc nhiều nhất</span></div><div class="collage-card collage-4"><span>Dễ phối</span></div>
<i class="hero-sparkle sparkle-one">✦</i><i class="hero-sparkle sparkle-two">✧</i>
<svg class="hero-squiggle" viewBox="0 0 90 25"><path d="M2 17c14-23 29 16 44-6 14-20 25 14 42-8"/></svg></div>
<div class="mobile-import"><button class="btn">Import</button><button class="btn">Export</button></div>
</section></main></div></body></html>
```

`<scratch>/bug003/bug003-hero-collage.cjs` (run: `NODE_PATH=$(npm root -g) node bug003-hero-collage.cjs <abs path to fixture html>`):
```js
const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch(); const file = process.argv[2]; let fail = 0;
  for (const dark of [false, true]) for (const w of [390, 490, 650]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    await p.goto("file://" + file);
    if (dark) await p.evaluate(() => document.documentElement.classList.add("dark"));
    const r = await p.evaluate(() => {
      const R = (e) => { const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom }; };
      return {
        intro: R(document.querySelector(".intro")),
        cards: [...document.querySelectorAll(".collage-card")].filter((c) => getComputedStyle(c).display !== "none").map(R),
        blockers: [...document.querySelectorAll(".hero-copy > *, .mobile-import .btn")].map(R),
      };
    });
    const T = 4;
    const inside = (c) => c.l >= r.intro.l - T && c.r <= r.intro.r + T && c.t >= r.intro.t - T && c.b <= r.intro.b + T;
    const hit = (a, c) => a.l < c.r && c.l < a.r && a.t < c.b && c.t < a.b;
    const okIn = r.cards.length === 2 && r.cards.every(inside);
    const okClear = r.cards.every((c) => r.blockers.every((x) => !hit(x, c)));
    if (!(okIn && okClear)) fail++;
    console.log(dark ? "dark " : "light", w, okIn ? "inside:PASS" : "inside:FAIL", okClear ? "clear:PASS" : "clear:FAIL",
      r.cards.map((c) => [c.l, c.t, c.r, c.b].map(Math.round).join(",")).join(" | "), "intro", r.intro.r, r.intro.b);
    await p.setViewportSize({ width: w, height: Math.ceil(r.intro.b) + 20 });
    await p.screenshot({ path: path.join(path.dirname(file), `hero-${dark ? "dark" : "light"}-${w}.png`) });
    await p.close();
  }
  await b.close(); process.exit(fail ? 1 : 0);
})();
```
Assertions, exactly: (a) exactly 2 visible `.collage-card` elements (cards 3–4 are `display: none` at ≤ 650px);
(b) each card's bounding box (rotation included, label span sits inside it) lies within the `.intro` box ± 4px;
(c) no card box intersects a `.hero-copy > *` or `.mobile-import .btn` box. Exit code 0 only if all 6 rows pass.

## Approach
1. In `src/index.css`, `@media (max-width: 650px)` block at line 2193, replace the `.hero-collage` rule with:
   ```css
     .hero-collage {
       position: absolute;
       right: 20px;
       bottom: 10px;
       width: 200px;
       height: 190px;
       transform: scale(0.68);
       transform-origin: right bottom;
     }
   ```
   Why: `width: 200px` makes the box contain `.collage-2` (88 + 112); `right: 20px` puts the box inside the card;
   `transform-origin: right bottom` + `scale(0.68)` shrinks the cards into the bottom-right free area, right of the
   Import/Export buttons and below the text line. Planner's prototype of exactly this rule: all 6 rows
   `inside:PASS clear:PASS` (390px: cards 206–307 and 268–364, card edge 370; text ends at y≈277, cards start at
   y≈268 only at x ≥ 268, right of the text's x≈245). Leave `.collage-card`, `.collage-1`, `.collage-2` unchanged. Small
   value tweaks are fine if the check stays green and the screenshots look balanced; record them in impl-log.
2. Save the pre-fix CSS (`git show main:src/index.css > <scratch>/bug003/before.css`), run the check against it
   (expect exit 1, `inside:FAIL`), then against the fixed `src/index.css` (expect exit 0). Paste both outputs into
   impl-log; attach the six after-fix screenshots to the PR.
3. Run `pnpm format` then the checks.

Rules: R9 (mobile-first, 390px + dark) is the point of the ticket and is covered by the check; R7 — only this rule
changes; R1–R6 untouched (CSS only, no data, no copy).

## Specialist input used
None (no consult files).

## Assumptions
- **Hotspot:** BUG-004 (in progress in the same batch) also edits `src/index.css` — the ≤ 650px toolbar/search-box
  rules, likely in the same `@media (max-width: 650px)` block at line 2193 or the one at 2463. The edits are in
  different rules, so a textual conflict is unlikely, but the orchestrator should expect a rebase/merge of
  `src/index.css` and re-run this check after both land.
- The check uses blank SVG data-URI images; real photos are `object-fit: cover` inside fixed-size cards, so the card
  boxes (what is asserted) do not depend on the photo.
- Fonts come from Google Fonts via `@import`; if the scratch browser cannot reach them, text widths differ slightly
  from production. The prototype still had > 20px margin between text and cards at 390px, so the result holds.
- The extra `.intro { padding-bottom: 80px }` in the `@media (max-width: 650px)` block at `src/index.css:2463` (≈2550)
  stays as is; the fix relies on that free space below the text.

## Blocking questions
None.

## Split proposal
None.
