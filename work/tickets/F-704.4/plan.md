Status: READY

# Plan — F-704.4: "✨ Gợi ý bằng AI" toggle (slice 1 of 2: AI client and pure outfit logic)

> **Split.** The whole client slice comes to about 800 changed lines: about 330 product lines (client ~75, pure
> logic ~80, modal ~120, copy ~25, CSS ~35, App ~8) and about 470 test lines. That is well over the ~400-line
> guide. F-704.3 counted tests the same way. This plan covers **slice 1 only**: the data client and the pure,
> unit-tested logic, about 390 lines and no UI. The modal toggle, copy, CSS, App wiring and the Playwright check
> become **F-704.5**, outlined under `## Split proposal` with every UI decision already settled. The orchestrator
> creates F-704.5 when this plan is accepted. Slice 1 ships code that nothing calls yet. F-704.3 did the same.

## Scope summary
- `docs/feature-list.md` F-704: "'Hôm nay mặc gì?': suggests 3 outfits from active items using season, weather
  (optional) and stale items first."
- Ticket F-704.4, Scope (slice-1 parts):
  - "`src/data/aiOutfits.ts`: `createHttpAiOutfits(...).suggest({candidateIds, season, weather, avoidIds}, signal)`;
    parses `{outfits}`, maps errors like `aiTagging.ts` (R1: no fetch in components)."
  - "`src/features/outfits/suggest.ts`: pure `candidatePool(items, {now, weather})` (eligible active items after the
    season/weather step, capped at 40) and `toAiOutfits(result, items)` (map ids back to items, drop unknown ones).
    Existing `suggest.test.ts` cases unchanged."
- F-704.3 assumptions that Ming approved (`work/tickets/F-704.3/plan.md`, `## Assumptions`):
  - **A2:** "At most 40 candidates per call … the client picks them from the rule pool after the weather step,
    never-worn first, then longest-unworn."
  - **A4:** "The reason is Vietnamese only, ≤120 characters."
  - **A5:** "The optional `avoidIds` (≤40, ignored when not among the candidates) marks the items shown last time."
  - **A8:** "Response shape `{outfits: [{itemIds: string[], reason: string}]}`, ids ordered main → outer → shoes →
    accessory … F-704.4 shows what is returned."
- Server contract (`server/ai/outfitSuggest.js:53-92`):
  - The body is exactly `{candidateIds, season, weather, avoidIds?}`.
  - `candidateIds` holds 1–40 UUIDs. `season` is one of `SEASONS` (DB ids such as `"winter"`).
  - `weather` is exactly `{cold, hot, rain}`, all booleans. `avoidIds` holds 0–40 UUIDs.
  - The server answers `200 {outfits: []}` when fewer than 2 candidates are usable (`server/ai/suggestOutfits.js:66`).
- `work/tickets/F-704.3/security-review.md`, item 2 and the closing note for F-704.4:
  - "render `reason` as plain text (no `dangerouslySetInnerHTML`, no auto-linking)".
  - "consider stripping bidi and zero-width characters on the client". Bidi overrides (U+202A–U+202E,
    U+2066–U+2069), zero-width characters and U+2028/2029 get through the server's `cleanText`.
- `work/decisions.md` D44 / CLAUDE.md R1: every data access goes through `src/data/`, and components never call
  `fetch`.

## Acceptance criteria → verification
Slice-1 subset. The ticket's UI criteria move to F-704.5: modal shows AI outfits; toggle hidden and off on open;
fallback note; "Đổi gợi ý" shows a different set; close aborts; 390px and dark mode.

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `createHttpAiOutfits(fetchFn, base, auth).suggest(input, signal)` sends `POST {base}/ai/suggest-outfits` with `Content-Type: application/json`, `Accept: application/json`, `cache: "no-store"`, `credentials: "same-origin"`, `redirect: "manual"` and the given `signal`, and adds the Bearer header through `createAuthedFetch`. The JSON body has exactly the keys `candidateIds`, `season`, `weather` (`{cold, hot, rain}`), plus `avoidIds` only when that list is non-empty. | `aiOutfits.test.ts` › "posts JSON to /api/ai/suggest-outfits"; "sends avoidIds only when non-empty"; "adds the bearer token" |
| 2 | A 200 reply `{outfits: [...]}` returns `{outfits: [{itemIds: string[], reason: string}]}`. Entries that are not objects, whose `itemIds` is not an array of strings, or whose `reason` is not a string are dropped. A reply with no `outfits` array, or with a body that is not JSON, throws `AiSettingsError(…, "internal")`. | `aiOutfits.test.ts` › "returns the outfits"; "drops malformed entries"; "malformed 200 -> internal"; "non-JSON body -> internal" |
| 3 | Error mapping is the same as `aiTagging.ts`. A non-OK reply gives the server code (`rate_limited`, `ai_busy`, `provider_bad_response`, …) and keeps `requestId`. An unknown code gives `internal`. A fetch rejection gives `network`. A 401 after the retry gives `unauthorized` and calls `onAuthLost`. An aborted signal rethrows the abort error, not `network`. | `aiOutfits.test.ts` › "maps server error codes" (`it.each` over `rate_limited` 429, `ai_busy` 503, `not_configured` 409, `provider_bad_response` 502, `request_timeout` 408); "unknown code -> internal, request id kept"; "network rejection -> network"; "401 twice -> unauthorized and onAuthLost"; "aborted signal rejects with the abort error" |
| 4 | `candidatePool(items, {now, weather?})` returns at most `AI_CANDIDATE_CAP` (40) items. They are active items in the categories the rule set uses (not `bikini` or `other`), after the same season/weather step as `suggestOutfits`: per role, items fitting the wanted seasons, or all of that role when none fit. `outer` items are included only when the rule set would add an outer layer. | `suggest.test.ts` › `describe("candidatePool")` cases listed under Tests |
| 5 | Order (A2): within each role, never-worn items (`wearCount === 0`) come first. Then come items with `wearCount > 0` and an empty `lastWorn`, then the rest by oldest `lastWorn`. Ties go by `createdAt`, then `id`. Roles are interleaved round-robin in the fixed order top, bottom, dress, set, ao_dai, shoes, outer, accessory until the cap. The result is deterministic and does not depend on input order. | `suggest.test.ts` › "orders never-worn, then longest-unworn, within a role"; "round-robin keeps every role under the cap"; "same result for shuffled input" |
| 6 | `toAiOutfits(result, items)` returns `AiOutfit[]` (`{pieces: Item[], reason: string}`) with pieces in server order. An outfit is dropped when: any id is unknown, not active, or in an excluded category; ids repeat; there are 0 ids or more than 5; it repeats an earlier outfit (same id set); or the cleaned reason is empty. At most 3 outfits are returned. | `suggest.test.ts` › `describe("toAiOutfits")` cases |
| 7 | `cleanReason(s)` applies NFC. It removes C0/C1 control characters, U+200B–U+200F, U+202A–U+202E, U+2028–U+2029, U+2066–U+2069 and U+FEFF. It collapses whitespace runs to one space, trims, and cuts to 120 code points. Vietnamese diacritics and `đ` are kept. | `suggest.test.ts` › `describe("cleanReason")` cases |
| 8 | `suggestOutfits` behaviour is unchanged by the shared eligibility helper: every existing `suggest.test.ts` case passes with no edit. | `git diff src/features/outfits/suggest.test.ts` shows additions only; `pnpm test` green |
| 9 | No component, no `fetch` outside `src/data/` (R1). No UI change in this slice. | `git diff --stat` lists only the four files below |
| 10 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` |

## Ming verification after merge
None for this slice, because no UI calls the client yet. Ming's manual check with real Claude and Gemini keys
(ticket Test plan: "check the reasons read as natural Vietnamese") moves to F-704.5.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/data/aiOutfits.ts` (new) | Defines `AiSuggestInput`, `AiSuggestResult` and `AiOutfitSuggester`. Exports `createHttpAiOutfits(fetchFn = (...a) => fetch(...a), base = "/api", auth = {})` with `suggest(input, signal)`, in the `createHttpAiTagger` pattern (`src/data/aiTagging.ts:48-90`): same catch/abort/401/JSON/error-code handling, plus a JSON body and a parser. | AC 1–3; R1 | No |
| `src/data/aiOutfits.test.ts` (new) | Unit tests with a fake `fetch`, in the pattern of `aiTagging.test.ts`. | R8 | No |
| `src/features/outfits/suggest.ts` | Extract a private `eligibility(items, {now, weather})` → `{season, cold, hot, rain, outerWanted, pools}`, where `pools[role]` is the fit-or-all list in item order. `suggestOutfits` uses it, with the `rand` creation and the `rank` call order unchanged. Add the exports `AI_CANDIDATE_CAP`, `candidatePool`, `AiOutfit`, `toAiOutfits` and `cleanReason`. | AC 4–8 | No |
| `src/features/outfits/suggest.test.ts` | Add `describe` blocks for `candidatePool`, `toAiOutfits` and `cleanReason`. Existing cases untouched. | R8; AC 8 | No |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `aiOutfits.test.ts` › "posts JSON to /api/ai/suggest-outfits": URL, method, headers, `cache`/`credentials`/`redirect`, `signal` passed through, `JSON.parse(body)` deep-equals `{candidateIds, season: "winter", weather: {cold: true, hot: false, rain: false}}` | AC 1 |
| `aiOutfits.test.ts` › "sends avoidIds only when non-empty": `[]` and `undefined` → no key; `["u1"]` → key present | AC 1, A5 |
| `aiOutfits.test.ts` › "adds the bearer token" (with `getToken`) | AC 1 |
| `aiOutfits.test.ts` › "returns the outfits" (two entries, order kept) | AC 2 |
| `aiOutfits.test.ts` › "drops malformed entries": `null`, string, `itemIds` not an array, an `itemIds` entry that is a number, `reason` missing | AC 2 |
| `aiOutfits.test.ts` › "malformed 200 -> internal": `{}`, `{outfits: "x"}`, `null` | AC 2 |
| `aiOutfits.test.ts` › "non-JSON body -> internal" (200 and 502) | AC 2, 3 |
| `aiOutfits.test.ts` › "maps server error codes" (`it.each`: `rate_limited`/429, `ai_busy`/503, `not_configured`/409, `provider_bad_response`/502, `request_timeout`/408); status and code kept | AC 3 |
| `aiOutfits.test.ts` › "unknown code -> internal, request id kept" | AC 3 |
| `aiOutfits.test.ts` › "network rejection -> network" | AC 3 |
| `aiOutfits.test.ts` › "401 twice -> unauthorized and onAuthLost" | AC 3 |
| `aiOutfits.test.ts` › "aborted signal rejects with the abort error, not network" | AC 3 (abort on close in F-704.5) |
| `suggest.test.ts` › candidatePool: "only active items in rule categories" (`Cất kho`, `Cho mượn`, bikini, other excluded) | AC 4 |
| `suggest.test.ts` › candidatePool: "season step": in July (Hạ), a winter-only top is dropped when a summer top exists; items with no seasons are kept; a role where nothing fits falls back to all of its items | AC 4 |
| `suggest.test.ts` › candidatePool: "outer only when the rules add one": July without weather → no Khoác; July with cold weather (`maxC` 20) → Khoác and Đông items included; December with hot weather (`maxC` 33) → no Khoác; December without weather → Khoác | AC 4 |
| `suggest.test.ts` › candidatePool: "orders never-worn, then longest-unworn, within a role" (`wearCount` 0 first; `lastWorn` "" with `wearCount` > 0 next; then `2025-01-02` before `2026-03-01`; tie → `createdAt`, then `id`) | AC 5, A2 |
| `suggest.test.ts` › candidatePool: "caps at 40" (60 eligible → 40) and "round-robin keeps every role under the cap" (50 tops + 3 bottoms + 2 Giày/dép → all 3 bottoms and both shoes present) | AC 4–5, A2 |
| `suggest.test.ts` › candidatePool: "same result for shuffled input"; "empty wardrobe → []" | AC 5; empty fields |
| `suggest.test.ts` › toAiOutfits: "maps ids to items in server order" | AC 6 |
| `suggest.test.ts` › toAiOutfits: "drops an outfit with an unknown, archived or bikini id, keeps the rest" | AC 6 (item deleted or archived meanwhile) |
| `suggest.test.ts` › toAiOutfits: "drops empty, over-5, duplicate-id and repeated outfits"; "caps at 3"; "a one-piece alone is kept" | AC 6 |
| `suggest.test.ts` › toAiOutfits: "drops an outfit whose reason is empty after cleaning"; "`{outfits: []}` → []" | AC 6–7 |
| `suggest.test.ts` › cleanReason: "removes bidi, zero-width, line/paragraph separators and controls" (one string with each of U+200B, U+200F, U+202E, U+2028, U+2066, U+FEFF, `\u0007`, `\u0085`) | AC 7, security-review item 2 |
| `suggest.test.ts` › cleanReason: "NFC and Vietnamese kept" (decomposed `"đi chơi mùa Đông"` → NFC; equal to the composed string) | AC 7, Domain focus (diacritics, `đ`) |
| `suggest.test.ts` › cleanReason: "collapses whitespace, trims, cuts to 120 code points" (130 × "ạ" → 120 code points) | AC 7, A4 |

## Approach
1. **`suggest.ts` refactor.**
   - Move the `wanted`-seasons computation, the `byRole` grouping (active, not bikini/other), `inSeason`, the
     fit-or-all choice per role and the outer condition `cold || (!hot && COLD_SEASONS.includes(season))` into a
     private `eligibility()`.
   - `suggestOutfits` keeps `const rand = mulberry32(seed)` before any `rank` call and calls
     `rank("shoes")`, the conditional `rank("outer")` and `rank("accessory")` in the same order, so seeded output is
     byte-identical.
   - Run the existing tests before adding new ones.
2. **`candidatePool(items, {now, weather})`.**
   - Take `pools` from `eligibility()`. Include `outer` only when `outerWanted`.
   - Sort each role with the comparator in AC 5. `lastWorn` is an ISO `YYYY-MM-DD`, so a string comparison is
     correct and no time zone is involved.
   - Interleave the roles round-robin in the fixed order until `AI_CANDIDATE_CAP` (40).
   - Return `Item[]`. The caller (F-704.5) maps it to ids and skips the call below 2.
3. **`cleanReason`.** One regex character class for the ranges in AC 7. Apply `normalize("NFC")` first, then
   strip, collapse `\s+`, trim, and `Array.from(...).slice(0, 120).join("")`. This only produces a string. The
   F-704.5 modal renders it as a JSX text node.
4. **`toAiOutfits(result, items)`.**
   - Build a `Map` from items that are active and in a non-excluded category (the same predicate as
     `eligibility`, not season-filtered).
   - Apply the drop rules in AC 6 and keep at most 3 outfits.
   - Export `type AiOutfit = { pieces: Item[]; reason: string }`.
5. **`aiOutfits.ts`.**
   - Copy the transport and error handling of `createHttpAiTagger`.
   - Build the body as `{candidateIds, season, weather: {cold, hot, rain}, ...(avoidIds?.length ? {avoidIds} : {})}`.
   - `parseOutfits(json)` throws `AiSettingsError(200, "internal")` unless `json.outfits` is an array, then
     filters the entries by shape.
   - Types: `AiSuggestInput = { candidateIds: string[]; season: string; weather: {cold: boolean; hot: boolean;
     rain: boolean}; avoidIds?: string[] }` and `AiSuggestResult = { outfits: {itemIds: string[]; reason:
     string}[] }`.
   - No client-side UUID or count validation: the server is authoritative (400 `bad_request`), and real item ids
     are UUIDs (`crypto.randomUUID`, `App.tsx:105`).
6. Run the checks: `pnpm format`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Rules:
- **R1:** the only `fetch` is in `src/data/aiOutfits.ts`.
- **R5:** nothing stored; wear data is read only.
- **R6:** no UI copy in this slice.
- **R7:** the four files only.
- **R8:** every new pure function and the client have unit tests.
- **R9:** n/a (no UI) until F-704.5.

## Specialist input used
From `consult-frontend-developer.md`:
- **Rec. 2 (mapping):** adopted, with one change. Map from `items`, re-check active status, keep server order, and
  apply a reason helper that does NFC, strips bidi, zero-width and control characters, and cuts to 120.
  - Rejected: "drop outfits with … fewer than 2 pieces". A dress, set or ao dai alone is a valid outfit under the
    F-704.1 rules the server enforces (F-704.3 plan AC 2: "exactly one one-piece … plus at most one each of shoes,
    outer and accessory").
  - Added: U+2028/2029 and whitespace collapsing, per security-review item 2.
- **File name `src/data/aiSuggest.ts` / `createHttpAiSuggester`:** rejected. The ticket names
  `src/data/aiOutfits.ts` / `createHttpAiOutfits`, and the ticket wins over a consult.
- **Error handling "reuse `AiSettingsError` and the `createHttpAiTagger` pattern":** adopted (AC 3).
- **Rec. 1 candidate set "rule-piece ids ∪ eligible active items, capped at 40":** replaced by A2's order
  (never-worn, then longest-unworn) with round-robin by role, so the cap cannot starve a role. See Assumption 1.
  Rule-piece ids are not forced in, because A2 does not ask for it.
- **Rec. 1 (state/abort/overlay), Rec. 3 (layout), Rec. 4 (notes), Rec. 5 (App wiring) and all risks:** carried
  into the F-704.5 outline below; not part of this slice.
- **Open questions:**
  - "Persist the toggle or reset per open?" is resolved by F-704.3 A3 (Ming): off each time the modal opens.
  - "'Đổi gợi ý' passes `avoidIds` from the shown AI outfits?" is resolved by F-704.3 A5: yes, the ids of every
    piece of the AI outfits on screen.
  - "A visible 'AI' badge on each AI card?" is a non-blocking assumption for F-704.5: yes, a small "AI" chip in
    `.outfit-head`.

## Assumptions
1. **Round-robin by role under the cap.** A2 fixes the order (never-worn, then longest-unworn). Without
   interleaving, a wardrobe with many never-worn accessories could fill all 40 slots and leave no bottoms, and the
   AI could then form no outfit. Within each role the A2 order holds exactly. Ming can revisit this at PR review;
   it is one comparator and one loop.
2. **Empty `lastWorn` with `wearCount > 0`** (wear logs without a readable date) counts as "longest unworn" and
   sorts right after never-worn. This matches `isStale` treating an unknown date as stale (`ageInDays` of `""`).
3. **`avoidIds` key omitted when empty.** The server accepts both forms (`server/ai/outfitSuggest.js:62-76`). Omitting
   it keeps the first call's body minimal.
4. **Malformed entries are dropped in the client, and malformed envelopes throw `internal`.** This matches
   `parseSuggestion` in `aiTagging.ts`. F-704.5 treats `internal` like any other error (rule set plus a note).
5. **Hotspots:** no other ticket is `IN_PROGRESS`, `REVIEW` or `DONE` (`work/backlog.md`). F-704.5 will touch
   `src/App.tsx`, `OutfitsModal.tsx`, `copy.ts` and `src/index.css`.
6. **Gate:** no High path (`.claude/loop.config.md`), so the gate is `none`. No review trigger matches: areas are
   `ui, data`, and `src/data/aiOutfits.ts` is not in the trigger path list.

## Blocking questions
None.

## Split proposal
- **F-704.4 (this plan): AI client and pure logic.** `src/data/aiOutfits.ts` (+ test) and `suggest.ts` with
  `candidatePool` / `toAiOutfits` / `cleanReason` (+ tests). About 390 lines.
- **F-704.5 (new ticket, depends on F-704.4): the "✨ Gợi ý bằng AI" toggle in the modal.**
  - Size: about 410 lines, areas `ui`, gate `none`.
  - It takes over ticket F-704.4's UI acceptance criteria unchanged:
    - The modal shows AI outfits with their reasons.
    - The toggle is hidden when AI is not configured and off each time the modal opens.
    - Errors, `rate_limited`, `ai_busy` or an empty result fall back to the rule set with a Vietnamese note (none
      for empty).
    - "Đổi gợi ý" sends `avoidIds` and shows a different set.
    - Closing aborts.
    - 390px and dark mode.
    - Checks pass.
  - Ming's manual check with real Claude and Gemini keys moves there too.
  - Files: `OutfitsModal.tsx`, `OutfitsModal.test.tsx`, `copy.ts`, `copy.test.ts`, `src/index.css`, and
    `src/App.tsx` (wiring only; no App-level tests, BUG-006).
  - **Props.** `ai?: { settings: Pick<AiSettingsClient, "get">; settingsRev: number; outfits: AiOutfitSuggester }`.
    Inside the modal, `useAiLoad(ai?.settings, ai?.settingsRev)` and `aiAvailability(load, true)`.
  - **App wiring.** `App.tsx` adds `const aiOutfits = useMemo(() => createHttpAiOutfits(undefined, undefined,
    {getToken, onAuthLost}), [])` next to `weatherClient`. It passes `ai={{settings: aiClient, settingsRev:
    aiSettingsRev, outfits: aiOutfits}}`.
  - **Toggle visibility.** The toggle renders only when `ai` is given and the availability is `ready`. It is
    hidden while settings load, and when there is no key, the model is unsupported, or settings fail to load. This
    follows the ticket AC "hidden when AI is not configured". Consult rec. 3's "disabled with hint" is rejected
    because the AC wins.
  - **Toggle state and placement.** `aiOn` starts `false` on every mount (A3; no localStorage). It sits on its own
    row (`.outfit-ai-toggle`) below `.outfit-weather`, as `<label>` + `<input type="checkbox" role="switch">`,
    at least 44 px tall, wrapping allowed.
  - **Overlay, not a gate.** The rule result stays the source of truth and the fallback (consult rec. 1).
    - A single effect, keyed on `[aiOn, weatherSettled, season, weather flags, candidate-id key (joined ids),
      seed]`, runs when `aiOn` is on and the weather is not loading. It is keyed on the joined ids, not `items`
      (consult risk).
    - Fewer than 2 candidates: no call; the rule set shows silently.
    - Each run creates an `AbortController`, and the cleanup aborts it, which covers toggle-off, close/unmount and
      rapid shuffle. Results that arrive after an abort are ignored.
    - While loading, the current cards stay (rule cards, or the previous AI cards after a shuffle). They are dimmed
      with `aria-busy="true"` and the line "Đang nhờ AI gợi ý…".
    - "Đổi gợi ý" is disabled while the AI call is in flight, because each call uses one of 30 daily calls.
  - **Đổi gợi ý.** It always bumps `seed` and sets the rule `avoid`. With AI on, it also stores `avoidIds` = the
    ids of every piece of the AI outfits on screen (A5), or the rule `main` ids when the rule set is on screen.
  - **AI cards.** `.outfit-card` with a small "AI" chip and the reason as a plain JSX text node:
    `{cleanReason(...)}` via `toAiOutfits`, with no `dangerouslySetInnerHTML` and no linkify (security review).
    The piece buttons are the same as the rule cards' (shared local component).
  - **Notes.** Shown as a `role="status"` line, never `role="alert"`. `OUTFITS_COPY.ai.note(code)` gives the
    Vietnamese text; a test checks every `AiErrorCode` maps to a non-empty string:
    - `rate_limited`: daily AI limit reached.
    - `provider_rate_limited`: the provider is limiting calls.
    - `ai_busy`: try again in a few seconds.
    - Settings codes (via `needsSettings`): check AI in Settings.
    - `request_timeout` / `provider_unavailable` / `network`: try again later.
    - `provider_bad_response`: no valid outfit.
    - Everything else: "AI không khả dụng, đang dùng gợi ý thường".
    - An empty result, or one that `toAiOutfits` empties, shows no note.
  - **Weather leak (consult rec. 1).** The cleared weather timeout and the `Promise.race` leak are a separate
    follow-up (R7), not part of F-704.5.
  - **Modal tests** (fake suggester and a fake settings `get`):
    - Hidden when not ready.
    - Off on open, with no call before a tap.
    - Toggle-on shows AI cards, reasons and badge.
    - Rule cards stay while loading.
    - Each error code shows its note and the rule cards.
    - Empty → rule cards and no note.
    - Shuffle sends `avoidIds` and disables the button while loading.
    - Unmount aborts the signal.
    - A bidi-laden reason renders as text.
    - The existing weather tests are unchanged.
  - **One-off Playwright check** (D42; session Playwright; script in the scratchpad; result recorded in impl-log).
    - Run against `pnpm dev`, the same setup as F-704.2's `weather-verify.cjs`.
    - Mocks: `/healthz`, `/api/items`, `/api/locations`, `/api/weather`, **`/api/ai-settings`** (the real path:
      `server/api.js:23`, not `/api/ai/settings`) answering `{settings: {hasKey: true, modelSupported: true, …}}`,
      and `/api/ai/suggest-outfits` (success, then 429 `rate_limited`).
    - Viewports 390×844 and 1280×800, light and dark.
    - Assert:
      - The toggle is visible, off, and at least 44 px tall.
      - After the tap: 3 AI cards with the "AI" chip and the reason text.
      - On 429: rule cards plus the note.
      - No horizontal scroll, and text contrast ≥ 4.5 in both themes.
    - Screenshots go to the scratchpad.
