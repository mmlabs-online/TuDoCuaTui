# F-704.1 consult — frontend-developer (2026-11-18)

**Findings**
- Items reach components as `wardrobe.items` (App.tsx line 50), already mapped to Vietnamese labels (`category`,
  `status` "Đang dùng", `seasons: string[]`, `lastWorn` string). `Editor` is driven by App state:
  `setEditor({...item}); setIsNew(false)` (the ItemGrid `onOpen` pattern, lines 183-186).
- `Modal` (`src/components/Modal.tsx`) has an Escape stack, backdrop click to close, and `.modal-header`, `.eyebrow`,
  `h2`, `icon-btn`. ExportModal is the simplest template. Copy lives in a `copy.ts` per feature (`IMPORT_EXPORT_COPY`,
  `LAYOUT_COPY`, `SETTINGS_COPY`), each with a `copy.test.ts`.
- `isStale(i, now)` and `ageInDays` already take an injected `now`; `STALE_DAYS` is 90. `categoryIcons` is keyed by
  label. `ItemPhoto` needs `fallback={<span>{categoryIcons[cat]}</span>}`.
- The Header has a `.header-actions` row with icon buttons plus `desktop-btn` Import/Export (hidden on mobile). Hero
  has a `.mobile-import` block shown only on mobile.
- Mobile `.modal` is a bottom sheet (95dvh); at the narrowest breakpoint it goes to 100dvh. `.modal-wide` is
  full-height on mobile.

**Recommendations**
- Entry point: the main button in Hero's `hero-copy`, under the "lâu chưa mặc" line (visible at every width, fits
  "thử một món nhé?"). Optionally an `icon-btn` in the Header; do not crowd the Header (3 icons plus Add at 390px).
- Limit App.tsx hotspot growth: `outfitsOpen` state, one `onOutfits` prop on Hero, one
  `<OutfitsModal items onClose onOpenItem />`. No suggestion logic in App.
- Layout: `src/features/outfits/{suggest.ts, suggest.test.ts, copy.ts, copy.test.ts, OutfitsModal.tsx,
  OutfitsModal.test.tsx}`. Skip a hook unless needed.
- Purity: `suggestOutfits(items, { now, seed }): Outfit[]`, `Outfit = { pieces: Item[]; reasons: ReasonKey[] }`.
  Include `seasonOf(now)` (UTC+7: `now + 7h` then `getUTCMonth`, mapping as a named constant). A small seeded PRNG
  (mulberry32) and Fisher-Yates shuffle; no `Math.random` or `Date.now` inside. The modal owns `seed` in
  `useState(() => Date.now())`; "Đổi gợi ý" increments it. Memoize on `[items, seed]`, with `now` captured once at
  mount. Use CATEGORY_TO_DB ids or label constants, not scattered string literals. Reasons are keys; copy maps them
  to Vietnamese.
- Opening the editor: `onOpenItem(item)` does `setEditor({...item}); setIsNew(false)` and closes the outfits modal
  (simpler than stacking, no double backdrop).
- Do not add the new modal to an `:has(> ...)` rule; add `.outfit-*` classes in `index.css` with `var(--surface)` and
  `var(--border)` tokens only, for dark mode.

**Risks**
- The toast rule `html:has(.modal-backdrop) .toast` is fine.
- At 390px use a single-column outfit list; add `env(safe-area-inset-bottom)` padding to the modal body, as
  `.export-content` does.
- `ItemPhoto` uses a lazy observer; tests need the PhotoLoaderContext (see ItemCard.test).
- The "out-of-season fallback" and "too few" rules are ambiguous (see questions).
- Empty `lastWorn` gives `ageInDays` 999, so never-worn counts as stale automatically.

**Open questions**
- Cold seasons for outer: Thu and Đông, or Đông only?
- Shoes absent: still show the outfit? (Ticket says "when available", so yes.)
- Fewer than 3 distinct main pieces: show fewer outfits, with no padding?
- Do items with an empty `seasons` array count as all-season, and rank equal to in-season?
