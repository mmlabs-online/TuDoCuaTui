# F-704.5 PLAN consult (frontend, read-only)

Everything below is checked against the current files. The F-704.4 `## Split proposal` (plan.md:183-261) is sound. Three points need correcting or tightening, and they come first.

## Corrections to the F-704.4 split proposal
1. **Weather timer.** plan.md:237 defers the timer clear as a follow-up. The F-704.5 ticket (Technical notes) puts it in scope, and the ticket wins. In `OutfitsModal.tsx:45-57`, the `setTimeout` is never cleared and the `Promise.race` keeps it alive. Fix:
   - Keep the timer id: `const t = setTimeout(() => reject(...), WEATHER_WAIT_MS)`.
   - Call `clearTimeout(t)` in the effect cleanup and when `weather.today` settles.
   - Optionally replace the race with a `settled` flag so no rejected promise is left dangling.
   - Add a test: unmount, then `advanceTimersByTimeAsync(WEATHER_WAIT_MS)` and assert `vi.getTimerCount()` is 0.
2. **Season conversion.** `suggestOutfits` returns `season` as a label (`Đông`), and `seasonOf` is at `suggest.ts:27`. Send `SEASON_TO_DB[season]` (`src/data/mappers.ts:117`), imported from `@/data/mappers`. The `useMemo` already yields `season`, so no new call to `seasonOf` is needed. Add a guard: if the lookup is undefined, make no call and show the rule set silently. Test that the fake client receives `"winter"` and never `"Đông"`.
3. **Weather flags.** `candidatePool` takes the raw `WeatherInput` (`suggest.ts:202`). The call body needs `weatherKind(w)` (`suggest.ts:48`), which returns `{cold, hot, rain}`. Use the same `w` for both: `status === "ready" ? data : undefined`. With no weather, the flags are all false.

## Component and state structure
Keep it in `OutfitsModal.tsx`, with at most one small inner `PieceButton` shared by both card kinds. The piece-button JSX is at lines 142-157. Reuse it as-is and do not duplicate it.

New props: `ai?: { settings: Pick<AiSettingsClient,"get">; settingsRev: number; outfits: AiOutfitSuggester }`.

Hooks inside the modal:
- `const { load } = useAiLoad(ai?.settings, ai?.settingsRev)` (`useAiLoad.ts:7`; it is safe with undefined settings). Then `const ready = !!ai && aiAvailability(load, true).kind === "ready"`.
- `useAiLoad` initialises to `{state:"loading"}` and never resets when `settings` is undefined. That is fine because `ready` also checks `!!ai`.
- `aiOn` is `useState(false)`. The modal is mounted only while `outfitsOpen` (App.tsx:285), so every open gets a fresh false (A3). Do not persist it.
- If `ready` becomes false while `aiOn` is true (settings change), the render derives `const aiActive = aiOn && ready`. Do not reset state in an effect.
- Result state: `aiResult: {key: string; outfits: AiOutfit[]} | null`, `aiState: "idle"|"loading"` and `aiError: string | null`.

Candidates and the effect key:
- `const pool = useMemo(() => candidatePool(items, {now, weather}), [items, now, weather])`.
- `const poolKey = pool.map(i => i.id).join(",")`. Key the effect on this string, not on `items`, because `items` gets a new identity on every wardrobe refresh.
- In the effect, read pool, items, season, avoidIds and flags through a ref, or list them with a lint-safe comment. The ref pattern is simplest: `latest.current = {...}` assigned during render.
- Effect deps: `[aiActive, weatherSettled, season, flagsKey, poolKey, seed]`. Here `weatherSettled = status !== "loading"` and `flagsKey = cold|hot|rain`. Without `weatherSettled`, the call would fire with the wrong pool while the weather is loading, and the pool would change when the weather resolves, causing a double call.
- `seed` is the shuffle trigger. Also add `aiAvoid` read from the ref, because shuffle sets it in the same batch as `seed`.

Effect body:
- If `!aiActive || !weatherSettled`: clear the result and error, then return. Calling `setState` in an effect here is acceptable, but a cheaper route is to derive "show AI" as `aiActive && aiResult?.key === currentKey`.
- If `pool.length < 2` or the season id is missing: set the state to idle and return, with no call and no note.
- Otherwise: create `const ac = new AbortController()`, `setAiState("loading")` and `setAiError(null)`.
- Then `ai.outfits.suggest({candidateIds: pool.map(id), season: SEASON_TO_DB[season], weather: flags, avoidIds}, ac.signal).then(...)`.
- On success: `if (ac.signal.aborted) return`, `const o = toAiOutfits(r, items)`, then `setAiResult({key, outfits: o})` and `setAiState("idle")`. When `o` is empty, leave no note.
- On error: if `ac.signal.aborted`, return silently. Otherwise `setAiError(code)` and `setAiState("idle")`. The code is `e instanceof AiSettingsError ? e.code : "internal"`; `AiSettingsError` comes from `@/data/aiSettings`.
- Cleanup: `ac.abort()`. This covers close and unmount, toggle-off, a shuffle (seed change) and a pool or weather change.
- Stale guards: the `aborted` check, plus a `key` string stored with the result (`poolKey + season + seed`). Render the overlay only when `aiResult.key === currentKey` and `aiActive`. After toggle-off and back on, the old result is not flashed, because the effect clears it on the off transition.
- Pass `items` to `toAiOutfits` from the ref. `toAiOutfits` already drops unknown ids and caps at 3 (`suggest.ts:237`).

Overlay rule: `const showAi = aiActive && aiResult && aiResult.outfits.length > 0`, and the rule `outfits` remain the fallback. This is not a gate: the rule memo (lines 62-71) is untouched.

The empty/failure branch at line 122 depends on the rule `outfits.length === 0`. Keep the rule-empty state as it is. A rule-empty pool gives `pool.length < 2` or an equally poor pool, so AI never runs there. Do not change that branch.

## Shuffle ("Đổi gợi ý")
- Current code (lines 78-81) sets `avoid` to the rule main ids and bumps `seed`.
- New code:
  - `const shown = showAi ? aiResult.outfits.flatMap(o => o.pieces.map(i => i.id)) : outfits.flatMap(o => o.main.map(i => i.id))`.
  - Then `setAvoid(rule ids as before)`, `setAiAvoid(shown)` and `setSeed(s => s+1)`.
- Keep `avoid` rule-based even when AI is on. The fallback after an error then stays fresh.
- The client already drops empty `avoidIds` (`aiOutfits.ts:59`) and the server caps at 40. Slice to 40 on the client: `shown.slice(0, 40)`. Three outfits of up to 5 pieces is at most 15, so this is cheap insurance.
- Button: `disabled={aiState === "loading"}`. Check that `Btn` forwards `disabled`; if not, extend it minimally or use a native button. Add `aria-disabled` only if `Btn` renders a non-button element.
- Since shuffle bumps `seed`, the effect reruns. That is the single call per shuffle, with no duplicate.

## Loading UI
- Wrap the cards in a container with `aria-busy={aiState === "loading"}` and the class `outfit-list--loading`, which sets `opacity: .55; pointer-events: none` (use `transition: opacity .15s`, and respect `prefers-reduced-motion`).
- Show a line "Đang nhờ AI gợi ý…" in a `role="status"` element. Add `COPY.ai.loading`.
- Keep that line's wrapper mounted so screen readers announce it. Do not put the busy line inside the `status === "loading"` weather branch at line 120. When the weather is loading and AI is on, the weather line shows first, then AI.
- Disabling `pointer-events` on cards while loading is optional. It avoids opening an item mid-swap, but the user may still want to open an item. Prefer dimming only, leaving the piece buttons live.

## AI card
- Same `.outfit-card`. The head shows `<span className="outfit-chip outfit-chip--ai">AI</span>` (`COPY.ai.chip`), then `<b>{COPY.outfitLabel(n+1)}</b>`.
- Below the head, add `<p className="outfit-reason">{o.reason}</p>`. This is a plain JSX text node. Do not use `dangerouslySetInnerHTML` and do not linkify. `cleanReason` has already run inside `toAiOutfits`, so call nothing else.
- The card key is `o.pieces.map(i => i.id).join("+")`. Prefix it with `ai-`, so React remounts when switching between rule and AI cards.
- Ensure the long unbroken text wraps: `overflow-wrap: anywhere`.
- Hide the rule-reason chips on AI cards. They describe the rule logic, not the AI pick.
- The season line (line 129) stays.

## Notes (role="status", Vietnamese)
- Add `COPY.ai.note(code: string): string | null` to `copy.ts`. It is a pure function, so `copy.test.ts` can cover every `AiErrorCode`.
- Mapping (text per plan.md:229-235):
  - `rate_limited`: "Hôm nay đã dùng hết lượt AI, đang dùng gợi ý thường."
  - `provider_rate_limited`: "Nhà cung cấp AI đang giới hạn lượt gọi, thử lại sau ít phút."
  - `ai_busy`: "AI đang bận, thử lại sau vài giây."
  - Settings codes (`needsSettings` from `@/features/items/aiFill`, `aiFill.ts:133`): "Kiểm tra lại AI trong Cài đặt."
  - `request_timeout`, `provider_unavailable`, `network`: "Chưa gọi được AI, thử lại sau."
  - `provider_bad_response`: "AI chưa đưa ra được bộ đồ hợp lệ."
  - Anything else: "AI không khả dụng, đang dùng gợi ý thường."
- The `needsSettings` check lives in the modal or in `note()`. Keep `note()` pure by importing `needsSettings` from aiFill. This is not a circular import, since aiFill imports `EDITOR_COPY` and not outfits copy.
- Render with `<p className="outfit-ai-note" role="status">` only when `aiError`. The cards below are the rule set. Never use `role="alert"`.
- The `copy.test.ts` check: iterate `Object.keys(AI_ERROR_STATUS)` plus `AI_CLIENT_ERROR_CODES` and assert each note is a non-empty string.
- Clear `aiError` when toggling off, and at the start of each new call.
- `unauthorized` (401): the authed fetch already calls `onAuthLost`. The note still falls into "anything else".
- Empty result (server `outfits: []`, or `toAiOutfits` returns `[]`): no note, rule cards.

## Toggle accessibility
- Row `.outfit-ai-toggle`, placed after the `.outfit-weather` block (line 119) and before the status ternary (line 120). Render only when `ready`.
- It must render even when the `weather` prop is absent, so it is independent of the `weather &&` condition.
- Markup: `<label className="outfit-ai-toggle"><input type="checkbox" role="switch" checked={aiOn} onChange={...} /> <span>✨ Gợi ý bằng AI</span></label>`.
- The label wraps the input, so the accessible name is the label text. The emoji is read aloud by some readers, so wrap it in `<span aria-hidden="true">✨</span>` and keep the name as "Gợi ý bằng AI". Tests then find it with `getByRole("switch", {name: "Gợi ý bằng AI"})`.
- `min-height: 44px`, with a visible `:focus-visible` outline. Use `accent-color: var(--accent)` or the project's equivalent variable (check the `:root` custom properties in index.css), and `flex-wrap: wrap` for 390px.
- Do not disable the switch while loading. Toggling off is the way to cancel.
- Optional hint under the label ("AI của bạn chọn và giải thích") only if it fits; not required.

## App.tsx (wiring only)
- Import `createHttpAiOutfits` from `@/data/aiOutfits`.
- After `weatherClient` (App.tsx:52-55), add `const aiOutfits = useMemo(() => createHttpAiOutfits(undefined, undefined, { getToken, onAuthLost }), [])` with the same comment.
- At App.tsx:286-289, add `ai={{ settings: aiClient, settingsRev: aiSettingsRev, outfits: aiOutfits }}`.
- Caution: the inline object gets a new identity on every App render. In the modal, depend on `ai?.settings`, `ai?.settingsRev` and `ai?.outfits`, never on `ai` itself, so the effect does not rerun. Alternatively memoise the object in App. The first is less App churn, so prefer it.
- `aiSettingsRev` (App.tsx:83, passed at 213/277) bumps after Settings closes, which makes `useAiLoad` reload. The modal is closed during Settings, so the rev matters mostly on first mount.

## 390 px, dark mode, CSS (index.css after line 2961)
Add to the outfit block (the `.outfit-*` rules at 2930-3036):
- `.outfit-ai-toggle`: flex, `align-items: center`, `gap: 10px`, `min-height: 44px`, `color: var(--text)`, `font-size: 13px`.
- `.outfit-chip--ai`: use the existing theme variables only (`var(--text)`, `var(--border)`, `var(--surface)`), with no hard-coded hex colours, so dark mode follows for free.
- `.outfit-reason`: `color: var(--text)` or `var(--muted)`, `font-size: 13px`, `line-height: 1.4`, `overflow-wrap: anywhere`, `margin: 0`.
- `.outfit-ai-note`: `color: var(--muted)`, `font-size: 12.5px`. Contrast of `var(--muted)` is already in use for `.outfit-season`.
- The loading class as above.
- Check that `.outfit-weather`'s 12.5px muted text keeps contrast of at least 4.5 in both themes (the Playwright check asserts it).

One-off Playwright (D42; the script goes in the scratchpad and the result in impl-log; do not commit the script). Mocks: `/healthz`, `/api/items`, `/api/locations`, `/api/weather`, `/api/ai-settings` (the real path, per plan.md:252, answering `{settings: {hasKey: true, modelSupported: true, provider, ...}}`) and `/api/ai/suggest-outfits`. The suggest mock should answer success first, then 429 `rate_limited`. Assert at 390x844 and 1280x800, light and dark:
- The toggle is visible, off, and at least 44 px tall.
- After the tap: 3 AI cards with the "AI" chip and the reason text.
- Shuffle: the request body contains `avoidIds`.
- On 429: rule cards plus the note.
- No horizontal scroll, and text contrast of at least 4.5 in both themes.
- Screenshots go to the scratchpad.

## Test cases (`OutfitsModal.test.tsx`, fake clients; no App-level tests, BUG-006)
Fake suggester: `{suggest: vi.fn()}`. Fake settings: `{get: vi.fn().mockResolvedValue(viewReady)}`, where `viewReady` is `{hasKey: true, modelSupported: true, provider: "claude", ...}`. Check the exact `AiSettingsView` fields in `@/data/aiSettings`. Flush with `await act(async () => {})` under the file's existing fake timers; `advanceTimersByTimeAsync(0)` also works. Use real UUID-like ids only if the fake does not validate. Note that `mk` ids are `m1`, `m2`, and the fake suggester accepts anything.
1. No `ai` prop: no switch. No key (`hasKey:false`), unsupported model, a `get` rejection, and still-loading settings: no switch.
2. Ready: the switch is present and unchecked. `suggest` is not called before the tap, nor on mount.
3. Tap: `suggest` is called once with `candidateIds` equal to the pool ids, `season: "summer"` for the July `NOW` (the label is `Hè`, so assert the DB id and not the label), and `weather` `{cold:false,hot:false,rain:false}`. AI cards render with the "AI" chip and the reason text, and the rule-reason chips are absent.
4. While the promise is pending: the rule cards are still present, the container has `aria-busy="true"`, the "Đang nhờ AI…" line shows, and "Đổi gợi ý" is disabled. After resolve: `aria-busy` false and the button enabled.
5. Each error code (table-driven with `AiSettingsError(status, code)`): the note appears with `role="status"` and the rule cards remain. `rate_limited`, `ai_busy` and a settings code each get a distinct text.
6. Empty `{outfits: []}`, and an outfit with unknown ids: rule cards and no note.
7. Shuffle with AI on: the second call's `avoidIds` equals the AI piece ids on screen; a second, different result is shown. With the rule set on screen (after an error), `avoidIds` equals the rule main ids.
8. Shuffle twice quickly, or toggle off then on, with a deferred promise: the first call's signal is aborted, and a late result from it is ignored.
9. Toggle off mid-flight: the signal is aborted, rule cards show and no note appears.
10. Unmount (close) mid-flight: the signal is aborted and no state-update warning appears.
11. Reopen (unmount and remount): the switch is off and `suggest` has not been called again.
12. Bidi and zero-width characters in a reason render cleaned (`toAiOutfits` strips them). Also assert that a reason like `<b>x</b>` appears as literal text, with no `<b>` element in the DOM.
13. Weather flow: with a place saved and a slow weather client, no `suggest` call happens until the weather settles. After the timeout or `ready`, there is exactly one call, with the right flags (for example cold weather gives `cold:true`).
14. Weather timer: after unmount, `vi.getTimerCount()` is 0 (the cleared timer).
15. Fewer than 2 candidates (a single dress): switch on, no call and no note.
16. Existing weather and rule tests unchanged.
`copy.test.ts`: `ai.note` returns non-empty text for every `AiErrorCode` and the Vietnamese strings exist.

## Risks
- **Double or stale calls.** The effect deps are the main hazard. Unstable deps (`items` identity, `ai` object, `weather` object) cause re-calls and burn the 30 daily calls. The `poolKey` and per-prop dependencies above, plus tests 8 and 13, guard this.
- **Weather settle ordering.** Without `weatherSettled`, a call fires on the pre-weather pool. Pool and flags must come from the same `status/data` snapshot.
- **Shuffle race.** `seed` and `aiAvoid` must be set in the same event handler so one render and one effect run see both. React 19 batches this.
- **Lint.** `react-hooks/exhaustive-deps` may complain about the ref-based reads. Prefer computing values in render and listing them explicitly over disabling the rule.
- **`Btn` `disabled` support.** Verify it before relying on it.
- **Rule-empty state.** The `outfits.length === 0` branch (line 122) hides the toggle's result, but the toggle row itself still shows. That is acceptable. It is a rule-empty edge, since the AI pool would be empty or tiny too.
- **Dark mode.** Hard-coded colours would break it. Use variables only.
- **Reason length and wrapping at 390 px.** Test with a 120-character reason and a long unbroken word.
- **Provider cost.** Disabled shuffle and the single-call effect protect it. There is no automatic retry. Do not add one.

## Out of scope (R7, follow-ups only)
Server changes; changes to `aiOutfits.ts`, `candidatePool`, `toAiOutfits` or `cleanReason`; saving or wearing an outfit (F-801-F-803); persisting the toggle (A3); a disabled-with-hint toggle; any App-level test (BUG-006); retry buttons; a link to Settings from the modal (the note text only); a daily-quota counter; extra analytics.

## Open questions
None blocking. One suggestion for the planner to confirm: whether the AI note should offer a "Mở Cài đặt" link for settings codes. I recommend text only (out of scope), as the modal has no handle to open Settings and App wiring must stay minimal.

Files read: /home/user/TuDoCuaTui/src/features/outfits/OutfitsModal.tsx, copy.ts, suggest.ts, OutfitsModal.test.tsx, /home/user/TuDoCuaTui/src/data/aiOutfits.ts, /home/user/TuDoCuaTui/src/features/items/useAiLoad.ts, aiFill.ts, /home/user/TuDoCuaTui/src/shared/ai/errors.ts, /home/user/TuDoCuaTui/src/App.tsx, /home/user/TuDoCuaTui/src/index.css, /home/user/TuDoCuaTui/work/tickets/F-704.5/ticket.md, /home/user/TuDoCuaTui/work/tickets/F-704.4/plan.md.

Not read (time): F-704.4 review.md and consult files, and F-704.3 plan/security-review beyond what F-704.4's plan quotes.
