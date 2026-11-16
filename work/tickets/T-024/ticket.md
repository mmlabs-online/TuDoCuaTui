# T-024: Mobile layout and readability

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E5 — UI |
| Areas | ui |
| Gate | none |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-16 |
| Claimed by | claude@2026-11-16T09:38:01Z |
| PR | — |

## Goal
The app is comfortable to use on phones (320–430 px, light and dark): nothing breaks, text is readable, every control is easy to tap, and the item editor has a proper mobile layout.

## Feature reference
Ming, 2026-11-16: "Enhance UI responsive mobile" and "thiết kế layout mới cho Mobile nếu bị break". Mobile audit: `audit.md` in this folder (P1 1–5, P2 6–12, P3 13–19). R9 mobile-first.

## Scope
- Fix every P1 in the audit: editor horizontal overflow with long names; invisible "Xoá món đồ" confirm button; dark-mode active category chip; dark-mode green text contrast; `100vh` modals → `100dvh`.
- Fix every P2: inputs 16px on mobile (no iOS zoom); minimum readable text (≥ 12px for body/labels/chips on mobile); tap targets ≥ 44px on touch; `aria-label` on the header Add button and modal close buttons; modal header grows with a 2-line title clamp; toast below modals.
- **New mobile layout for the item editor** (the worst break): compact header, photo area and caption that shrink with the screen, a single-row sticky footer (Lưu / Xoá) with safe-area padding, full-height sheet on phones.
- Add `viewport-fit=cover` and safe-area padding for sticky footers and the toast.
- P3 items only where trivial (₫ wrap at 320 px, scroll hint on horizontally scrolling rows, dark wear-bar icon).

## Out of scope
- New features, data or auth changes; the Figma Make plugins (R10); desktop redesign (desktop must not regress).

## Acceptance criteria
- [ ] No horizontal overflow on any screen at 320/360/390/430 px with long names (re-run the audit scripts).
- [ ] All audit P1 items fixed (before/after screenshots; contrast ≥ 4.5:1 for the affected text in light and dark).
- [ ] On ≤ 650 px: inputs/selects/textareas are 16px; body text, labels and chips ≥ 12px; buttons, chips and icon buttons ≥ 44px tall/wide.
- [ ] Editor on 320×568: header + footer take ≤ 25% of the height, footer is one row, the form scrolls, nothing is hidden behind the footer.
- [ ] Desktop (≥ 1024 px) unchanged apart from the shared fixes (screenshots).
- [ ] All checks pass; local mode unchanged.

## Notes / answers from Ming
- 2026-11-16: renumbered T-023 → T-024 (T-023 is the password-minimum ticket from another session). This ticket also fixes BUG-001 (invisible confirm button; audit P1 #2).
- 2026-11-16 (Ming): "oke" to the T-023 proposal (fix all P1/P2, redesign the editor's mobile layout, no plan gate).

## Handoff
