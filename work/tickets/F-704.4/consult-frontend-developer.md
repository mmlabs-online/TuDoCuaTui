# F-704.4 consult — frontend-developer (2026-11-18)

**Findings**
- OutfitsModal today: the weather effect (race with a 5 s timeout and a `cancelled` flag; the timeout is never
  cleared) feeds a `useMemo(suggestOutfits)`. `status==="loading"` hides the cards. Rule outfits are deterministic from
  (items, now, seed, avoid, weather).
- Server (`suggest-outfits`): body is exactly `{candidateIds (1..40 uuids), season, weather:{cold,hot,rain}, avoidIds?}`.
  Reply is `{outfits:[{itemIds (ordered main→outer→shoes→accessory), reason ≤120}]}`, or `{outfits:[]}` with fewer
  than 2 candidates. The server validates combos and reasons, but the client must still check.
- Errors: reuse `AiSettingsError` and the `createHttpAiTagger` pattern (fetch, error parse, `isServerErrorCode`); add
  `src/data/aiSuggest.ts` with `AiOutfitSuggester.suggest(body, signal)`. `aiAvailability(load,true)` gives
  ready/no_key/model_unsupported/etc.

**Recommendations**
1. **State:** the rule result stays the single source of truth and renders as soon as weather settles; the AI is an
   overlay, not a gate. Add `ai: {state:"idle"|"loading"|"ready"|"error", outfits, code}` plus a
   `useRef<AbortController>`. One effect keyed on `[aiOn, status, seed, candidate ids, data]` runs only when
   `aiOn && status!=="loading"`: abort the previous controller, then call `suggest({candidateIds: rule-piece ids ∪
   eligible active items, capped at 40, weather: weatherKind(data), season, avoidIds: avoid})`. Abort in the cleanup
   (close/unmount and rapid shuffle both cancel; swallow aborted errors via `signal.aborted`). While loading keep the
   rule cards, dimmed (`aria-busy`), with "Đang nhờ AI gợi ý…", so nothing reshuffles. Swap in AI cards only on
   success; on shuffle keep the old cards until the new response arrives. Also clear the weather timeout and drop the
   `Promise.race` leak.
2. **Mapping:** `Map<id,Item>` from `items`; drop outfits with an unknown id (deleted/archived meanwhile) or fewer than
   2 pieces; render pieces in server order. None left → "empty": fall back to the rule cards with a note. Reason:
   JSX text node only (no HTML), after `normalize("NFC")` and stripping bidi/zero-width characters (U+200B–U+200F,
   U+202A–U+202E, U+2066–U+2069, U+FEFF) plus control chars, trimmed, cut to 120 — a pure, unit-tested helper in
   `src/features/outfits/`.
3. **Layout at 390px:** the toggle on its own row below the weather row (do not squeeze it into `.outfit-weather`).
   `<button role="switch" aria-checked>` or a checkbox labelled "✨ Gợi ý bằng AI", ≥44 px tall, wrapping allowed. Show
   it only when an AI client is provided; when `aiAvailability` is not ready, keep it disabled with a one-line hint
   (no key → "Cần nhập khoá AI trong Cài đặt"). Check dark mode.
4. **Distinct Vietnamese notes** (everything else → "AI không khả dụng, đang dùng gợi ý thường"): `rate_limited`
   (reuse EDITOR_COPY.ai.rateLimited), `provider_rate_limited`, `ai_busy` (retry shortly), settings errors
   (`not_configured`, `invalid_key`, `key_forbidden`, `key_unreadable`, `model_unavailable`, `invalid_model` via
   `needsSettings`, pointing to Settings), `request_timeout` / `provider_unavailable` / `network` (try again),
   `provider_bad_response` (also "no valid outfits"), `unauthorized` (handled by onAuthLost). A failure never blocks
   the rule outfits. Strings in `outfits/copy.ts` (R6) with a test that every code maps to a non-empty string.
5. **App.tsx:** `const aiSuggester = useMemo(() => createHttpAiSuggester(undefined, undefined, {getToken, onAuthLost}), [])`
   next to the weather client; pass `aiSuggest`, `aiClient` and `aiSettingsRev` to `<OutfitsModal>`; inside, call
   `useAiLoad(aiClient, aiSettingsRev)` and `aiAvailability(load, true)`.

**Risks**
- An effect dependency on `items` can re-fire the call when the wardrobe refreshes; key it on the joined candidate ids.
- Every shuffle spends one of 30 per day; disable "Đổi gợi ý" while the AI call is loading.
- The server only sees ids, so the client must recheck active status.

**Open questions**
- Persist the toggle or reset per open? (Already decided with F-704.3 plan A3: off each time the modal opens.)
- In AI mode, should "Đổi gợi ý" pass `avoidIds` from the shown AI outfits? (Recommended: yes; F-704.3 A5.)
- A visible "AI" badge on each AI card? (Recommended.)
