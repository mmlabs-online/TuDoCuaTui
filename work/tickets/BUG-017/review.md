## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check`: "All matched files use the correct format."
- `pnpm typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json`): clean.
- `pnpm test`: 6 failed | 2023 passed | 288 skipped (5 failed files). All failures are the known pre-existing Windows
  failures on main, in files this diff does not touch: `server/ai/tagPhoto.test.ts` (2), `server/api.test.ts` (1),
  `server/index.cli.test.ts` (1), `server/scoping.test.ts` (1), `src/features/auth/boundary.test.ts` (1). impl-log
  reports 7 (3 in tagPhoto). The 1-test difference is in the same pre-existing flaky file, so it is not a mismatch that
  matters.
- `pnpm build`: green (`built in 686ms`).

### Regression evidence (reviewer re-run)
I checked out `src/data/photoUrls.ts`, `src/components/ItemPhoto.tsx` and `src/index.css` from `origin/main`, ran
`pnpm vitest run` on the four regression files, then restored the files from HEAD (`git status` clean afterwards).
Result: 7 failed | 35 passed. All four plan regression tests fail on main's source:
- `photoUrls.test.ts › thumb variant › thumb variant: makeThumb gets the fetched blob and createUrl gets its result`
- `ItemPhoto.test.tsx › asks the loader for the thumb variant`
- `ItemCard.test.tsx › ItemCard photo › asks the loader for the thumb variant`
- `cardPaint.test.ts › card paint cost › card badges and wear pills have no backdrop-filter`
- Also failing: `› a makeThumb failure falls back to the full blob`, `› thumb and full of the same id are separate
  entries`, `› thumbs use their own keepUnused limit (default 150)`.
All pass on HEAD. This matches impl-log.

### Acceptance criteria
- [x] AC1 Regression test fails on main, passes after: evidence above (reviewer re-run).
- [x] AC2 Cards, hero collage and outfit tiles use the thumb; editor keeps full: `src/components/ItemPhoto.tsx:15`
  passes `variant: "thumb"` (shared by ItemCard, Hero, OutfitsModal); `usePhotoUrl.ts:15` defaults to `"full"`;
  `usePhotoUrl.test.tsx › default variant is full (editor path)` passes; `git diff origin/main...HEAD --
  src/features/items/Editor.tsx` is empty.
- [x] AC3 Thumb failure shows the full photo: `photoUrls.ts:88-93` catches a `makeThumb` rejection and keeps the full
  blob; `photoThumb.ts:27-34` retries on the main thread after an off-thread failure; tests `› a makeThumb failure
  falls back to the full blob` and the `photoThumb.test.ts` cases pass.
- [x] AC4 Separate caches, no refetch on scroll-back for ~70 cards: key `${id}#thumb` (`photoUrls.ts:126`), separate
  LRU sets and limits (`photoUrls.ts:66,169-176`, thumbs 150); tests `› thumb and full of the same id are separate
  entries`, `› thumbs use their own keepUnused limit (default 150)`, `› clear revokes thumb URLs ...` pass.
- [x] AC5 Pill/badge `backdrop-filter` removed: `git diff origin/main...HEAD -- src/index.css` is exactly one removed
  line (old 421); `cardPaint.test.ts` passes. `.topbar` and `.modal-backdrop` untouched.
- [x] AC6 Profile before/after: impl-log "Profile (Ming's step — agents cannot sign in)" carries the full procedure
  (foreground Chrome, Performance recording, Paint/Decode/Rasterize, phone, `$0.naturalWidth` ≈ 480 vs editor ≈ 1200,
  light/dark look check, the "already smooth" exit). Numbers are Ming's step by plan design; not blocking.
- [x] AC7 All checks pass: see Checks (only pre-existing failures).
- [x] AC8 R9 390px / dark mode: no layout change. No `.dark` rule redefines `.badge`/`.wear-pill`; the remaining rules
  (`index.css:422-441`, `1833-1848`, `1269`, `2600`) keep opaque or 0.78–0.92 backgrounds.

### Code review (focus areas from the orchestrator)
- **Object-URL lifecycle**: every URL is created once per entry (`photoUrls.ts:95`) and revoked by `drop`
  (`photoUrls.ts:71-75`, uses `e.variant`/`e.key`) on LRU eviction and by `clear` (`photoUrls.ts:186-188`) for both
  variants. Release of the last ref adds the entry key to its own variant's set and evicts only ready entries of that
  variant. A queued release removes by entry key (`photoUrls.ts:164-168`). Thumb and full of the same id hold separate
  URLs, so releasing one never revokes the other (tested). No leak found.
- **Generation check after the extra await**: `photoUrls.ts:94` runs after both `res.blob()` and `makeThumb`, before
  `createUrl`. A `makeThumb` that resolves after `clear()` creates no URL (test `› clear revokes thumb URLs; a
  makeThumb that resolves after clear creates no unrevoked URL`). `clear` already rejected the entry, so the later
  `reject` is a no-op.
- **Fallback to the full blob**: a `makeThumb` rejection is swallowed and the full blob is shown. `thumbWith` always
  releases the decoded image in `finally` (`photoThumb.ts:11-17`), including on render failure (tested).
- **Shared worker (A5)**: thumb work runs inside the loader's `run()`, so at most `maxConcurrent` (4) thumb jobs reach
  the worker at once. Each worker request has its own 20 s timer from post time, and the host handles messages
  concurrently (async handlers), so there is no head-of-line queue behind upload jobs. A 1200→480 px load+render is
  far below 20 s. If the worker does break, uploads fall back to the main thread (`photoPrep.ts:161-173`) and thumbs do
  too (`photoThumb.ts:27-34`), which is correct but slower. Accepted as planned; see the nit on worker start-up below.
- **R1**: no component calls `fetch`; the thumb is made inside the data-layer loader; no fallback/demo mode added.
- **R4 / D34**: the fetch URL is unchanged, `/api/photos/<id>` with the bearer and no query (asserted in the first
  regression test); display is still through `blob:` URLs.
- **R3**: nothing new reaches the client config; no `VITE_*` change.

### Scope
Changed source files exactly match the plan's file list (`photoThumb.ts`, `photoUrls.ts`, `usePhotoUrl.ts`,
`ItemPhoto.tsx`, `useWardrobe.ts`, `index.css`, plus the planned tests). No High path touched (`server/**`,
`db/migrations/**`, Docker and deploy files are unchanged). impl-log "Out-of-plan files: None" is accurate.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R1, R3, R4 hold (see above). R5, R6 n/a. R7: diff stays inside the plan. R8: new pure logic
(`photoThumb`, variant keying, fallback, per-variant LRU) has unit tests. R9: no layout change.

### Blockers from review agents
None (no review-trigger path changed).

### Nits (do not block)
- The worker is now created on the first grid thumb, during page start-up, instead of on the first upload. Its 5 s
  ready timeout (`photoWorkerClient.ts:31,58`) therefore runs while the page is busy; if it fires, the worker is
  marked broken for the whole page and later uploads use the main thread. This is correct but degraded. Worth a look
  in Ming's phone check.
- When `makeThumb` fails, the full-size blob is cached under the thumb key and counts against the 150-thumb limit, so
  in the worst case (thumbnailing always fails) up to 150 full-size blobs stay in memory instead of 40. This is
  unlikely, because both off-thread and main thread would have to fail.
- `› thumbs use their own keepUnused limit` does not also assert that full entries still evict at `keepUnused` in
  the same loader, which the plan's test table mentions. The separation is covered by code reading and the
  separate-entries test.
- Opening the editor fetches the full variant separately from the card's thumb (a second request, normally a 304 via
  the ETag). This is expected under D34.

### Follow-ups (out of scope)
- A1: debt issue "BUG-017 follow-up: server-side thumbnail variant (bytes)" (High path, needs plan approval), to be
  opened by the orchestrator per the plan default.
- A4: `.topbar` blur only if Ming's after-profile still shows heavy paint.
- Ming verification after merge (carry into the PR): the before/after DevTools profile, `$0.naturalWidth` ≈ 480 on a
  card and ≈ 1200 in the editor, phone check, and the light/dark look check of pills, badges, hero collage and outfit
  tiles (plan "Ming verification after merge", steps 1–5).
