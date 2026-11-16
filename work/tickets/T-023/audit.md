# Mobile audit — 2026-11-16 (local mode, Playwright Chromium, DPR 1)

Viewports 320×568, 360×740, 390×844, 430×932; light and dark; ~240 screenshots + metrics in the session scratchpad (`mobile-audit/shots/<vp>-<theme>-<screen>.png`, `results-<vp>.json`, scripts `audit.cjs`, `extra.cjs`, `long.cjs`). Demo photos (Unsplash) were blocked by the sandbox proxy — placeholders are an environment artefact. Not reached: AI settings modal (API mode only). No separate locations screen; wear log is the editor's wear bar. **Page-level horizontal overflow: 0 everywhere.**

## P1 — broken or unusable
1. **Long item name breaks the editor sideways** (all widths): modal content grows to ~550 px and scrolls horizontally. Cause: `.photo-caption b { white-space: nowrap }` (`src/index.css:1912`) inside a `1fr` grid column (`.editor-body`, `index.css:1263`/`2293`). Fix: `grid-template-columns: minmax(0,1fr)` and `min-width:0` on `.photo-column`.
2. **"Xoá món đồ" confirm button invisible in light mode** (white on transparent, contrast 1.02): `.btn { background: transparent }` (`index.css:1412`) overrides `.btn-danger-fill` (`index.css:154`). Dark mode: label shows, no red fill.
3. **Dark: active category chip label invisible** (1.00): `.dark .categories button.active { color:#101c18 }` (`index.css:358`) vs the dark chip background (`index.css:1752`).
4. **Dark: green text nearly vanishes** (`.dark { --green:#0b2f24 }`, `index.css:1349`, used as text): "Xoá bộ lọc" (`.text-btn`, `index.css:270`) 1.03; "Copy mẫu" (`.code-head button`, `index.css:877`) 1.03.
5. **Full-screen modals use `100vh`** (`index.css:2306`/`2310`, `521`, `1252`) with a sticky footer: on iOS Safari the close button or "Lưu món đồ" may end up under the toolbar (code reading; verify on a real iPhone). Fix: `100dvh`.

## P2 — clearly poor
6. **iOS zoom on every input** (10–12 px): editor fields 11 px (`index.css:659`), search 11 px (`299`), filter selects 11 px (`315`), CSV paste 10 px, auth inputs 11 px (`AuthField.tsx`).
7. **Text far below 12 px**: card meta 9 px (`index.css:455`), wear pill/badges 9 px (`409`), card title 11 px (`1229`); editor caption "MÓN ĐỒ CỦA BẠN" 7 px (`1908`), field labels 10 px (`645`), colour/season chips 9 px; eyebrows 8 px; hero 10 px; buttons 11 px (`1418`); toast 11 px (`1055`); CSV preview 9–10 px (`2335`+).
8. **Tap targets < 44 px**: header theme/add and modal close 40×40; Import/Export 86×34; category chips 36 tall; colour/season chips 30 tall (Hạ 36×30); "Bỏ ảnh" 352×15; "Copy mẫu" 64×15; wear −1 and "Mặc hôm nay" 34 tall; `.btn min-height:39px` (`index.css:1412`); auth links ("Quên mật khẩu?") 20 tall.
9. **Header "Add item" button has no accessible name on mobile** (label hidden `index.css:1141`, no `aria-label` `Header.tsx:56`; "+" and `::after` "↗" cramped in 40 px). Modal close buttons lack `aria-label`: `Editor.tsx:84`, `ImportModal.tsx:87`, `ExportModal.tsx:21`.
10. **Long editor title overflows the fixed 86 px modal header** (wraps to 3 lines into the photo area, close button squashed; `.modal-header height`, `index.css:1855`).
11. **Editor chrome takes a third of iPhone SE**: sticky header 86 px + edit-mode footer 101 px (wraps to 2 rows, `index.css:1289`) leave ~380 of 568 px.
12. **Toast above modals** (z-index 200, bottom 15 px) covers the confirm-dialog button row (`index.css:1045`/`1319`).

## P3 — polish
13. 320 px: total-value stat wraps "₫" (`StatsRow.tsx:385`; `.money` 16 px).
14. Card title/meta single-line ellipsis; full name never shown on the card (`index.css:446`/`455`) — seems intentional.
15. Stats row, filter selects and category chips scroll horizontally with no hint (`index.css:1167`/`1203`).
16. Dark: shirt icon in the editor wear bar blends into its background.
17. `index.html` lacks `viewport-fit=cover`; safe-area insets are 0 (only used at `index.css:2373`); sticky footers and toast have no safe-area padding.
18. Auth screens fine apart from 6–8.
19. Grid: 2 cards per row at every width (165×289 at 390) — fine.

## Quick wins
`.editor-body { grid-template-columns: minmax(0,1fr) }` + `.photo-column { min-width:0 }` (1); reorder/raise specificity of `.btn-danger-fill` (2); drop `.dark .categories button.active` colour and add a light green for text in dark (3, 4); `100dvh` on `.modal`/`.modal-wide` (5); one `@media (max-width:650px)` rule `input, select, textarea { font-size:16px }` (6); `.btn`/`.icon-btn`/chips `min-height:44px` on touch (8); `aria-label`s (9); `.modal-header` `min-height` + 2-line clamp (10).
