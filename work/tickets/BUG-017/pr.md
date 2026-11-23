<!-- PR title: BUG-017: Full-size photos are used for small grid thumbnails and rendering slows down -->
<!-- Branch: ticket/BUG-017 → main. Opened by Ming (no GitHub CLI on the agent's machine). -->

## Summary
- Grid photos (`ItemPhoto`: cards, hero collage, outfits modal) now ask the loader for a `thumb` variant: the browser downscales the fetched photo to 480 px longest edge (quality 0.8) using the existing resizer, worker first, main thread as fallback (new `src/data/photoThumb.ts`). ~6× fewer decoded pixels than the 1200 px originals; covers all existing photos with no backfill.
- `src/data/photoUrls.ts`: `acquire(src, variant)`, separate cache entries (`${id}#thumb`) with their own LRU (150); if thumbnailing fails, the full blob is shown; generation check after the extra await. Fetch URL is still `/api/photos/<id>` (R1/R4 unchanged).
- The editor stays full size (`usePhotoUrl` defaults to `"full"`; `Editor.tsx` untouched).
- `src/index.css`: removes `backdrop-filter: blur(6px)` from `.badge, .wear-pill` (their backgrounds are already 0.78–0.92 opaque).
- No `server/**` or `db/migrations/**` change.

## Acceptance criteria
- [x] Regression test fails on `main` and passes after — with main's `photoUrls.ts`, `ItemPhoto.tsx`, `index.css`: 7 failed incl. all 4 named regression tests (card/ItemPhoto request the thumb variant, makeThumb flow, no backdrop-filter on badges/pills); all pass here (review.md).
- [ ] Profile before/after; scrolling the grid is smooth — **Ming's step** (an authenticated browser profile needs real sign-in). Procedure in impl-log.md and below.
- [x] All checks pass — see Checks.

## Checks
- `pnpm format:check`, `pnpm typecheck`, `pnpm build`: green.
- `pnpm test`: 2023 passed, 6 failed, 288 skipped on the agent's Windows machine; all 6 in the known Windows-only files also failing on `main`. Please confirm CI is green.
- No textual conflict with the open branches T-029, T-032, BUG-014, BUG-016 (`git merge-tree`).

## Needs Ming's decision
- **Scope reading:** "thumbnails close to their display size" is met in decoded pixels; bytes downloaded stay the same (each card still fetches the original, mostly 304 after the first visit). If you also want fewer bytes, that is a server-side variant (High path) — proposed as a follow-up.
- **Ming verification after merge (before/after on the same account):**
  1. Foreground Chrome, 390 px viewport, DevTools Performance with 4× CPU throttling: scroll the grid of ~70 items to the end; compare fps / paint time with the previous release.
  2. DevTools: a card's `<img>` has `naturalWidth` ≈ 480; the editor photo ≈ 1200.
  3. A mid-range phone: grid scroll feels smooth.
  4. Light and dark: badges and wear pills still read well without the blur.

## Follow-ups
- Server-side thumbnail variant (fewer bytes; `server/**`, High path) — debt issue to open.
- `.topbar` 16px blur — only if the after-profile still shows heavy paint.
- Nits: the photo worker is now created during start-up by the first grid thumbnail, so its 5 s ready timeout could fire on a busy page (uploads would fall back to the main thread); if thumbnailing keeps failing, full-size blobs fill the 150-thumb LRU; the thumb LRU test does not also assert full entries still evict at 40.

Links: [plan.md](work/tickets/BUG-017/plan.md) · [review.md](work/tickets/BUG-017/review.md) · [impl-log.md](work/tickets/BUG-017/impl-log.md) · [consult-software-architect.md](work/tickets/BUG-017/consult-software-architect.md) · [consult-frontend-developer.md](work/tickets/BUG-017/consult-frontend-developer.md)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
