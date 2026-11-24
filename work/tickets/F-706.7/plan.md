Status: BLOCKED

# Plan — F-706.7: User credit UI and retire the BYOK form

> **Why BLOCKED.** This ticket needs data the server does not provide yet. It needs a user-facing balance, the prices,
> the welcome-approval state and the cap state. It also needs the error codes for out of credit and welcome pending.
> Nothing on `main` serves any of these. `server/api.js` has no credits route, and `src/shared/ai/errors.ts` has no
> such codes. F-706.4 owns the codes ("New error codes … in both mirrors and in `AI_BATCH_OFF`", F-706.4 ticket
> Scope). F-706.4 is not started and is waiting on M-42.
>
> Neither ticket's scope covers a balance endpoint. Placing one is a choice between two tickets, and both options
> touch `server/**` (High). Ming also has to decide the merge order under D52/D55 and the "delete my old key" action,
> which the ticket flags to Ming.
>
> Below is the full plan under the proposed defaults (Q1–Q7). If Ming answers "defaults", set the status to `READY`
> and add F-706.4 to `Depends on`. No other edit is needed. The plan for this ticket stays **client-only**: no file in
> it matches a High path.

## Scope summary
- `docs/feature-list.md` F-706: "**F-706.7 User credit UI:** balance, cost display, waiting-for-approval, out-of-credit and AI-off states; the BYOK form is retired. Ships in the same release as F-706.4."
- F-706 AC: "At the cap, AI routes answer a distinct error with no provider call, and all non-AI routes still work." "The bulk import stops cleanly when credits run out: finished photos stay, the rest are reported as not tagged."
- D53: "Prices: cached result or existing chibi 0; AI photo fill 1; new AI suggestion (incl. shuffle) 1 … Existing accounts get the 300 welcome credits once; accounts that join later get theirs only after the admin approves them … monthly credits are spent first … at the cap every AI route returns a distinct error with no provider call and the rest of the app works."
- D52: "BYOK stops being read at the F-706.4 cutover … Until then a user can still delete their own stored key (`DELETE /api/ai-settings/key`). … F-706.4 ships in the same release as F-706.7".
- D55: "no release that contains F-706.4 is cut until F-706.7 and F-707.4 are in the same release (or earlier)".
- Ticket Scope: balance and per-action cost; the three states with Vietnamese copy (R6); retire the BYOK form, and `aiAvailability` stops returning `no_key`; map the new error codes in the photo fill, bulk import and outfits flows.

### Proposed contract (Q1–Q3). F-706.4 implements the server side; this ticket only consumes it.
- `GET /api/ai/credits` (signed-in user, own data only) → `200`:
  `{ "credits": { "balance": { "period": "2026-11", "monthly": 60, "lasting": 300, "total": 360 }, "welcome": "approved" | "pending", "capReached": false, "costs": { "photo_fill": 1, "suggest": 1 }, "provider": "gemini" } }`
  - `balance` is the shape `ledger.balance()` already returns (`server/ai/credits.js:98-105`, minus `welcomePending`). The endpoint applies the lazy grants, as `balance()` already does (`credits.js:218-237`).
  - `costs` uses the `CREDIT_PRICES` keys (`server/ai/creditMath.js:6`). Only the kinds the user can trigger here are listed; `sticker` waits for F-709.3.
  - `capReached` is true when the app-wide meter (F-706.2) cannot fit one more call at the cheapest priced estimate. It is a pre-tap hint only.
  - `provider` keeps the privacy disclosure ("Ảnh sẽ được gửi tới …") without a selector.
  - Errors use the existing `{ error: { code, requestId } }` envelope and the existing codes (`unauthorized`, `db_unavailable`, `rate_limited`, `internal`).
- New server codes, added by F-706.4 to `src/shared/ai/errors.ts`, `server/ai/catalog.js` (parity test) and `AI_BATCH_OFF`:
  - `credits_exhausted` → 402
  - `welcome_pending` → 402
  - `ai_cap_reached` → 503 (exists)
  - F-706.4 also adds `op_key_mismatch` → 409 if it needs it; the UI shows it with the generic text.
  - 403 is deliberately avoided so the 403 handling (T-030) can never sign a user out for being short of credit.
- The server is authoritative. A client pre-check never replaces the server's refusal. Every blocked state disables the button, so the browser makes no AI request at all (AC3).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A signed-in user without a personal key sees AI actions available when they have credits and the cap is not reached. | `aiFill.test.ts` › "ready with credits and no personal key". `Editor.test.tsx` › "AI fill enabled from credits alone". `ImportModal.test.tsx` › "AI tagging toggle enabled from credits alone". `OutfitsModal.test.tsx` › "AI suggest enabled from credits alone". The fakes have no `AiSettingsClient` key at all. |
| 2 | The balance and the credit cost of each AI action are shown before the user taps. | `AiStateNote.test.tsx` › "ready shows balance and cost". In each flow test, the button or note text contains the cost from `costs` and the balance `total`, read before any click. `ImportModal.test.tsx` › "batch shows N × cost and balance". |
| 3 | Waiting-for-approval, out-of-credit and AI-off states each show a distinct Vietnamese message and make no AI call. | `aiFill.test.ts` › state order: cap → welcome pending → out of credit → no photo → ready. `AiStateNote.test.tsx` › "three blocked states render three different messages". In each flow test, the fake tagger or outfits client is never called after a click, and the button is disabled. `credits/copy.test.ts` › "the three state messages are distinct and non-empty". The server codes are mapped too: `aiFill.test.ts` › "aiErrorText maps credits_exhausted, welcome_pending, ai_cap_reached". |
| 4 | The BYOK key form is no longer reachable. | Slice F-706.7.2 (see Split proposal). Slice .1 does not claim it. |
| 5 | Works at 390px and in dark mode (R9); Vietnamese copy stays in one place per feature (R6). | A one-off Playwright check at 390px, light and dark, recorded in `impl-log.md` (D42). It covers the Editor AI row, the import AI row and the outfits AI button in each state, using a stubbed `/api/ai/credits`. R6: all new strings live in `src/features/credits/copy.ts`, and grep finds no Vietnamese literals in the changed TSX. |
| 6 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
- After F-706.4 and this ticket are both deployed in one release, check these with a non-owner account on production:
  - The balance shows.
  - One photo fill takes 1 credit, and the balance refreshes.
  - A newly joined account shows the waiting-for-approval note until the welcome grant is approved in the admin API/screen.
- None of this can be checked before F-706.4 exists (D45: dev runs against production).

## Files to create / modify
Slice F-706.7.1 (this plan). No High path is touched.

| File | Change | Required because | High path? |
|---|---|---|---|
| `src/shared/ai/credits.ts` (new) | Defines the `CreditView` type (`balance`, `welcome`, `capReached`, `costs`, `provider`) and the pure `parseCreditView(json)` parser, which rejects missing or ill-typed fields. Client-only, not mirrored. | It holds the contract in one place (R1). The parser is pure logic (R8). | No |
| `src/data/aiCredits.ts` (new) | Adds `AiCreditsClient.get()` over `GET /api/ai/credits`, copying the `aiSettings.ts` error handling (`createAuthedFetch`, envelope → `AiSettingsError`). | Every data access goes through `src/data/` (R1). | No |
| `src/features/items/aiFill.ts` | Changes `AiLoad` to carry `CreditView`. The new `AiAvailability` kinds are `loading`, `load_error`, `misconfigured`, `cap_off`, `welcome_pending`, `out_of_credit`, `no_photo` and `ready` (the last two carry `balance`, `cost` and `provider`). `aiAvailability(load, hasPhoto, kind)` drops `no_key` and `model_unsupported`. `aiErrorText` maps the new codes. `needsSettings` and `SETTINGS_FIXES` are removed. | Ticket scope: no `no_key`, and the new codes are mapped. | No |
| `src/features/items/useAiLoad.ts` | Loads `AiCreditsClient.get()` instead of `AiSettingsClient.get()`. Adds a `refresh()` that reloads without the loading flash. | The balance is the availability source, and it must refresh after each AI call. | No |
| `src/features/items/useAiFill.ts` | Passes `"photo_fill"`. Calls `refresh()` after every fill result (success or error). | AC2 needs a fresh balance after spending. | No |
| `src/features/items/Editor.tsx` | Replaces the `no_key`, `model_unsupported` and settings-link branches with `<AiStateNote>`. The fill button label carries the cost. The `needsSettings` link is removed. | AC1–AC3. | No |
| `src/features/import-export/ImportModal.tsx` | Passes the credits client and `"photo_fill"`. Calls `refresh()` when the run ends. | AC1/AC3 in bulk import. | No |
| `src/features/import-export/ImportPhotosTab.tsx` | Renders `<AiStateNote>` instead of the `no_key` and `model_unsupported` branches. Shows "N ảnh × cost = … credit · còn … credit" before start. The `aiStopped` message uses `aiErrorText` for the credit codes. The settings link is removed. | AC2/AC3. Domain focus: partial batch failure. | No |
| `src/features/outfits/OutfitsModal.tsx` | Gives the reason for a disabled "Gợi ý bằng AI" through `<AiStateNote>` (today it disables silently) and shows the cost. Calls `refresh()` after a suggest result. | AC2/AC3. | No |
| `src/features/outfits/copy.ts` | Removes the `needsSettings` import and the "Kiểm tra lại AI trong Cài đặt." hint. Credit codes use `aiErrorText`. | The hint is wrong after the cutover. | No |
| `src/features/credits/AiStateNote.tsx` (new) | One shared presenter that maps an `AiAvailability` to a note (`role="status"`, or `role="alert"` for the blocked states) plus the balance line. | One presenter instead of three divergent branches. R6, R9. | No |
| `src/features/credits/copy.ts` (new) | `CREDITS_COPY`: the balance line, the cost suffix, the batch cost line, the three state messages, and the disclosure text. | R6: one place per feature. | No |
| `src/features/settings/copy.ts` | Adds `AI_ERRORS` entries for `credits_exhausted` and `welcome_pending` (copy reused from `CREDITS_COPY`). The type forces this once F-706.4 adds the codes to `AiErrorCode`. | `AI_ERRORS` is `Record<AiErrorCode, string>`. | No |
| `src/App.tsx` | Creates the `aiCredits` client and passes it in the `ai` props of Editor, ImportModal and OutfitsModal. Hotspot. Keep the diff minimal and do not change the `AiSettingsModal` block in this slice. | The client wiring lives here. | No |

Explicitly **not** touched by this ticket: `src/shared/ai/errors.ts`, `server/**`, `src/data/photoImport.ts` (`AI_BATCH_OFF`). F-706.4 owns them.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/shared/ai/credits.test.ts` › parses a full view; rejects a missing `balance`, a non-integer or negative total, an unknown `welcome` value, a missing `costs.photo_fill`; ignores unknown extra fields | The parser: empty and null fields (domain focus). |
| `src/data/aiCredits.test.ts` › GET path, headers and `no-store`; error envelope → code; network → `network`; 401 → `unauthorized`; malformed 200 → `internal` | The fetch seam (R1, R8). |
| `src/features/items/aiFill.test.ts` › state order (cap beats pending beats out of credit); `total < cost` → out_of_credit; `total === cost` → ready; pending with `total > 0` (monthly approved) → ready; no `no_key` kind exists; `aiErrorText` for the three codes; existing undo/fill tests unchanged | Availability (AC1, AC3). The pending row covers D53 "monthly counts at once" (`credits.js:55`): pending blocks only when the balance is short. |
| `src/features/credits/AiStateNote.test.tsx` › one test per state; the three blocked messages are distinct; the ready note shows balance and cost | AC2, AC3. |
| `src/features/credits/copy.test.ts` › messages are distinct, non-empty and keep NFC diacritics | R6. |
| `src/features/items/Editor.test.tsx` › enabled from credits alone; cap/pending/out-of-credit disable the button and the tagger is never called; the balance refreshes after a fill; no "Cài đặt" link for a credit error | AC1–AC3. |
| `src/features/import-export/ImportModal.test.tsx` › the batch cost line; the toggle is off when blocked; a `credits_exhausted` stop keeps the finished photos and names the rest as not tagged | AC2, AC3, partial batch (domain focus). |
| `src/features/outfits/OutfitsModal.test.tsx` › the reason is shown when blocked; the cost is shown; the outfits client is not called when blocked | AC2, AC3. |
| Update the existing tests that assert `no_key` or `model_unsupported` (`aiFill.test.ts`, `Editor.test.tsx`, `ImportModal.test.tsx`, `OutfitsModal.test.tsx`, `copy.test.ts`) | Regression. |

## Approach
1. Write the contract as `src/shared/ai/credits.ts` with its parser and tests (pure first, rule 6).
2. Add `src/data/aiCredits.ts` and its tests (R1).
3. Rework `aiAvailability` and `aiErrorText` in `aiFill.ts`, and test every state. Precedence is `cap_off` > `welcome_pending` (only when `total < cost`) > `out_of_credit` > `no_photo` > `ready`.
4. Add `CREDITS_COPY` and `AiStateNote`. Use existing CSS vars for dark mode, 44px targets, and wrapping lines with no horizontal overflow at 390px (R9).
5. Switch `useAiLoad` to credits and add `refresh()`. Wire the Editor, Import and Outfits flows, and remove the `needsSettings` paths.
6. Do the minimal `App.tsx` wiring.
7. Run the checks. Do the one-off Playwright check at 390px in light and dark with a stubbed `/api/ai/credits`, and record it in `impl-log.md`.
8. The PR description states: "must not be released without F-706.4 (D52/D55). Merge only after F-706.4 is on `main`."

Rules: R1 (client in `src/data/`), R6 (`credits/copy.ts`), R7 (no server or `errors.ts` edits), R8 (unit tests for the parser, availability and the client), R9 (Playwright check). R3 holds: no key, `keyHint` or secret is shown or sent.

## Specialist input used
- frontend-developer:
  - Adopted: contract first; a pure state model built from a `CreditView`; one parser behind the fetch seam; the server is authoritative and the balance refreshes after calls; the misleading "Kiểm tra lại AI trong Cài đặt" goes away.
  - Adopted with a change: costs come from the server, with no client fallback table. A second table would drift (its own risk note), and the server always sends `costs`.
  - Rejected for now: the "inert behind a `hasKey` legacy fallback" rollout. Default Q4 merges after F-706.4 instead, which needs no fallback code to remove later.
  - Rejected: adding codes to `errors.ts` and `catalog.js` in this ticket. That is F-706.4 scope, and it would make this ticket High.
- ux-architect:
  - Adopted: the state machine and its order; one shared presenter; the cost on the button and the balance in the note; the bulk "N ảnh × 1" line with run-until-stop (its Q4 default); `role` on the notes; R9 details; refresh after credit errors; its suggested copy for pending and out of credit (to be finalised in `CREDITS_COPY`).
  - Adopted with a change: the welcome-pending note shows only when the balance is short, so a pending user who still has monthly credit is not blocked (D53 gates only the welcome grant). This also addresses its "legacy users never see the pending note" risk.
  - Deferred to slice .2: the read-only "AI & credit" panel replacing the modal; the "Xoá key cũ" row (Q5); removing `form.ts`.
  - Rejected: a parity test for the credits shape. The shape is client-only; the server's route tests in F-706.4 cover its side.

## Assumptions
- F-706.4 adopts the contract above in its plan. Its plan goes through Ming's plan-approval gate, so the contract gets approved there. If F-706.4 changes the contract, this plan changes only `src/shared/ai/credits.ts` and the copy keys.
- F-706.4 owns the idempotency key on paid calls, including any client header in `src/data/aiTagging.ts` and `src/data/aiOutfits.ts`. This ticket does not touch those files.
- Cached results cost 0 (D53), but the client cannot know before tapping whether a suggestion is cached (the cache is F-707.3). The button shows the full price, and the server charges 0 when cached. Showing "0 credit" for a cached result belongs to F-707.3/F-707.4.
- The welcome-pending state uses `welcome === "pending"`. `welcome` is "approved" for existing accounts once F-706.4 or the admin API backfills them (D53 "Existing accounts get the 300 welcome credits once"). If that backfill is missing, existing users would see the pending note. Flag this to the F-706.4 planner.
- Hotspots:
  - `src/App.tsx`: F-706.6 (admin screen entry) and F-707.4 will edit it.
  - `src/features/outfits/OutfitsModal.tsx` and `outfits/copy.ts`: T-032 (DONE, AI outfits tidy-ups) and F-707.4 (the occasion picker, BACKLOG).
  - `src/features/items/Editor.tsx`: BUG-014 (DONE).
  - The modal files: BUG-016 (DONE, dialog semantics).
  - Expect a rebase on the ones that merge first.
- The board's `Needs Ming: M-42` on F-706.4 blocks it from running. The F-706.4 ticket itself says M-42 is needed "before release". If Ming lets F-706.4 run before M-42, both tickets can be built now and still released together.

## Blocking questions
Batched for Ming. Each question has a proposed default. Answering "defaults" makes this plan READY.

1. **Who builds the user balance endpoint?** Neither ticket's scope has it, and any option touches `server/**` (High).
   - Default: F-706.4 adds `GET /api/ai/credits` with the contract above. Its scope grows slightly, and it is High and gated already.
   - Alternative: a new High slice `F-706.4.1`.
   - Rejected alternative: putting it in this ticket, which would make F-706.7 High and push it past one cycle.
2. **Contract shape.** Default: the JSON above, with `balance`, `welcome`, `capReached`, `costs` (server-served, no client table) and `provider`.
3. **New error codes and statuses.** Default:
   - `credits_exhausted` 402 and `welcome_pending` 402
   - `ai_cap_reached` 503 (reused)
   - no 403, so T-030's 403 handling can never sign a user out
   - added by F-706.4 to both mirrors and to `AI_BATCH_OFF`
4. **Merge order (D52/D55).** Default: F-706.7 adds `Depends on: F-706.4`. It is implemented once F-706.4's contract is on `main`, merges after it, and ships in the same release. This needs no temporary `hasKey` fallback.
   - Alternative: build it now against fakes and leave the PR open until F-706.4 merges.
5. **"Delete my old key" after the form is retired** (the ticket flags this to Ming; D52 promises users can still delete theirs until F-706.8). Default: a small "Xoá key cũ" row in the new AI panel, shown only when `GET /api/ai-settings` reports `hasKey`. It never shows `keyHint`, reuses `deleteKey()`, and is removed by F-706.8.
   - Alternative: no UI, and F-706.8 deletes everything.
6. **What replaces the Settings modal?** D52 makes the key and model owner-managed. Default: a read-only "AI & credit" panel from the same header button. It shows the balance (monthly and lasting), the price list, the state banner, the provider name, and the Q5 row. The provider, model and key fields, Test, Save, and `form.ts` with its tests are removed.
   - Alternative: remove the header entry and show credits only next to the AI buttons.
7. **Split.** Default: two slices, both in the F-706.4 release.
   - F-706.7.1 covers the state model, the credits client and the three flows (this plan).
   - F-706.7.2 covers the panel and the BYOK retirement (AC4, Q5, Q6).

## Split proposal
The estimate for the whole ticket is about 900 added lines plus test updates, which is more than one cycle.
- **F-706.7.1 (this plan):** credit contract parser, credits client, availability state machine, `AiStateNote`, cost and balance in the Editor, Import and Outfits flows, and mapping of the new codes. It covers AC1, AC2, AC3, AC5 and AC6. It leaves `AiSettingsModal` untouched; that modal is unreachable as a key form only after .2.
- **F-706.7.2:** replace `AiSettingsModal` with the read-only "AI & credit" panel. Remove the key form, `form.ts`, `form.test.ts`, `AiSettingsClient.save/test` and the autofill guards, and rewrite `AiSettingsModal.test.tsx` to assert that no key input renders. Add the "Xoá key cũ" row per Q5. Adjust `App.tsx` and `Header.tsx`. It covers AC4, AC5 and AC6. It depends on .1.
- Both slices ship in the same release as F-706.4 (D52). Neither slice touches a High path.
