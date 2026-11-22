# AI stylist — brainstorm and architecture notes

Working notes from the 2026-11-21 brainstorm, for whoever plans F-705 to F-710.

- **Scope lives in [feature-list.md](feature-list.md)** (milestone M4, E7). If this file and the feature list disagree, the feature list wins.
- **Nothing here is a decision.** The architecture section is advice from a read-only consult. D52 to D54 were recorded in `work/decisions.md` on 2026-11-22.
- **Not done yet:** the sticker spike has not been run, no tickets exist, and prices are search snapshots that must be rechecked on the live pricing pages.
- File and line references are as of commit `41ee069`.

## 1. Why this shape

AI outfit suggestions already exist (F-704.1 to F-704.5). The new value is seeing an outfit on a body before wearing it, in a way that makes the app more appealing.

The main risk is an image that looks good but shows the wrong garment. If the chibi wears something the user does not own, the feature loses its purpose.

| Option | How it works | Garment accuracy | Cost per view | Appeal | Outcome |
|---|---|---|---|---|---|
| A. Collage | Compose real photos | Highest | About 0 | Low | Fallback (F-710) |
| **B. Paper-doll chibi** | AI draws each item once as a sticker; the app layers stickers on an avatar | Good, fixable per item | About 0 after first draw | High | **Chosen** |
| C. Full outfit image | AI draws the whole character per outfit | Riskiest | High, every outfit | Highest | Rejected |
| D. OOTD card | Shareable card built from A or B | Follows A or B | Low | Medium | Set aside |

B was chosen because each item is paid for once, outfit changes are instant, and a bad result only needs one item redrawn. Its weakness is less natural drape, for example tucked tops, long dresses and ao dai.

**Spike gate (F-705):** 10 hard items (patterned, ao dai, dark). Pass if at least 8/10 are recognizable without the source photo. Otherwise fall back to F-710.

## 2. Token and cost strategy

In order of expected saving:

1. Draw each sticker once, cached by photo, style version and model.
2. Draw only when the user taps, and only the missing items.
3. Send no images in the suggestion step. Use metadata and the cheapest adequate text model.
4. Prefilter candidates with rules, from 40 down to about 15 to 20.
5. Cache suggestions per day by wardrobe, occasion and weather bucket.
6. Downscale input and output images to limits set by the spike.
7. Use the provider Batch API only for an explicit "prepare whole wardrobe" action.
8. Never retry image calls automatically, and use idempotency keys so a call is not charged twice.

Prompt caching is not prioritized: the suggestion prompt is short and varies with the wardrobe.

**Cost estimate (unverified):** a sticker costs about $0.02 to $0.04. Drawing 30 often-worn items costs about $0.60 to $1.20 once per user. Option C at 3 images a day would cost about $1.80 to $3.60 per user every month.

Price sources to recheck: [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation).

## 3. Architecture consult (advisory)

### Findings that change the plan

1. **The photo sweep would delete stickers.** It treats any `app=tudo` file without an `item_photos` row as an orphan (`server/photo-sweep.js:114-124`).
2. **Switching to the shared key before metering means unmetered spend.** The key swap and the charge must land together.
3. **The outfits modal calls the AI automatically** from an effect keyed on pool, weather and seed (`src/features/outfits/OutfitsModal.tsx:115,133-156`). See OQ-16.
4. **Open join makes the welcome grant the main budget risk** (D38). See OQ-1.
5. **The RLS tests reject any new table** until they are updated (`server/rls.db.test.ts:201,223-237`).

### Credit ledger

- Suggested tables: `credit_grants(user_id, bucket, period, amount)`, unique on `(user_id, bucket, period)`, and `credit_ops(id, user_id, op_key, kind, monthly_part, welcome_part, period, state, expires_at)`, unique on `(user_id, op_key)`. Compute the balance rather than storing it.
- **Concurrency:** take `pg_advisory_xact_lock` per user inside `withUser`, then sum and insert (same pattern as `server/photos.js:270-273`).
- **Pool:** never hold a transaction across a provider call (5 connections, 5 s statement timeout, `server/db.js:14,17`). Use three short transactions: reserve, call, settle.
- **Crash recovery:** the balance ignores `reserved` ops past `expires_at` (about 10 minutes), so no sweeper is needed.
- **Monthly grant:** there is no scheduler. Insert lazily with `on conflict do nothing` for the UTC+7 month.
- **Refund versus real cost:** a timeout may still be billed. Refund the user's credits, but keep the estimate in the spend meter unless the failure proves no charge.
- **Spend cap:** adapters discard usage today (`server/ai/gemini.js:147`, `server/ai/claude.js:79`). For v1, atomically add a pessimistic per-model estimate and refuse unpriced models. Reconcile monthly with the provider dashboard.
- **RLS on the cap:** a global budget row does not fit `owner_only`. Consider an `ai_budget_months` table with no user data and a narrow policy. `SECURITY DEFINER` will not help because the app is the owner role under FORCE.

### Moving from BYOK to a shared key

- `loadSettingsKey` call sites: `server/ai/tagPhoto.js:48`, `server/ai/suggestOutfits.js:72`, `server/ai/routes.js:85`.
- `aiAvailability` returns `no_key` without a per-user key (`src/features/items/aiFill.ts:107`), which would disable AI for every non-owner unless the client ships with the cutover.
- The SPA does not read `/api/auth/me` or a role today, and `AiSettingsModal` is open to everyone (`src/App.tsx:328-336`). Owner-only UI needs that wiring, and the server must enforce it.
- Add new error codes to both mirrors (`src/shared/ai/errors.ts:4`, `server/ai/catalog.js:27`) and to `AI_BATCH_OFF` (`src/data/photoImport.ts:36-48`), or a bulk import keeps retrying after credits run out.
- Do not bump the crypto `VERSION`, because that makes legacy v2 ciphertext unreadable (`server/ai/crypto.js:9,76`). Use separate app-key functions with distinct AAD.
- `ai_settings.provider` allows only `claude` and `gemini`, so OpenAI belongs in a new table. Keep image models out of `AI_MODELS`.
- Owner exemptions in the limiters (`server/ai/rateLimit.js:75-81`, `server/app.js:71-75`) must not exempt the owner from the spend cap.
- Make `occasion` optional at first: `parseSuggestBody` requires exact keys (`server/ai/outfitSuggest.js:63-72`), so a required field returns 400 to open old bundles.

### Stickers

- **Isolation:** scope the cache per user with RLS. A global hash cache would reveal that someone holds the same photo. Compute any hash on the server.
- **Cache key to review:** every photo replacement creates a new photo id (`server/photos.js:236,280-289`), so keying by `photo_id` could replace the agreed photo hash with no hash column or backfill. Ming decided on photo hash, so changing it needs Ming.
- **Drive:** tag stickers `app=tudo-sticker` in the user's existing folder. The sweep then ignores them, so orphan cleanup needs its own pass.
- **Serving:** add an owner-scoped `GET /api/stickers/:id` with the bearer and blob flow (D34). Validate content type and magic bytes, cap size, and never accept SVG.
- **Transparency:** the pipeline is JPEG-only and D48 avoids a server image dependency. The spike must choose native alpha, a flat key colour removed in the browser, or a new dependency (needs Ming).
- **Adapter:** the existing Gemini path caps responses at 64 KB and requires JSON text (`server/ai/gemini.js:10,116,134`), so image generation needs its own path.
- **Requests:** use one request and one reservation per item with low concurrency. An outfit can need 5 stickers (50 credits).
- **Invalidation:** collect sticker file ids before deleting in all three paths (`server/photos.js:172`, `server/photos.js:282`, `server/items.js:148-160`).
- **Local development:** dev runs against production (D45), so local testing spends real credits and cap unless AI is stubbed.

## 4. Proposed delivery order

| Batch | Tickets | Needs |
|---|---|---|
| 1 | F-705 | Ming picks 10 items and provides test keys |
| 2 | F-706.1 to .3, .5, .6 | D52, D53 |
| 3 | F-707.1 to .4 | BUG-012, BUG-013, OQ-7 |
| 4 | F-706.4, F-706.7 | Batch 2, F-707.4 (OQ-16) |
| 5 | F-708.1 to .4, F-709.1 to .3 | F-705 pass, D54 |
| Later | F-706.8, F-708.5, F-708.6 | F-706.8 needs Ming's explicit confirmation |
| Fallback | F-710 | F-705 fail |

## 5. Decision entries to record

- **D52, shared AI key:** amends D33. Owner-managed key, BYOK stopped, ciphertext retained. Needed before F-706.
- **D53, credits and spend cap:** ledger, prices, grants, $20 cap, and the answers to OQ-1 to OQ-4.
- **D54, sticker data handling:** photo sent on tap, Drive storage outside quota, provider terms (OQ-6).
- **Later:** spike result (provider lock or F-710), and deletion of legacy ciphertext.
