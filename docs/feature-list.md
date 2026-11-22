# Tủ đồ của tôi — Feature List

> Backend superseded by D23 (2026-11-10): Supabase was removed in T-016; mentions of Supabase, Auth, RLS and Storage below are historical and are re-planned on the Node backend.

> **For Claude Code:** this file is the source of truth for planning. Read it together with `README.md`,
> `docs/data-model.md` and `supabase/migrations/`. Your job:
> 1. Turn each feature (`F-xxx`) into one or more tickets. Split anything estimated above **M** into tickets of at most 1 day each.
> 2. Keep the IDs, priorities, dependencies and milestones given here. Flag any conflict with the actual code instead of silently changing the scope.
> 3. Produce a plan, ordered by milestone and then by dependency, listing which tickets can run in parallel.
> 4. Use the ticket template at the bottom of this file.

---

## 1. Context

| | |
|---|---|
| Product | Personal wardrobe tracker: track items, where they are stored, how often they are worn; import and export the collection |
| Users | Single owner first (personal use). Data model is already per-user (RLS), so friends/family can sign up later without schema changes |
| Platform | Web app, mobile-first usage (photographing clothes at the closet) → PWA later |
| Frontend | React 19 + Vite 8 + Tailwind v4 + TypeScript. UI originally exported from Figma Make, now maintained only in this repo (D44) |
| Backend | Supabase: Postgres + Auth (email + password, shared stoktok accounts; D19) + Storage (private bucket `wardrobe`), on the shared stoktok project (D17) |
| Language | UI copy in Vietnamese; code, file names, DB ids and tickets in English |

### Current state (after PR #1 `feat/supabase-backend`)
- Schema: `tudo_locations`, `tudo_items`, `tudo_item_photos`, `tudo_wear_logs`, and the view `tudo_items_with_stats` (every DB object is prefixed `tudo_`, D17); RLS per user; storage policies on `{user_id}/{item_id}/...`.
- Data layer: `src/data/repo.ts` (the `WardrobeRepo` interface with **local** and **supabase** implementations), `src/data/useWardrobe.ts`, `src/data/mappers.ts` (Vietnamese label ↔ enum id).
- Local mode (localStorage + demo items) was removed in D44: the app always runs against the Node API; an unreachable server shows an error screen, never demo data.
- `AuthGate` provides email + password login (T-006, D19) and a sign-out button.
- **Known gaps:**
  - `ImportModal` is a mock (adds 4 demo items).
  - Search is not diacritic-insensitive.
  - `src/types/database.ts` is hand-written.
  - No tests, no CI.
  - Not yet verified against a real Supabase project.
  - `App.tsx` is monolithic.
  - Wear is limited to once per item per day (`unique(item_id, worn_on)`), always for today.

### Domain glossary
- **Item (món đồ):** one piece of clothing or accessory. Categories: `top, bottom, dress, set, shoes, ao_dai, outer, bikini, accessory, other` (D29; `bag`, `sport`, `home` retired).
- **Status (trạng thái):** `active` (Đang dùng), `stored` (Cất kho), `laundry` (Đang giặt-sửa), `lent` (Cho mượn), `out` (Muốn thanh lý).
- **Location (vị trí lưu trữ):** a closet, drawer or box. Can be nested (`parent_id`).
- **Wear log (lần mặc):** one row per item per day worn. `wear_count` and `last_worn` are derived from these rows, never stored.
- **Stale (lâu chưa mặc):** last worn 90 or more days ago, or never worn and added 90 or more days ago (D51).

---

## 2. Priorities & sizing

- **P0:** required for the milestone to be usable. **P1:** important, same milestone if capacity allows. **P2:** nice to have / later.
- Sizes: **S** ≤ ½ day, **M** ≈ 1 day, **L** 2–3 days (must be split), **XL** > 3 days (must be split into an epic).

## 3. Milestones

| Milestone | Goal | Exit criteria |
|---|---|---|
| **M1 — Usable MVP** | I can put my real wardrobe into the app and use it daily on my phone browser | Real Supabase project live; CRUD with photos works; real CSV/photo import; deployed URL; CI green |
| **M2 — Daily use** | Fast, pleasant daily logging from the phone | PWA installable; camera capture; back-dated wear; locations management; better search |
| **M3 — Smart wardrobe** | The app helps decide what to wear and what to let go of | AI auto-tagging; outfits; insights and declutter flow |
| **M4 — AI stylist** (milestone, not Ming step `M-4`) | Pick an occasion, get 3 outfits, and see one on a chibi avatar at a bounded AI cost | Sticker spike decided (F-705); shared key, credits and $20 cap live (F-706); occasion suggestions live (F-707); then either chibi viewing (F-708, F-709) or the real-photo collage (F-710) |

---

## 4. Features

### E0 — Foundation & DevEx

#### F-001 · Verify the Supabase backend end-to-end · P0 · M1 · S
Set up the real Supabase project and verify PR #1.
- **Acceptance criteria**
  - Project created, migration applied (`supabase db push`), redirect URLs configured for local and prod.
  - Manual test script in `docs/qa/smoke-test.md`: sign in → add an item with a photo → edit → wear today / undo → duplicate (photo copied) → delete (storage file removed).
  - Any bug found gets its own ticket.
- **Notes:** this task is mostly manual (owner). Claude Code writes the smoke-test doc and checklist.

#### F-002 · Generated DB types · P0 · M1 · S · depends on F-001
- Replace the hand-written `src/types/database.ts` with `supabase gen types typescript --linked`.
- Add a `pnpm db:types` script and document it in the README.
- **AC:** `tsc --noEmit` passes with the generated types; no `any` introduced.

#### F-003 · CI pipeline · P0 · M1 · S
- GitHub Actions on every PR: `pnpm install --frozen-lockfile`, `tsc --noEmit`, `oxfmt --check`, `pnpm build`, and `vitest run` (once F-005 exists).
- **AC:** the workflow runs on PRs to `main`; status checks are required in branch protection (owner sets this manually).

#### F-004 · Split `App.tsx` into modules · P0 · M1 · L
- Target structure:
  - `src/components/` for UI primitives: `Icon`, `Btn`, `Modal`, `Field`, `Confirm`, `Skeleton`, `Empty`
  - `src/features/items/` for `ItemCard`, `ItemGrid`, `Editor`, `FilterBar`, `StatsRow`
  - `src/features/import-export/`
  - `src/constants/wardrobe.ts` for the label lists, color map and frame colors (one source shared with `mappers.ts`)
- **AC:** no visual or behavioural change (compare screenshots before and after); `App.tsx` under 250 lines; build and typecheck pass.
- **Notes:** split into 3 tickets (primitives → items feature → modals). Do this **before** the larger UI features to avoid merge conflicts.

#### F-005 · Test setup · P0 · M1 · M
- Vitest + React Testing Library + jsdom.
- Unit tests for `mappers.ts` (round trip of every label) and for `createLocalRepo`.
- Helpers for filter, sort and the "stale" rule extracted from `App.tsx` and tested.
- **AC:** `pnpm test` is green in CI; coverage of `src/data/**` is at least 80%.

#### F-006 · RLS & DB tests · P1 · M1 · M · depends on F-001
- `supabase test db` (pgTAP) covering:
  - user A cannot read, update or delete user B's items, photos, wear logs or locations
  - user A cannot attach a wear log or photo to B's item
  - the storage policy blocks the path `{otherUser}/...`
- **AC:** the tests run locally with `supabase start` and are documented. Running them in CI is optional (P2).

#### F-007 · Deploy · P0 · M1 · S
- Deploy to Vercel or Cloudflare Pages (owner decides); preview deploy per PR; env vars configured.
- Add the production URL to the Supabase redirect URLs.
- **AC:** the prod URL works with email + password login on a phone (D19).

#### F-008 · Error monitoring · P2 · M2 · S
- Sentry (or similar) for frontend errors; no PII in events.

---

### E1 — Auth & Account

#### F-101 · Login screen polish · P1 · M1 · S
- Restyle `AuthGate` to the app's design language.
- Add a resend button with a 60 s cooldown, and clear errors for invalid email or rate limit.
- **AC:** matches the app style in light and dark mode; works on a 390px viewport.

#### F-102 · Google sign-in · P2 · M2 · S
- Supabase OAuth with Google, shown next to the email + password form (D19).

#### F-103 · Account menu · P1 · M2 · S
- Header avatar menu: email, theme toggle, export data, sign out.

#### F-104 · Delete account & all data · P2 · M3 · M
- Edge Function removes the storage folder `{uid}/`, then the DB rows (cascade), then the auth user. Requires typed confirmation.

---

### E2 — Items core

#### F-201 · Item editor hardening · P0 · M1 · M
- Save button shows a loading state and stays disabled while saving.
- Validation: name required (max 120 chars), price ≥ 0, purchase date not in the future.
- Unsaved-changes guard when closing the modal.
- **AC:** no double submits; error toasts use the messages from `useWardrobe.message()`.

#### F-202 · Photo pipeline · P0 · M1 · M
- Accept JPEG, PNG, WebP and **HEIC** (iPhone); convert HEIC client-side or show a clear error message.
- Show upload progress; reject files over 10 MB before resizing.
- Grid uses lazy-loaded images; signed URLs refresh automatically when expired (they currently live 1 hour).
- **AC:** a photo taken on iPhone and on Android uploads successfully; nothing broken after the app stays open for more than 1 hour.

#### F-203 · Multiple photos per item · P2 · M3 · M
- Gallery in the editor (up to 5 photos): reorder, set primary, delete.
- Schema already supports it (`item_photos.is_primary`); the repo currently replaces the single photo.

#### F-204 · Wear history on item detail · P1 · M2 · S
- List of dates from `wear_logs` (latest 30) plus "Đã mặc N lần trong 90 ngày".

#### F-205 · Bulk actions · P1 · M2 · M
- Multi-select mode on the grid; change status or location, or delete, for the selected items.
- **AC:** a single confirm for delete; changes are sent in batched requests, not N round trips where avoidable.

#### F-206 · Sold / donated tracking · P2 · M3 · S
- When status becomes `out`, optionally record the outcome (sold, donated, thrown away), the date and the sale price.
- Needs a migration (`disposed_at`, `disposal_type`, `sale_price`).

---

### E3 — Locations

#### F-301 · Locations management screen · P1 · M2 · M
- List, rename, reorder, delete (only when empty, or move its items to another location first), merge two locations.
- **AC:** renaming updates every item instantly, with no stale text anywhere.

#### F-302 · Nested locations · P2 · M2 · M · depends on F-301
- Closet → drawer hierarchy using `parent_id`; filtering by a parent includes its children.
- Breadcrumb labels on cards ("Tủ phòng ngủ › Ngăn 2").

---

### E4 — Search & Filters

#### F-401 · Diacritic-insensitive search · P0 · M1 · S
- Normalise with NFD, strip diacritics and handle `đ`, so "ao so mi" matches "Áo sơ mi".
- Search across name, brand, colors, tags, material, notes and location.
- **AC:** unit tests for the normaliser.

#### F-402 · Persist filters & sort · P1 · M2 · S
- Remember the last filters and sort in localStorage; "Xoá bộ lọc" resets them.

#### F-403 · Filter by tag · P1 · M2 · S
- Tag chips, plus a tag filter in the toolbar.

---

### E5 — Wear tracking

#### F-501 · Back-dated wear · P0 · M2 · S
- "Mặc hôm nay" keeps its current behaviour; add a "Chọn ngày" option (date picker, max today).
- **AC:** the unique-per-day rule shows a friendly message ("Đã ghi nhận ngày này rồi").

#### F-502 · Quick wear from the grid · P1 · M2 · S
- Long-press or hover action on a card to log today's wear without opening the editor.
- Optimistic update with rollback on error.

#### F-503 · Wear calendar · P2 · M3 · M
- Month view of what was worn each day (photo thumbnails).

---

### E6 — Import & Export (replace the mocks)

#### F-601 · CSV import · P0 · M1 · L
- Parse CSV with RFC 4180 quoting; detect `,` vs `;` delimiter; strip the UTF-8 BOM (Excel exports).
- Header aliases in Vietnamese and English (e.g. `Tên` / `name`, `Loại` / `category`, `Vị trí` / `location`).
- Values: category, status and season accept Vietnamese labels or ids, case- and diacritic-insensitive; multi-values are separated by `;` or `|`.
- Preview step: first 20 rows, per-row validation errors, and the count of rows that will be imported or skipped.
- Import sequentially with a progress bar; locations are find-or-create.
- **AC:** the template CSV from the UI round-trips; a 200-row file imports without errors; invalid rows are reported and do not block the valid ones.
- **Notes:** split into parser + validation (pure functions, unit tested) and preview UI + import.

#### F-602 · JSON backup & restore · P0 · M1 · M
- Export the full JSON (items + wear logs + locations, with photo paths) under `{version: 1}`.
- Restore upserts by id and is idempotent: running it twice changes nothing.
- **AC:** export, restore into an empty account and export again give identical JSON (except timestamps and photo URLs).

#### F-603 · Bulk photo import · P0 · M1 · M
- Select or drop N photos; each one becomes an item. The name comes from the file name, and a default location and status are chosen once for the batch.
- Process sequentially with progress; failed files are listed with a retry option.
- **AC:** 30 phone photos import in one go; the browser does not freeze (resize work off the main thread if needed).

#### F-604 · Real CSV export · P0 · M1 · S
- Export all fields plus `wear_count` and `last_worn`, with proper quoting (current code wraps values in `"` without escaping) and a UTF-8 BOM.
- The CSV must re-import through F-601.

#### F-605 · Export photos as ZIP · P2 · M3 · M
- Client-side ZIP (e.g. `fflate`) of all photos named `{item-name}-{id}.jpg`.

---

### E7 — AI

#### F-701 · Edge Function `tag-item-photo` · P1 · M3 · M
- Input: a storage path or an image. Output JSON: `{name, category, colors[], seasons[], material, brand, tags[]}`, restricted to the allowed ids.
- Calls a vision LLM server-side; the API key lives only in Supabase secrets; strict JSON validation (zod).
- Per-user rate limit (e.g. 100 calls/day) and a size limit on the image.
- **AC:** returns valid ids only; returns a clear error code on rate limit; unit-tested parser.

#### F-702 · "✨ Tự điền từ ảnh" in the editor · P1 · M3 · S · depends on F-701
- Fills empty fields only and never overwrites what the user typed; adds an undo option.

#### F-703 · AI in bulk photo import · P1 · M3 · S · depends on F-701, F-603
- A checkbox in the import modal; when on, each photo is tagged during import.

#### F-704 · Outfit suggestion · P2 · M3 · L
- "Hôm nay mặc gì?": suggests 3 outfits from active items using season, weather (optional) and stale items first.
- Status: F-704.1 to F-704.5 are MERGED and T-032 is an open tidy-up. F-707 extends this flow and does not re-spec it.

#### AI stylist (F-705 to F-710) · overview

Locked by Ming on 2026-11-21. **The D33 amendment below is pending a decision entry in `work/decisions.md`; F-706 must not start until that entry exists.** The spike has not been run.

**Flow:** the user picks an occasion (fixed enum, no free text) → rules prefilter the wardrobe → a cheap text model picks 3 outfits from metadata only → the outfits are shown immediately → the user taps "Xem trên chibi" → only missing item stickers are generated → the app composites stickers on a preset avatar in layer order main → outer → shoes → accessory.

**Problem and outcome:** AI suggestions today need each user's own API key, so a user without a key cannot use them, and a suggestion gives no picture of the outfit on a body. No user research or usage data backs this yet; the spike and the metrics below are the first evidence. The outcome is that any signed-in user can see a suggested outfit without an API key, while total AI spend stays bounded.

**Success metrics** (no baseline yet; targets need Ming, see OQ-14):
- Share of suggestion sessions that open a chibi view.
- Sticker cache hit rate on chibi views.
- Monthly provider spend against the $20 cap.

**Locked decisions (Ming, 2026-11-21):**
- Avatar: preset, choose hair, skin and body. No face photos.
- Stickers: generated on user tap, once per item. The item photo is sent to the provider only then. Cache by photo hash + style version + model.
- Provider: default Gemini; compare with OpenAI on the same 10 items before locking.
- Shared key: the admin (existing `owner` role for v1, D50) manages one shared AI key; all users use it, limited by credits. **Amends D33 (BYOK); decision entry pending.** High tier; Ming approves the plan.
- Credits: a Postgres ledger (reserve, commit on success, refund on failure). The in-memory rate limiter is not sufficient.
- App-wide spend cap: $20/month. At the cap AI features turn off and the rest of the app works. A provider console cap is also set (Ming step).
- Legacy BYOK: stop using immediately; keep ciphertext until the admin key works; delete only after Ming confirms (irreversible).
- Sticker storage: Google Drive, not counted in the user's photo quota.

| Action | Credits |
|---|---|
| Cached suggestion, or viewing an existing chibi | 0 |
| AI photo fill | 1 |
| New AI suggestion | 1 |
| Draw or redraw a sticker | 10 |
| Welcome grant | +300 |
| Monthly grant (no rollover) | +60 |

The admin can adjust the grant numbers and add credits manually.

**Known limit:** the $20 cap covers about 16 new users spending all welcome credits in a month (30 stickers, $1.20 each), or about 83 existing users spending monthly credits (6 stickers, $0.24 each), at the highest sticker price of about $0.04 and excluding text cost. Prices come from search snapshots and must be rechecked against live pricing pages before F-706.2 ships.

**Non-goals (v1):** face photos or personal likeness; free-text occasions; per-user API keys; paid credit purchase; prompt caching (not prioritized); Batch outside the explicit "prepare whole wardrobe" action; saving outfits (F-801 to F-803).

#### F-705 · Sticker spike on 10 hard items · P1 · M4 · M
- Run on the same 10 hard items (including patterned, ao dai and dark items) with Gemini and OpenAI. Spike code stays out of `server/` and production.
- **AC:** each output is scored without the source photo in view; the result records score per provider, cost per image from the live pricing page, and the recommended provider.
- **Gate:** pass if at least 8/10 are recognizable without the source photo. Pass unlocks F-708 and F-709. Fail cancels them and activates F-710.

#### F-706 · Shared AI key, credit ledger and spend cap · P1 · M4 · L (split) · High · depends on the D33 amendment entry
- **F-706.1 Ledger:** Postgres ledger with reserve, commit and refund; welcome and monthly grants applied lazily on first AI use (there is no users table, D50).
- **F-706.2 Spend cap:** app-wide monthly spend meter with a versioned model price table.
- **F-706.3 Shared key:** owner-only storage, replacement and test of one shared key, inactive until F-706.4.
- **F-706.4 Cutover:** photo fill, bulk tagging and suggestions use the shared key, credits and cap. BYOK keys are no longer read.
- **F-706.5 Admin API:** owner-only grant settings, manual credit add, and spend view.
- **F-706.6 Admin screen:** UI for F-706.3 and F-706.5.
- **F-706.7 User credit UI:** balance, cost display, out-of-credit and AI-off states; the BYOK form is retired. Ships in the same release as F-706.4.
- **F-706.8 Legacy ciphertext deletion:** not runnable until Ming confirms in writing that the admin key works (irreversible).
- **AC:**
  - Concurrent requests cannot overspend: with a balance for one action, N parallel requests produce exactly one reservation (DB test).
  - The same idempotency key never charges or calls the provider twice, and replays the stored result.
  - A failed provider call refunds credits. Its estimated cost stays in the spend meter unless the provider confirms no charge, because a timed-out call may still be billed.
  - Reservations count against the cap before the provider call, so parallel calls cannot pass $20.
  - At the cap, AI routes answer a distinct error with no provider call, and all non-AI routes still work.
  - Monthly credits expire without rollover at the month boundary in UTC+7 (see OQ-4).
  - Non-owners get 403 on every key and admin route, and no response ever contains the key or its hint for them.
  - After F-706.4 no code path decrypts a BYOK key; existing ciphertext is unchanged until F-706.8.
  - The bulk import stops cleanly when credits run out: finished photos stay, the rest are reported as not tagged.
- **Technical notes:** new tables follow D32 RLS. App-wide rows and admin reads across users do not fit the `owner_only` policy, so the plan must propose a narrow access path.

#### F-707 · Occasion and suggestion token optimization · P1 · M4 · L (split) · can run in parallel with F-706
- **F-707.1 Occasion rules:** fixed occasion enum and a pure prefilter in the rule pool; candidate cap lowered. Runs after BUG-012 and BUG-013, which change the same `eligibility()` logic.
- **F-707.2 Server contract:** the suggest route accepts the occasion and enforces the new candidate cap.
- **F-707.3 Same-day cache:** server-side cache in Postgres.
- **F-707.4 Occasion UI:** occasion picker in the outfits modal; AI runs only on an explicit action.
- **AC:**
  - Occasion is validated against the enum; free text is rejected with 400.
  - At most 20 candidates reach the provider, enforced on the server (target about 15 to 20, down from 40).
  - The suggestion request contains no image data (test on the outgoing provider payload).
  - A repeat request on the same UTC+7 day with the same wardrobe fingerprint, occasion and weather bucket makes no provider call and costs 0 credits.
  - The fingerprint covers item ids and prompt metadata, not wear logs, so logging a wear does not spend a credit.
  - The existing shuffle action is a new AI suggestion (1 credit) and replaces the cached result.
  - Changing weather or place never triggers a paid call by itself. Today the modal calls the AI automatically on these changes; this must be removed.
  - A client disconnect after dispatch does not waste the call: the result is stored and committed, and a retry with the same idempotency key gets it.

#### F-708 · Sticker generation and storage pipeline · P1 · M4 · L (split) · High · depends on F-705 pass, F-706.4
- **F-708.1 Storage:** sticker table and Drive storage.
- **F-708.2 Provider adapter:** image generation for the provider chosen in F-705, with input and output downscaling.
- **F-708.3 Generate route:** cache lookup, credits, idempotency, per-item result.
- **F-708.4 Serving and lifecycle:** authenticated sticker read; cleanup when an item or its photo is removed.
- **F-708.5 Batch job (P2):** explicit "prepare whole wardrobe" action on the server, using the provider Batch API.
- **F-708.6 Batch UI (P2):** cost preview, confirmation and progress.
- **AC:**
  - A cache hit (photo hash + style version + model, inside the caller's own scope) makes no provider call and costs 0. Stickers are never shared across users.
  - The source is the item's primary photo (`is_primary`). An item with no photo is skipped with no charge.
  - The photo is sent to the provider only after a user tap; no background, import or suggestion flow sends it (Batch only through F-708.5).
  - No automatic image retry: one provider call per attempt, verified by test. Failure refunds the 10 credits.
  - Input and output images are downscaled to limits fixed by the spike; a test asserts the outgoing size.
  - Redraw is explicit and costs 10. The old sticker stays until the new one succeeds.
  - Sticker files do not count in `item_photos` quotas.
  - **`server/photo-sweep.js` must not delete stickers.** It deletes files tagged `app=tudo` with no `item_photos` row, so stickers need their own Drive tag and a test proving the sweep leaves them alone.

#### F-709 · Avatar and chibi viewing screen · P1 · M4 · L (split) · depends on F-705 pass, F-708.4
- **F-709.1 Avatar presets:** hair, skin and body picker, and the preset art.
- **F-709.2 Compositor:** pure layer-order logic and rendering.
- **F-709.3 Chibi screen:** "Xem trên chibi" flow from a suggested outfit.
- **AC:**
  - Layer order is main → outer → shoes → accessory (unit test).
  - Only missing stickers are requested; a fully cached outfit opens at 0 credits with no provider call.
  - The credit cost is visible before the tap.
  - If one sticker fails, the others still show, the failed item can be retried by tap, and only successes are charged.
  - No face photo input exists anywhere in the flow.
  - Works at 390px and in dark mode (R9); Vietnamese copy stays in one place (R6).

#### F-710 · Real-photo outfit collage (fallback) · P2 · M4 · M · only if F-705 fails
- Shows a suggested outfit as a collage of the user's existing item photos, in the same layer order. No provider call, 0 credits.
- **AC:** uses the existing authenticated photo path; an item with no photo shows a placeholder; works at 390px and in dark mode.

#### Open questions — AI stylist

Each has a proposed default. None of these defaults is a decision until Ming confirms it. Brainstorm options, token-saving rationale and the architecture consult are in [ai-stylist-notes.md](ai-stylist-notes.md); those notes are advice, not decisions.

*Before F-706 starts*
- **OQ-1 Sign-up abuse.** Join policy is `open` (D38), and each verified account gets 300 credits ($1.20), so about 17 accounts can use the whole monthly cap and turn AI off for everyone. Default: add a daily limit on new welcome grants, adjustable by the admin. Alternative recommended in review, because a daily limit only slows the drain: existing users get 300 credits and new users get theirs after admin approval.
- **OQ-2 Existing users.** Do accounts that already exist get the 300 welcome credits? Default: yes, once.
- **OQ-3 Owner credits.** D38 exempts the owner from global AI ceilings. Does the owner also skip credits and the cap? Default: the owner uses credits like anyone and can top up; the $20 cap applies to everyone.
- **OQ-4 Credit expiry and month boundary.** Does the welcome grant expire, and which credits are spent first? Default: welcome and manual credits never expire; monthly credits are spent first; months follow UTC+7. The provider's billing month may differ.
- **OQ-5 Legacy key removal by a user.** Should a user still be able to delete their own stored key before F-706.8? Ming's rule (2026-11-21) does not say whether it covers a user removing their own key. Default: yes, keep `DELETE /api/ai-settings/key`, because it is that user's own secret.
- **OQ-6 Provider data terms.** Under the shared key, every user's photos go to a provider account Ming owns, and a photo may show a person wearing the item. D40 removed the Drive privacy notice. Default: use a paid tier whose terms exclude training, and show a one-time notice before the first photo is sent.
- **OQ-16 Cutover order.** F-706.4 starts charging credits, while the outfits modal still calls the AI automatically until F-707.4 lands. Default: F-707.4 ships before or in the same release as F-706.4, so no user is charged without tapping.

*Before F-707 starts*
- **OQ-7 Occasion list.** The enum values are not decided, and items have no occasion field. Default: Ming supplies 4 to 6 occasions; the rules map them from category and existing tags only, with no schema change. Proposed list: "Đi làm", "Đi chơi", "Hẹn hò", "Dự tiệc", "Du lịch".

*Before F-708 and F-709 start*
- **OQ-8 Spike judge.** Who scores "recognizable"? Default: Ming, blind, viewing stickers only.
- **OQ-9 Fit on the avatar.** The 8/10 gate tests recognizability, not whether stickers align on a body. Default: record a composite on one preset in the spike as a non-gating note.
- **OQ-10 Mixed providers.** If OpenAI wins for images, the app has no OpenAI text adapter and "one shared key" no longer covers both steps. Default: keep Gemini for text and allow one key per provider.
- **OQ-11 Not enough credits for all missing stickers.** Default: generate nothing, show the shortfall, and let the user pick items.
- **OQ-12 Style version bump.** Do existing stickers regenerate? Default: no; keep showing them, and a new draw happens only on a redraw tap.
- **OQ-13 Avatar art and persistence.** Who supplies the preset art and its license, how many options, and where is the choice saved? Default: one commissioned or hand-made layered set, saved per device, so no migration is needed.

*Before launch*
- **OQ-14 Targets.** Set numeric targets and an owner for the success metrics. Default: review after 30 days of data.
- **OQ-15 Bulk fill cost.** A 300-photo AI import uses the whole welcome grant, leaving nothing for stickers. Default: show the credit cost in the import modal before starting.

---

### E8 — Outfits

#### F-801 · Outfit schema · P1 · M3 · S
- Migration: `outfits(id, user_id, name, notes, created_at)` and `outfit_items(outfit_id, item_id, position)`, both with RLS.
- Add `wear_logs.outfit_id` (nullable).

#### F-802 · Outfit builder · P1 · M3 · L · depends on F-801
- Pick items from the grid into a canvas or collage; name and save the outfit; list and edit outfits.

#### F-803 · Wear an outfit · P1 · M3 · S · depends on F-802
- "Mặc bộ này hôm nay" writes one wear log per item, all sharing the `outfit_id`.

---

### E9 — Insights & Declutter

#### F-901 · Stats page · P1 · M3 · M
- Items by category, color and location; total value; **cost per wear** (price / wear_count); top 10 most worn; never worn.
- Computed in SQL views or RPC functions, not on the client, once there are more than about 1k items.

#### F-902 · Declutter flow · P2 · M3 · M
- Suggests items that are stale for 180 days or more, never worn, or have a high cost per wear.
- Swipe-style keep / let go → sets status `out`.

---

### E10 — PWA & Mobile

#### F-1001 · Installable PWA · P0 · M2 · M
- Manifest, icons and a service worker (`vite-plugin-pwa`); app-shell caching.
- Splash screen and theme colour match the design.
- **AC:** Lighthouse PWA "installable" passes; installs on iOS Safari and Android Chrome.

#### F-1002 · Camera capture · P0 · M1 · S
- Photo inputs use `accept="image/*" capture="environment"` on mobile, while keeping the gallery option.

#### F-1003 · Offline read cache · P2 · M2 · M
- Show the last loaded wardrobe when offline (TanStack Query persist, or the service worker caching API responses); writes are disabled with a banner.

---

### E11 — Quality

#### F-1101 · Accessibility pass · P1 · M2 · S
- Keyboard navigation in modals (focus trap, Esc to close), aria labels on icon buttons, colour contrast AA, visible focus rings.

#### F-1102 · Large-wardrobe performance · P2 · M3 · M
- Virtualise the grid once there are more than 300 items; memoise filtering; serve thumbnails at a smaller size (signed URL with transform, or a stored thumbnail).

#### F-1103 · Data-layer refactor to TanStack Query · P2 · M2 · M
- Only if F-1003 or F-502 need caching or optimistic updates beyond what `useWardrobe` handles cleanly. Keep the `WardrobeRepo` interface unchanged.

---

## 5. Dependency summary

```
F-001 → F-002, F-006, F-007
F-004 → (recommended before) F-201, F-205, F-601, F-603, F-802
F-005 → tests for F-401, F-601, F-701
F-301 → F-302
F-603 + F-701 → F-703
F-701 → F-702, F-704
F-801 → F-802 → F-803
D33 amendment entry (pending) → F-706.1, F-706.2, F-706.3 → F-706.4 + F-706.7 (same release) → F-706.8 (Ming confirms)
F-706.1 → F-706.5 → F-706.6; F-706.3 → F-706.6
BUG-012, BUG-013 → F-707.1 → F-707.2 → F-707.3 → F-707.4 (F-707 can run in parallel with F-706)
F-705 pass + F-706.4 → F-708.1, F-708.2 → F-708.3 → F-708.4 → F-709.3
F-708.3 → F-708.5 → F-708.6
F-705 pass → F-709.1, F-709.2 → F-709.3
F-705 fail → F-710 (F-708 and F-709 cancelled)
```

## 6. Suggested order inside M1
1. F-001, F-003, F-005 (in parallel)
2. F-002, F-007, F-004 (split into 3 tickets)
3. F-401, F-201, F-202, F-1002
4. F-604, F-602, F-601, F-603
5. F-101, F-006

## 7. Conventions
- Branch: `feat/F-601-csv-import`, `fix/F-202-heic-upload`.
- One PR per ticket. The PR title starts with the feature ID.
- Every DB change is a new file in `supabase/migrations/`, with RLS in the same migration; never edit an applied migration.
- UI copy is in Vietnamese and kept in one place per feature (no scattered string literals once F-004 is done).
- **Definition of Done:**
  - typecheck, format, build and tests pass in CI
  - acceptance criteria met
  - works on mobile at 390px and in dark mode
  - no data left in another user's scope
  - README or docs updated if setup changed

## 8. Ticket template

```md
### [F-xxx] <short imperative title>
**Epic:** E? — <name> · **Milestone:** M? · **Priority:** P? · **Size:** S/M/L
**Depends on:** F-xxx, … (or none)

**Goal**
<one or two sentences: user value>

**Scope**
- …

**Out of scope**
- …

**Acceptance criteria**
- [ ] …

**Technical notes**
- Files: `src/...`, `supabase/migrations/...`
- Risks / open questions: …

**Test plan**
- Unit: …
- Manual: …
```