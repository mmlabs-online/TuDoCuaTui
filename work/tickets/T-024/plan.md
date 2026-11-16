Status: READY

# Plan — T-024: Mobile layout and readability

## Feature summary
T-024 is not in `docs/feature-list.md`. It comes from Ming's request (ticket, "Feature reference"): *"Enhance UI responsive mobile"* and *"thiết kế layout mới cho Mobile nếu bị break"*, approved 2026-11-16: *"oke" to the T-024 proposal (fix all P1/P2, redesign the editor's mobile layout, no plan gate)*. Source of findings: `work/tickets/T-024/audit.md` (P1 1–5, P2 6–12, P3 13–19).

Feature-list lines this relies on:
- §1 Platform: *"Web app, mobile-first usage (photographing clothes at the closet)"*.
- §7 Definition of Done: *"works on mobile at 390px and in dark mode"*. Rule R9: *"UI changes work at a 390px viewport and in dark mode."*
- F-1101 (M2): *"aria labels on icon buttons, colour contrast AA"*. **Overlap:** T-024 does part of F-1101 early: the aria-labels from audit item 9 and contrast for the audited items only. Focus trap and focus rings stay in F-1101. This is not a scope conflict, because Ming asked for it in this ticket.
- D2 (`work/decisions.md`): *"Two buttons on mobile ('Chụp ảnh' …, 'Chọn từ thư viện' …). Desktop keeps one upload zone."* The plan keeps this: `.photo-source-actions` stays `(hover: none) and (pointer: coarse)` only.

Ticket scope, quoted: *fix every P1* (editor overflow, invisible "Xoá món đồ", dark active chip, dark green text, `100vh` → `100dvh`); *fix every P2* (16px inputs, ≥ 12px text, ≥ 44px targets, aria-labels, 2-line title clamp, toast vs modals); *new mobile editor layout*; *`viewport-fit=cover` + safe-area padding*; *P3 only where trivial (13 ₫ wrap, 15 scroll hint, 16 dark wear-bar icon; 17 is the viewport-fit item)*.

## Acceptance criteria → verification
"Verify script" means `scripts/mobile-verify.cjs` (created by this ticket; see *Tests to write*). The reviewer runs it against the dev server in **local mode**: no `.env.local` API/Supabase variables, same as the audit.
```
pnpm dev --port 5199 --strictPort            # terminal 1, local mode
NODE_PATH=$(npm root -g) node scripts/mobile-verify.cjs --out /tmp/t023-after          # terminal 2
# desktop baseline: same command against a `main` worktree on port 5198 with --base http://localhost:5198 --out /tmp/t023-before,
# then: node scripts/mobile-verify.cjs --desktop-only --out /tmp/t023-after --baseline /tmp/t023-before
```

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | No horizontal overflow on any screen at 320/360/390/430 px with long names | Verify script check **A** (`overflow`): for every viewport × theme × screen (home, filter-active, editor edit with long name, editor bottom, editor new, wear toast, delete confirm, discard confirm, import 3 tabs + CSV preview, export, empty): `scrollingElement.scrollWidth - innerWidth === 0`, `offscreen` list empty, and every `.modal` has `scrollWidth <= clientWidth + 1`. Exit code 0. |
| 2 | All audit P1 items fixed; contrast ≥ 4.5:1 for the affected text, light and dark | Check **E** (`contrast`): computed ratio ≥ 4.5 for `.confirm-content .btn-danger-fill` (delete and discard dialogs), `.categories button.active` label, `.text-btn` ("Xoá bộ lọc", with a filter active), `.code-head button` ("Copy mẫu", CSV tab), in light **and** dark. Also `.btn-danger-fill` computed `background-color` is `rgb(164, 69, 62)`. P1 1 → check A. P1 5 → check **F** (`.modal-wide` height === `innerHeight`) plus code reading: no `100vh` left in `.modal*` rules (`rg -n "100vh" src/index.css` shows only lines that are followed by a `100dvh` line, plus `.app-shell`). Before/after screenshots are in `--out`. |
| 3 | On ≤ 650 px: inputs 16px; body text, labels, chips ≥ 12px; buttons, chips, icon buttons ≥ 44px | Check **B** (`zoomInputs` empty), **C** (`tinyText` empty, decorative `aria-hidden`/sparkle glyphs excluded) and **D** (`smallTargets` empty) at all four viewports, light and dark, app screens and the 6 auth-preview screens. |
| 4 | Editor on 320×568: header + footer ≤ 25% of height, footer one row, form scrolls, nothing hidden behind the footer | Check **F** (`editor-320`), edit and new mode, normal and long name: `header.h + footer.h <= 142`; every visible footer button has the same `top` (±1) and `footer.h <= 64`; `.modal` `scrollHeight > clientHeight`; after scrolling to the end, the textarea's bottom ≤ footer top; long-name `h2` height ≤ 2 × line-height + 1; close button 44×44 and inside the viewport; `.upload-zone` height between 160 and 200 px. |
| 5 | Desktop (≥ 1024 px) unchanged apart from the shared fixes | Check **I** (`desktop`, 1280×800, light and dark): home, editor (normal name), editor new, delete confirm, import CSV tab, export. With `--baseline`, it prints the % of changed pixels per screen. Expected non-zero: delete confirm (red button, P1 2), dark home only if a category chip is active (default "Tất cả" is active, so yes: P1 3), dark editor (wear-bar icon, P3 16), dark import CSV ("Copy mẫu", P1 4). Every other screen must be 0.00%. Hard assertions: desktop `.editor-header` height is 86 with a normal name; footer shows 4 buttons in one row including "Huỷ"; "Thêm món đồ" label is visible in the header. |
| 6 | All checks pass; local mode unchanged | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` are all green. The verify script runs entirely in local mode (demo items, no login). No file under `src/data/` changes. |

## Ming verification after merge
- On a real iPhone (Safari): the editor sheet fills the screen. "Lưu món đồ" and "Xoá" sit above the home indicator and the Safari toolbar and stay tappable when the toolbar collapses or expands. Tapping any field does not zoom. The toast clears the home indicator. Chromium cannot emulate `env(safe-area-inset-*)` or the iOS toolbar, so only a real device can confirm audit items 5 and 17.
- Android Chrome: the same editor check, with the keyboard open on the "Ghi chú" field (the footer may ride above the keyboard, which is acceptable).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `src/index.css` | (a) In-place edits listed in Approach §1. (b) A new section appended at the very end: `/* T-024 — mobile layout and readability */`, with shared fixes, `@media (max-width: 650px)` and `@media (max-width: 650px), (pointer: coarse)`. | All P1/P2/P3 fixes and the editor layout. CSS first. |
| `index.html` | Line 6 only: `content="width=device-width, initial-scale=1.0, viewport-fit=cover"`. Keep every `figma:` comment untouched. | Audit 17. Not an R10 file: R10 lists `AGENTS.md`, `.figma/` and the Figma plugins in `vite.config.ts`. |
| `src/features/items/Editor.tsx` | Close button `aria-label={EDITOR_COPY.close}`. Footer `className="modal-footer editor-footer"`. Huỷ `className="editor-cancel"`. Save `className="editor-save"`. Nhân bản `className="editor-duplicate" aria-label={EDITOR_COPY.duplicate}` with its text wrapped in `<span className="btn-label">{EDITOR_COPY.duplicate}</span>`. No other change. | Audit 9; CSS hooks for the single-row mobile footer. |
| `src/features/items/copy.ts` | Add `close: "Đóng"` and `duplicate: "Nhân bản"` to `EDITOR_COPY`. | R6: copy in one place per feature. |
| `src/features/layout/Header.tsx` | Add `aria-label={LAYOUT_COPY.addItem}` to the primary Add `Btn`. | Audit 9 (the label span is hidden ≤ 650 px). |
| `src/features/layout/copy.ts` | Add `addItem: "Thêm món đồ"`. | R6. |
| `src/features/import-export/ImportModal.tsx` | Close button `aria-label={COPY.close}` (`COPY` = `IMPORT_EXPORT_COPY.import`). | Audit 9. |
| `src/features/import-export/ExportModal.tsx` | Close button `aria-label={COPY.close}`. | Audit 9. |
| `src/features/import-export/copy.ts` | Add `close: "Đóng"` to `import` and to `export`. | R6. |
| `src/features/items/StatsRow.tsx` | Line 24: `{`${total.toLocaleString("vi-VN")} ₫`}` (no-break space; keep the `items.reduce` expression as is). | P3 13: "₫" wraps at 320 px. |
| `src/features/items/Editor.test.tsx` | New tests (below). | R8: markup changes. |
| `src/features/import-export/ImportModal.test.tsx` | New test (below). | R8. |
| `src/features/layout/Header.test.tsx` (new) | Add-button name test. | R8. |
| `src/features/import-export/ExportModal.test.tsx` (new) | Close-button name test. | R8. |
| `src/features/items/StatsRow.test.tsx` (new) | No-break space test. | R8. |
| `scripts/mobile-verify.cjs` (new) | Playwright verification spec for the reviewer (not run by `pnpm test`; no new dependency). | AC 1–5 cannot be tested in jsdom. |

Not touched: anything under `src/features/auth/**` (High tier; the auth fixes are CSS-only through `.field` and `.btn`), `src/data/**`, `vite.config.ts`, `AGENTS.md`, `.figma/`, `package.json`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `Editor.test.tsx › header › close button is named "Đóng"` | `getByRole("button", { name: EDITOR_COPY.close })` exists and calls `onClose` when the item is clean. |
| `Editor.test.tsx › footer › edit mode exposes the mobile layout hooks` | `isNew=false`: `.editor-footer` exists; `.editor-cancel`, `.editor-save`, `.editor-duplicate .btn-label` exist; `getByRole("button", { name: EDITOR_COPY.duplicate })` calls `onDuplicate`. |
| `Editor.test.tsx › footer › new mode has no duplicate button` | `isNew=true`: no `.editor-duplicate`, `.editor-save` present. |
| `ImportModal.test.tsx › close button is named "Đóng"` | `getByRole("button", { name: IMPORT_EXPORT_COPY.import.close })` calls `onClose`. |
| `ExportModal.test.tsx › close button is named "Đóng" and closes` | Same for `export.close`. |
| `Header.test.tsx › Add button keeps an accessible name when its label is hidden` | `aria-label === LAYOUT_COPY.addItem`; click calls `onAdd`. |
| `StatsRow.test.tsx › total value keeps ₫ on the same line` | The `.money` text ends with `" ₫"`. |
| `scripts/mobile-verify.cjs` (manual, reviewer) | Checks A–I below; exits 1 on any failed hard assertion and prints a JSON summary plus the screenshot paths. |

**Verify script spec** (`scripts/mobile-verify.cjs`, CommonJS, `require("playwright")` resolved via `NODE_PATH`). Reuse `metrics()` and the screen steps from the audit scripts (`…/scratchpad/mobile-audit/audit.cjs`, `extra.cjs`, `long.cjs`; copy the code, because the scratchpad is not durable). Flags: `--base <url>` (default `http://localhost:5199`), `--out <dir>` (required), `--desktop-only`, `--baseline <dir>`. Contexts: `isMobile: true, hasTouch: true, deviceScaleFactor: 1` for the 4 phone viewports; `isMobile: false, hasTouch: false` for desktop 1280×800. Theme is set through `localStorage["tu-do-theme"]`. The long-name fixture patches `localStorage["tu-do-items"][0]` exactly as `audit.cjs` does (name, brand, location).
- **A overflow**: as in AC 1.
- **B zoomInputs**: `metrics().zoomInputs` is empty.
- **C tinyText**: `metrics().tinyText` is empty. Skip elements inside `[aria-hidden="true"]`, `.hero-sparkle`, `.card-sparkle`, `.modal-doodle`.
- **D smallTargets**: `metrics().smallTargets` is empty. Exempt: `input[type=file]`, `input[type=checkbox|radio]` whose `<label>` is ≥ 44 px, `.item-card` and `.stat-card` (large by design; measured anyway).
- **E contrast**: targeted ratios as in AC 2 (text against the composited background, same math as `metrics()`). Also wear-bar icon (`.wear-bar > div:first-child > span`, `color` vs `background`) ≥ 3:1 in dark. Print the full `lowContrast` list as **info** only.
- **F editor-320**: as in AC 4, at 320×568 light and dark. Also at all four viewports: the footer is one row and `.modal-wide` height === `innerHeight`.
- **G meta**: `meta[name=viewport]` content contains `viewport-fit=cover`.
- **H toast**: at 390×844, open the editor and click "Mặc hôm nay". The `.toast` rect does not intersect any `.modal-footer .btn` or `.modal-header .icon-btn`, and its computed `pointer-events` is `none`. Without a modal (save → toast on home), the toast bottom is ≤ `innerHeight - 15`.
- **I desktop**: as in AC 5. The pixel diff runs in Chromium: load both PNGs into canvases via `page.evaluate` and count pixels whose RGBA differs by > 8 in any channel. No new npm dependency.

## Approach
Order: in-place fixes → the new CSS section (shared → ≤ 650 → touch) → JSX/copy → unit tests → verify script → run the script and iterate until A–I pass → checks.

### 1. In-place edits in `src/index.css` (keep specificity and cascade order)
- **P1 3 (dark active chip)**, lines 358–360: replace the body of `.dark .categories button.active` with `background: #fff8eb; border-color: #fff8eb; color: #1a1a1a;`. This follows the existing inverted `.dark .btn-primary` pattern. Line 358 currently loses to 1752 on background, so move this rule into the new section (it must come after line 1752). Delete lines 358–360 and add it there.
- **P1 4 (dark green text)**: add `--green-ink: #0f3d2e;` to the restyle `:root` (line 1328 block) and `--green-ink: #bfe3c5;` to the restyle `.dark` (line 1343 block). `#bfe3c5` is the existing mint of the palette. Measured: 10.7:1 on dark `--surface` `#1c2a24`, about 9.5:1 on `--surface-2` `#22342c`, 5.7:1 on dark `--soft` `#315844`. Light stays identical, because `--green-ink` equals the light `--green`. Change `color: var(--green)` → `color: var(--green-ink)` **only** on: line 118 (`.icon-btn:hover`, also 119 `border-color`), 271 (`.text-btn`), 491 (`.no-results > span`), 615 (`.upload-icon`), 619 (`.ai-btn`), 819 (`.check-row > span`), 880 (`.code-head button`), 929 (`.parse-summary`), 950 (`.backup-note`). Leave background/border uses of `--green` alone, and leave lines 100, 174, 230, 691, 722, 766, 790 and 987 alone (overridden later, or on light pastel backgrounds).
- **P1 5 (`100vh`)**: line 521 → `max-height: calc(100vh - 40px); max-height: calc(100dvh - 40px);`. Line 1252 → `95vh` followed by `95dvh`. Lines 2306 and 2310–2311 → each `100vh` line followed by the same property with `100dvh` (the fallback for old browsers stays first).

### 2. New section at the end of `src/index.css`
**2a. Shared (all widths)** — the fixes that legitimately reach desktop:
- P1 1: `.editor-body { grid-template-columns: 320px minmax(0, 1fr); }`, `.photo-column, .form-column { min-width: 0; }`.
- P1 2 (same root cause as BUG-001): `.btn.btn-danger-fill, .btn.btn-danger-fill:hover { background: #a4453e; border-color: #a4453e; color: #fff; }`. Fixed colour in both modes: white on dark `--danger` `#e27c73` is only 2.85:1; white on `#a4453e` is 6.0:1.
- P2 10: `.editor-header { height: auto; min-height: 86px; padding-block: 12px; gap: 12px; }`, `.editor-header > div { min-width: 0; flex: 1 1 auto; }`, `.editor-header .icon-btn { flex: 0 0 auto; }`, `.editor-header h2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; line-height: 1.2; }`. With a normal one-line name the desktop header stays 86 px.
- P1 3 rule moved here (see §1).
- P3 16: `.wear-bar > div:first-child > span { background: #fff8eb; color: #0f3d2e; }`. Identical to today in light; visible in dark.
- Safe areas (all 0 on desktop): `.app-shell { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }`, `.toast { bottom: calc(24px + env(safe-area-inset-bottom)); }`.

**2b. `@media (max-width: 650px)` — readability, modals, toast, P3**
- Inputs (P2 6): `input, select, textarea, .field input, .field select, .field textarea, .searchbox input, .filter-select select, .paste-area { font-size: 16px; }`. Then `.field input, .field select { height: 44px; }`, `.field textarea { height: 96px; }`, `.searchbox, .filter-select select { height: 44px; }`, `.searchbox input { height: 100%; }`.
- Text ≥ 12 px (P2 7). Set exactly these values (all others in the audit list become 12px):
  - 12px: `.eyebrow` (letter-spacing 0.1em), `.card-info p`, `.badge`, `.wear-pill`, `.photo-placeholder span`, `.panel-heading span`, `.stat-card > span`, `.stat-card small`, `.field > span`, `.upload-zone small`, `.photo-caption small`, `.wear-bar small`, `.check-row small`, `.parse-summary small`, `.progress > div`, `.instructions p`, `.backup-note p`, `.code-head`, `.or`, `.export-options small`, `.photo-note`, `.file-icon`, `.bulk-drop p`, `.csv-preview li`, `.csv-preview-title`, `.csv-error`, `.import-summary`, `.coming-soon`, `.import-content pre`, `.collage-card span`, `.intro > .hero-copy > p:last-child`.
  - 13px: `.btn`, `.toast`, `.categories button`, `.tabs button`, `.choice-chips button`, `.text-btn`, `.remove-photo`, `.check-row b`, `.parse-summary b`, `.export-content > p`, `.confirm-content p`.
  - 14px: `.upload-zone b`. 15px: `.wear-bar b`.
  - Match existing specificity where needed (`.wear-bar .btn`, `.intro > .hero-copy > p:last-child`, `.stat-card strong.money`).
- Hero: `.intro { padding-bottom: 80px; }`, so the absolutely placed `.mobile-import` (now 44 px tall at bottom 18 px) never covers the hero text.
- P3 13: `.stat-card strong.money { font-size: 18px; white-space: nowrap; }`, plus the no-break space in `StatsRow.tsx`.
- P3 15 scroll hint: `.stats-grid, .toolbar, .categories { mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }` (also the `-webkit-mask-image` duplicate).
- Modals (P1 5): `.modal { max-height: 100vh; max-height: 100dvh; overscroll-behavior: contain; }`. `.modal-footer { padding-bottom: calc(11px + env(safe-area-inset-bottom)); }`. `.confirm-content { padding: 28px 20px calc(24px + env(safe-area-inset-bottom)); }`, `.confirm-content > div > .btn { flex: 1 1 0; }`. `.export-content { padding-bottom: calc(20px + env(safe-area-inset-bottom)); }`.
- Toast (P2 12, see Assumptions): `.toast { left: 12px; right: 12px; bottom: calc(15px + env(safe-area-inset-bottom)); pointer-events: none; }` and `html:has(.modal-backdrop) .toast { top: calc(12px + env(safe-area-inset-top)); bottom: auto; }`. z-index stays 200.
- Header add button: `.header-actions .btn-primary::after { display: none; }`.
- **Editor mobile layout**: see §3.

**2c. `@media (max-width: 650px), (pointer: coarse)` — tap targets (P2 8)**
`.btn { min-height: 44px; }` and, at their own specificity, `.wear-bar .btn, .mobile-import .btn, .bulk-drop .btn, .photo-source-actions .btn, .photo-column .ai-btn { min-height: 44px; }`. `.icon-btn, .header-actions .btn-primary { width: 44px; height: 44px; min-height: 44px; }`. The `.header-actions .btn-primary` part goes inside the ≤ 650 block only, because on desktop the Add button shows its label. `.categories button, .choice-chips button, .tabs button { min-height: 44px; }`, `.choice-chips button { padding: 0 14px; }`, `.choice-chips { gap: 8px; }`. `.text-btn, .code-head button { min-height: 44px; padding-inline: 8px; }`. `.remove-photo { min-height: 44px; }`. `.searchbox button { width: 44px; height: 44px; display: grid; place-items: center; margin-right: -14px; }`. Auth links (LinkButton in `AuthLayout.tsx`, no semantic class): `button.self-center.underline { min-height: 44px; padding-inline: 8px; }`, with a comment naming `AuthLayout.tsx`. This keeps the diff out of `src/features/auth/**`. Use the verify script's `smallTargets` list to catch any remaining element.

### 3. Editor mobile layout (inside the 2b block; numbers are for 320×568)
Structure top → bottom. The `.modal-wide` sheet is the only scroll container; the header and footer stay `position: sticky` (existing).
1. **Sheet**: `.modal-wide { width: 100%; height: 100vh; height: 100dvh; max-height: 100vh; max-height: 100dvh; border-radius: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; }`. `.modal-backdrop` already has `padding: 0` on mobile. Full height on every phone ≤ 650 px.
2. **Header (sticky top)**: `.editor-header { min-height: 56px; padding: calc(6px + env(safe-area-inset-top)) 12px 6px 16px; gap: 8px; }`. `.editor-header .eyebrow { display: none; }` (decorative; the title says the same thing). `.editor-header h2 { font-size: 20px; line-height: 1.2; }`, with the 2-line clamp from 2a. Close `.icon-btn` 44×44 on the right, `flex: 0 0 44px`. Height: 56 px (1 line) / 60 px (2 lines: 6 + 48 + 6).
3. **Photo column**: `.photo-column { padding: 12px 16px 16px; }`.
   - `.upload-zone { width: 100%; aspect-ratio: auto; height: clamp(160px, 32dvh, 300px); padding: 6px; border-radius: 18px; }` → 182 px at 568, 237 at 740, 270 at 844, 298 at 932. `.upload-zone img { object-fit: contain; border-radius: 12px; }`, so the whole garment shows and the yellow frame fills the rest. Empty state: `.upload-icon` 40×40, `b` 14px, `small` 12px with line-height 1.5.
   - `.photo-source-actions` (touch only, existing 2-column grid): `margin-top: 8px`; buttons 44 px.
   - **Caption**: `.photo-caption { margin-top: 8px; padding: 8px 12px; border-radius: 12px; gap: 8px; }`. `small` 12px, weight 700, letter-spacing 0.08em, line-height 1.2. `b` Fraunces 17px, line-height 1.25, single line with ellipsis (now works thanks to `min-width: 0`). `> span` 28×28. Height ≈ 54 px.
   - `.photo-column .ai-btn { margin-top: 8px; width: 100%; }` (44 px). `.remove-photo { margin-top: 4px; width: 100%; }` (44 px, 13px, centred).
4. **Form column**: `.form-column { padding: 16px 16px 24px; }`.
   - **Wear bar** (edit mode): `.wear-bar { flex-direction: column; align-items: stretch; gap: 10px; padding: 12px; }`, `.wear-bar > div:last-child { flex-direction: row; gap: 8px; }`, `.wear-bar .btn { width: auto; }`, `.wear-bar .btn:first-child { flex: 0 0 56px; }` (the −1 button), `.wear-bar .btn-primary { flex: 1 1 auto; }`. Row 1 is the icon + text, row 2 the buttons, both 44 px.
   - `.form-section-title { font-size: 20px; margin-bottom: 12px; }`.
   - `.form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 10px; }`. Fields as in 2b (labels 12px, controls 44 px / 16px, textarea 96 px).
   - Chips: 44 px, 13px, gap 8. `.choice-chips.colors { max-height: none; overflow: visible; }`: no nested scroller inside the scrolling sheet.
5. **Footer (sticky bottom, one row)**: `.editor-footer { min-height: 0; flex-wrap: nowrap; gap: 8px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }`. `.editor-footer > div { gap: 8px; min-width: 0; }`, `.editor-footer > div:last-child { flex: 1 1 auto; justify-content: flex-end; }`. `.editor-footer .editor-cancel { display: none; }` (the header ✕ does the same `requestClose`). `.editor-footer .editor-save { flex: 1 1 auto; }`. `.editor-footer .editor-duplicate { width: 44px; padding: 0; }`, `.editor-footer .editor-duplicate .btn-label { display: none; }` (it keeps its `aria-label`). Override `.modal-footer > div:first-child .btn { padding: 0 10px }` with `.editor-footer > div:first-child .btn` at higher specificity where needed. Result: edit mode `[🗑 Xoá] [⧉] [ Lưu món đồ ↗ ]`; new mode `[ Lưu món đồ ↗ ]` full width. Height 60 px.
6. Chrome budget at 320×568: 56 + 60 = 116 px (20.4%); with a 2-line title 120 px (21.1%) ≤ 142. The footer is in the normal flow (sticky), so the last field scrolls fully above it.

Desktop (> 650 px, fine pointer) keeps: 320 px photo column, 3/4 upload zone, eyebrow, 4-button footer with Huỷ, "Nhân bản" text.

### 4. JSX/copy (Files table). Run `pnpm format`.

### Rules
- R1: no data-layer change; local mode is exercised by the verify script.
- R6: all new strings go in the feature copy files.
- R7: only the listed files.
- R8: unit tests for the markup changes; checks green.
- R9: 320–430 px, light and dark, are covered by the script.
- R10: `index.html` is allowed (only the viewport content changes; figma comments stay). No change to `vite.config.ts`, `AGENTS.md` or `.figma/`.
- R2–R5: not touched.

### Size estimate
About 280 lines of CSS (≈ 255 added, ≈ 25 edited), ≈ 20 lines of TSX/copy, ≈ 90 lines of unit tests, ≈ 260 lines of verify-script tooling. Product lines ≈ 300 < 400, one migration-free slice → no split.

## Specialist input used
None (no `consult-*.md`). The audit (`audit.md`) is the input; all its quick wins are adopted. The one adjusted item is P2 12 (toast), explained under Assumptions.

## Assumptions
- **Toast "below modals"** is interpreted as "never covers modal controls", not as a z-index below the backdrop. A lower z-index would hide save and wear errors behind the backdrop while the editor is open (`App.tsx:100`, `App.tsx:231`). The toast therefore stays on top, but on phones it moves to the top edge while a modal is open (via `:has()`; iOS 15.4+, Chrome 105+) and is `pointer-events: none`. On desktop it stays bottom-right. If Ming wants it literally behind the modals, the change is one `z-index` line.
- **BUG-001 overlap**: BUG-001 (P0, BACKLOG, "Confirm button invisible in confirm dialogs") has the same root cause as audit P1 2. T-024 fixes it with `.btn.btn-danger-fill`. The orchestrator should either run BUG-001 first (then T-024 skips that rule) or close BUG-001 as fixed by T-024. The verify script's check E covers BUG-001's AC 2 for the delete and discard dialogs. The AI-key dialog is API mode only.
- **Backlog ID clash**: `work/backlog.md` line 57 also uses ID `T-024` ("Lower the password minimum to 6 characters"). The orchestrator should renumber one of them; this plan is for "Mobile layout and readability" (line 56).
- Hiding "Huỷ" on phones is acceptable: the header ✕ calls the same `requestClose` (with the discard prompt).
- Auth tap targets and font sizes are fixed CSS-only (`.field input`, `.btn`, LinkButton selector), so no file under `src/features/auth/**` (High tier) changes. Follow-up: give `LinkButton` a semantic class (e.g. `auth-link`) in an auth ticket.
- `object-fit: contain` for the mobile photo is a deliberate mobile-only change, so the garment isn't cropped in a short wide box.
- Hotspots: `src/index.css` and `Editor.tsx` are shared with F-202.1 / F-603 (BACKLOG). The new CSS is appended in its own section to keep rebases simple.
- Follow-ups (not in this diff): `autoFocus` on the name field opens the keyboard on every editor open on phones; `role="status"` on the toast; focus trap and focus rings (F-1101).

## Blocking questions
None.

## Split proposal
None.
