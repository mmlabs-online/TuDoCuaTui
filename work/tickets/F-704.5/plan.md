Status: READY

# Plan — F-704.5: "✨ Gợi ý bằng AI" toggle in the outfits modal

## Scope summary
- `docs/feature-list.md` F-704: *"'Hôm nay mặc gì?': suggests 3 outfits from active items using season, weather
  (optional) and stale items first."* (epic E7 — AI).
- Ticket F-704.5 (`## Scope`): the toggle on its own row below the weather row, shown only when AI is ready, off on
  every open; the AI result as an overlay on the rule set (rule set stays the fallback); one effect keyed on the
  joined candidate ids, aborted on close, toggle-off and shuffle; cards stay (dimmed, `aria-busy`) while loading;
  "Đổi gợi ý" disabled while the AI call is in flight; a small "AI" chip and the reason as a plain text node; a
  `role="status"` Vietnamese note per error code, none for an empty result. `src/App.tsx`: wiring only.
- `work/tickets/F-704.4/plan.md` `## Split proposal` (the outline this ticket takes over), with three corrections
  from the consult (weather timer in scope, season id, weather flags).
- `work/tickets/F-704.3/plan.md` A3 (*"the AI toggle is off each time the modal opens. There is no localStorage, so
  no call ever happens without a tap"*), A4 (reason Vietnamese, ≤120), A5 (*"optional `avoidIds` (≤40 …) marks the
  items shown last time"*). `work/tickets/F-704.3/security-review.md:23`: *"render `reason` as plain text (no
  `dangerouslySetInnerHTML`, no auto-linking)"*.
- F-704.4 review follow-up: *"map `seasonOf(now)` through `SEASON_TO_DB` before calling `suggest`; skip the call
  when `candidatePool` returns fewer than 2 items"*.
- D42 (one-off Playwright check, not committed), BUG-006 (no App-level tests).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | With AI ready and the toggle on, the modal shows the AI-picked outfits (max 3) with an "AI" chip and their reasons; the rule-reason chips are not on AI cards. | `OutfitsModal.test.tsx` › "AI on: shows AI outfits with chip and reason" |
| 2 | The request uses the candidate pool ids, the season **DB id** (`"summer"` for the July `NOW`, never `"Hạ"`), and the weather flags `{cold,hot,rain}` from the same weather snapshot as the pool. | › "AI on: sends pool ids, season DB id and weather flags"; › "weather: waits for weather, then one call with its flags" |
| 3 | The toggle is hidden when there is no `ai` prop, while settings load, with no key, unsupported model, or a settings load error. | › "toggle hidden unless AI is ready" (table-driven) |
| 4 | The toggle is off on each open and no `suggest` call happens before a tap (A3). | › "toggle is off on open and makes no call"; › "reopen: toggle off again, no new call" |
| 5 | Each AI error falls back to the rule set with a `role="status"` Vietnamese note from `OUTFITS_COPY.ai.note(code)`. | › "AI error <code>: rule cards plus note" (`it.each`), `copy.test.ts` › "ai.note covers every AI error code" |
| 6 | An empty AI result (`outfits: []`, or all dropped by `toAiOutfits`) shows the rule set and **no** note. | › "empty AI result: rule cards, no note" |
| 7 | While the call is in flight the current cards stay, the list has `aria-busy="true"`, the line "Đang nhờ AI gợi ý…" shows, and "Đổi gợi ý" is disabled; all clear after it settles. | › "loading: cards stay dimmed, shuffle disabled" |
| 8 | "Đổi gợi ý" with AI on sends `avoidIds` = the piece ids of the AI outfits on screen (rule `main` ids when the rule set is on screen after an error) and shows the new set the server returns. | › "shuffle with AI on: sends avoidIds and shows the new set"; › "shuffle after an AI error: avoidIds are the rule ids" |
| 9 | Closing the modal, toggling off, or shuffling aborts the in-flight call; a late answer from an aborted call is ignored. | › "close aborts the call"; › "toggle off aborts, rule cards, no note"; › "late answer of an aborted call is ignored" |
| 10 | The reason is rendered as plain text (no HTML, bidi/zero-width stripped). | › "reason renders as plain text" |
| 11 | No call when fewer than 2 candidates or the rule set is empty; no note. | › "too few candidates: no call, no note" |
| 12 | The weather wait timer is cleared on close and once the weather settles. | › "weather timer cleared on close"; › "weather timer cleared after the weather arrives" |
| 13 | Works at 390 px and in dark mode. | One-off Playwright check (D42) recorded in impl-log (see Approach step 8); reviewer reads the result and screenshots |
| 14 | All checks pass; existing tests unchanged. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`; `git diff` shows only additions in `OutfitsModal.test.tsx` and `copy.test.ts` |

## Ming verification after merge
- With real Claude and Gemini keys: turn on "✨ Gợi ý bằng AI", check the 3 outfits make sense and the reasons read
  naturally in Vietnamese; press "Đổi gợi ý" and see a different set (ticket `## Test plan`).

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/outfits/OutfitsModal.tsx` | `ai` prop, toggle, AI effect, overlay cards, note, loading state, shuffle change, weather timer fix, shared `PieceButton` | Ticket scope | No |
| `src/features/outfits/OutfitsModal.test.tsx` | New tests (additions only) | AC 1–12 | No |
| `src/features/outfits/copy.ts` | `OUTFITS_COPY.ai` block | R6 | No |
| `src/features/outfits/copy.test.ts` | New tests (additions only) | R8 | No |
| `src/index.css` | `.outfit-ai-toggle`, `.outfit-list`, `.outfit-list--loading`, `.outfit-chip--ai`, `.outfit-reason`, `.outfit-ai-note` | R9 | No |
| `src/App.tsx` | Create the suggester once, pass `ai={…}` to `OutfitsModal` (wiring only) | Ticket scope | No |

No other file changes. In particular `src/data/aiOutfits.ts`, `suggest.ts`, `useAiLoad.ts`, `aiFill.ts` stay as they
are (R7).

## Tests to write
Fakes, in `OutfitsModal.test.tsx` (the file already runs on fake timers with `NOW` = 15 July 2026):
- `const viewReady: AiSettingsView = { …exact fields of AiSettingsView from @/data/aiSettings, hasKey: true, modelSupported: true, provider: "claude" }`.
- `aiProps(over?)` → `{ settings: { get: vi.fn().mockResolvedValue(viewReady) }, settingsRev: 0, outfits: { suggest: vi.fn() } }`,
  created once per test (stable identities).
- `deferred<T>()` helper for controlled promises; flush with `await act(async () => {})`.
- Switch lookup: `screen.getByRole("switch", { name: OUTFITS_COPY.ai.toggle })`.
- AI ids in answers are taken from `candidatePool(items, { now: NOW })` so `toAiOutfits` accepts them.

| Test (file › name) | Covers |
|---|---|
| `OutfitsModal.test.tsx` › "toggle hidden unless AI is ready" (`it.each`: no `ai` prop; `get` pending; `hasKey:false`; `modelSupported:false`; `get` rejects `AiSettingsError(503,"server_misconfigured")`) | AC 3 |
| › "toggle is off on open and makes no call" | AC 4 |
| › "AI on: sends pool ids, season DB id and weather flags" — one call; `candidateIds` = `candidatePool(items,{now:NOW}).map(i=>i.id)`; `season: "summer"`; `weather: {cold:false,hot:false,rain:false}`; no `avoidIds`; second arg is an `AbortSignal` | AC 2 |
| › "AI on: shows AI outfits with chip and reason" — answer with 3 outfits → 3 `.outfit-card` with `OUTFITS_COPY.ai.chip` and the reason text; `OUTFITS_COPY.reasons.neverWorn`/`stale` chips absent | AC 1 |
| › "loading: cards stay dimmed, shuffle disabled" — pending call: rule cards present, `.outfit-list` has `aria-busy="true"`, status text `OUTFITS_COPY.ai.loading`, shuffle button `disabled`; after resolve: `aria-busy="false"`, enabled | AC 7 |
| › "AI error <code>: rule cards plus note" (`it.each` over `rate_limited` 429, `provider_rate_limited` 429, `ai_busy` 503, `not_configured` 409, `request_timeout` 408, `provider_bad_response` 502, `network` 0, `internal` 500; plus a plain `Error` → `internal`) — `getByRole("status")` text equals `OUTFITS_COPY.ai.note(code)`, rule cards present, no AI chip | AC 5 |
| › "empty AI result: rule cards, no note" (`{outfits: []}` and an outfit with an unknown id) | AC 6 |
| › "shuffle with AI on: sends avoidIds and shows the new set" — first answer A, click shuffle → second call has `avoidIds` = ids of A's pieces (in order); second answer B is shown | AC 8 |
| › "shuffle after an AI error: avoidIds are the rule ids" — first call rejects; shuffle → `avoidIds` = rule `main` ids that were on screen | AC 8 |
| › "late answer of an aborted call is ignored" — deferred first call; shuffle; first signal `aborted === true`; resolve first late → its outfits not shown; second answer shown | AC 9 |
| › "toggle off aborts, rule cards, no note" — deferred call, click switch off → signal aborted, switch unchecked, rule cards, no `aria-busy="true"`, no note; rejecting with the abort error afterwards shows nothing | AC 9 |
| › "close aborts the call" — deferred call, `unmount()` → signal aborted, no error thrown | AC 9 |
| › "reopen: toggle off again, no new call" — toggle on, unmount, render again with the same fakes → switch unchecked, `suggest` called once in total | AC 4 |
| › "toggle off then on: fresh call, old result not shown while loading" — answer A shown; off; on → second call pending, A's AI chip not present | AC 9 |
| › "reason renders as plain text" — reason `"<b>x</b>‮abc​"` → text `"<b>x</b>abc"` present, `container.querySelector(".outfit-reason b")` is null | AC 10 |
| › "too few candidates: no call, no note" — items `[mk("Đầm")]` (one candidate), toggle on → `suggest` not called, no status note, no `aria-busy="true"` | AC 11 |
| › "weather: waits for weather, then one call with its flags" — place saved in `localStorage[WEATHER_PLACE_KEY]`, deferred `today`; toggle on → no call; resolve `{minC:15,maxC:20,rainChance:80}` → exactly one call with `weather: {cold:true,hot:false,rain:true}` and `candidateIds` = `candidatePool(items,{now:NOW, weather})` ids | AC 2 |
| › "weather timer cleared on close" — place saved, `today` never settles, `unmount()` → `vi.getTimerCount()` is 0 | AC 12 |
| › "weather timer cleared after the weather arrives" — `today` resolves, flush → `vi.getTimerCount()` is 0 | AC 12 |
| `copy.test.ts` › "ai.note covers every AI error code" — every key of `AI_ERROR_STATUS` and every `AI_CLIENT_ERROR_CODES` entry gives a non-empty string | AC 5, R8 |
| `copy.test.ts` › "ai copy texts" — exact strings for toggle, chip, loading and the notes for `rate_limited`, `provider_rate_limited`, `ai_busy`, `not_configured`, `invalid_key`, `request_timeout`, `network`, `provider_bad_response`, `internal` | R6, AC 5 |

If `Modal` or another child owns a timer of its own, the two timer tests compare against the count from the same
render with no weather client instead of 0 (record it in impl-log).

## Approach

### 1. Copy (`src/features/outfits/copy.ts`, R6)
Add to `OUTFITS_COPY` (import `needsSettings` from `@/features/items/aiFill`; no cycle — aiFill imports only items
copy):
```ts
ai: {
  icon: "✨",
  toggle: "Gợi ý bằng AI",
  chip: "AI",
  loading: "Đang nhờ AI gợi ý…",
  note: (code: string): string => {
    if (code === "rate_limited") return "Hôm nay đã dùng hết lượt AI, đang dùng gợi ý thường.";
    if (code === "provider_rate_limited") return "Nhà cung cấp AI đang giới hạn lượt gọi, thử lại sau ít phút.";
    if (code === "ai_busy") return "AI đang bận, thử lại sau vài giây.";
    if (needsSettings(code)) return "Kiểm tra lại AI trong Cài đặt.";
    if (code === "request_timeout" || code === "provider_unavailable" || code === "network")
      return "Chưa gọi được AI, thử lại sau.";
    if (code === "provider_bad_response") return "AI chưa đưa ra được bộ đồ hợp lệ.";
    return "AI không khả dụng, đang dùng gợi ý thường.";
  },
},
```
`as const` on the object stays valid (function members are fine). No "Mở Cài đặt" link (see Specialist input).

### 2. Weather timer fix (`OutfitsModal.tsx:38-61`)
```ts
let timer: ReturnType<typeof setTimeout> | undefined;
const timeout = new Promise<never>((_, reject) => {
  timer = setTimeout(() => reject(new Error("timeout")), WEATHER_WAIT_MS);
});
Promise.race([weather.today(place), timeout])
  .then(ok, fail)
  .finally(() => clearTimeout(timer));
return () => { cancelled = true; clearTimeout(timer); };
```
A cleared timer leaves the `timeout` promise pending forever (never rejected), so there is no dangling rejection.
Existing weather behaviour and tests are unchanged.

### 3. Props and readiness
```ts
ai?: { settings: Pick<AiSettingsClient, "get">; settingsRev: number; outfits: AiOutfitSuggester };
```
- `const { load } = useAiLoad(ai?.settings, ai?.settingsRev);`
- `const ready = !!ai && aiAvailability(load, true).kind === "ready";` (`hasPhoto` = true: no photo needed here).
- `const suggester = ai?.outfits;` — effects depend on `suggester`, never on the `ai` object (new identity on every
  App render).
- `const [aiOn, setAiOn] = useState(false)` — fresh on every mount (A3); `const aiActive = aiOn && ready`.

### 4. Candidates, key and the derived AI state (no setState inside the effect body)
Computed in render:
- `const w = status === "ready" ? (data ?? undefined) : undefined;` — the same snapshot feeds the rule memo,
  `candidatePool` and `weatherKind` (consult correction 3).
- `const pool = useMemo(() => candidatePool(items, { now, weather: w }), [items, now, w]);`
  `const poolKey = pool.map((i) => i.id).join(",");`
- `const { cold, hot, rain } = weatherKind(w);` `const seasonId = SEASON_TO_DB[season];` (from `@/data/mappers`;
  `season` comes from the existing `suggestOutfits` memo — consult correction 2).
- `const weatherSettled = status !== "loading";`
- `const eligible = aiActive && weatherSettled && !!seasonId && pool.length >= 2 && outfits.length > 0;`
- `const key = [poolKey, seasonId, cold, hot, rain, seed].join("|");`
- State: `const [aiOutcome, setAiOutcome] = useState<{ key: string; result?: AiSuggestResult; error?: string } | null>(null);`
  and `const [aiAvoid, setAiAvoid] = useState<string[]>([]);`
- `const aiLoading = eligible && aiOutcome?.key !== key;`
- `const aiOutfits = useMemo(() => (aiOutcome?.result ? toAiOutfits(aiOutcome.result, items) : []), [aiOutcome, items]);`
  (`toAiOutfits` runs at render time so a wardrobe refresh that archives an item drops that outfit.)
- `const showAi = aiActive && aiOutfits.length > 0 && (aiOutcome!.key === key || aiLoading);` — previous AI cards
  stay (dimmed) while a shuffle loads.
- `const aiNote = aiActive && !aiLoading && aiOutcome?.key === key && aiOutcome.error ? COPY.ai.note(aiOutcome.error) : null;`

### 5. The one effect
```ts
useEffect(() => {
  if (!eligible || !suggester) return;
  const ac = new AbortController();
  suggester
    .suggest(
      { candidateIds: poolKey.split(","), season: seasonId, weather: { cold, hot, rain },
        avoidIds: aiAvoid.slice(0, 40) },
      ac.signal,
    )
    .then(
      (result) => { if (!ac.signal.aborted) setAiOutcome({ key, result }); },
      (e) => {
        if (ac.signal.aborted) return;
        setAiOutcome({ key, error: e instanceof AiSettingsError ? e.code : "internal" });
      },
    );
  return () => ac.abort();
}, [eligible, suggester, key, poolKey, seasonId, cold, hot, rain, aiAvoid]);
```
- Keyed on `poolKey` (joined ids), not `items` (new identity on every wardrobe refresh). Item ids are UUIDs, so the
  `,` split is safe.
- Cleanup aborts on close/unmount, toggle-off (`eligible` false), shuffle (`seed` → `key` changes) and pool/weather
  change. Waiting for `weatherSettled` avoids a call on the pre-weather pool and a double call when it arrives.
- `seasonId` is typed as possibly undefined; the `eligible` guard covers it (use `seasonId!` or narrow inside).
- No retry, no automatic second call (each call is one of the 30 daily calls).

### 6. Event handlers
- Toggle `onChange`: `setAiOn(checked); setAiOutcome(null); setAiAvoid((a) => (a.length ? [] : a));` — clearing in
  the handler means toggle off → on never flashes the old result, and the first call after a tap sends no
  `avoidIds`.
- `shuffle`: keep `setAvoid(rule main ids)` (the fallback stays fresh), then
  `setAiAvoid(aiActive ? (showAi ? aiOutfits.flatMap((o) => o.pieces.map((i) => i.id)) : outfits.flatMap((o) => o.main.map((i) => i.id))) : [])`
  and `setSeed((s) => s + 1)` in the same handler (React batches: one render, one effect run). The 40 cap is
  applied in the effect.
- Shuffle button: `<Btn kind="primary" onClick={shuffle} disabled={aiLoading}>` (`Btn` spreads button props, so
  `disabled` works).

### 7. Markup (`OutfitsModal.tsx`)
- Extract the piece button (current lines 142-157) into a local `PieceButton({ item, onOpenItem })` used by both
  card kinds.
- After the `weather && …` block, independent of it: when `ready`,
  ```tsx
  <label className="outfit-ai-toggle">
    <input type="checkbox" role="switch" checked={aiOn} onChange={…} />
    <span><span aria-hidden="true">{COPY.ai.icon}</span> {COPY.ai.toggle}</span>
  </label>
  ```
  Never disabled (toggling off is how to cancel). Accessible name "Gợi ý bằng AI" (the emoji is `aria-hidden`).
- In the non-empty branch, after the season line: when `aiActive`, one live region
  `<p className="outfit-ai-note" role="status">{aiLoading ? COPY.ai.loading : (aiNote ?? "")}</p>` (kept mounted
  while AI is on so announcements are read; never `role="alert"`).
- Wrap the cards in `<div className={"outfit-list" + (aiLoading ? " outfit-list--loading" : "")} aria-busy={aiLoading}>`.
- When `showAi`: `aiOutfits.map((o, n) => <section className="outfit-card" key={"ai-" + ids.join("+")}>` with head
  `<span className="outfit-chip outfit-chip--ai">{COPY.ai.chip}</span><b>{COPY.outfitLabel(n + 1)}</b>`, then
  `<p className="outfit-reason">{o.reason}</p>` (plain JSX text node; `cleanReason` already ran in `toAiOutfits`;
  no `dangerouslySetInnerHTML`, no linkify), then the pieces. No rule-reason chips on AI cards. Otherwise the
  existing rule cards, unchanged.
- The empty-state and weather-loading branches are unchanged.

### 8. CSS (`src/index.css`, after `.outfit-empty p`, theme variables only — R9)
- `.outfit-ai-toggle`: `display:flex; flex-wrap:wrap; align-items:center; gap:10px; min-height:44px; color:var(--text); font-size:13px; cursor:pointer;`
  `.outfit-ai-toggle input { width:20px; height:20px; accent-color:var(--green); }` (same as `.check-row input`),
  `.outfit-ai-toggle input:focus-visible { outline:2px solid var(--green-ink); outline-offset:2px; }`.
- `.outfit-list { display:flex; flex-direction:column; gap:12px; transition:opacity .15s; }` (same gap as
  `.outfit-body`, so layout is unchanged), `.outfit-list--loading { opacity:.55; }` (piece buttons stay live),
  `@media (prefers-reduced-motion: reduce) { .outfit-list { transition:none; } }`.
- `.outfit-chip--ai { color:var(--green-ink); border-color:var(--green-ink); font-weight:600; }` (`--green-ink` is
  defined for light and `.dark`).
- `.outfit-reason { margin:0; color:var(--text); font-size:13px; line-height:1.4; overflow-wrap:anywhere; }`.
- `.outfit-ai-note { margin:0; color:var(--muted); font-size:12.5px; }` (the same pairing as `.outfit-season`).
  Do **not** hide it with `:empty { display:none }`: a live region that is not rendered may not be announced when
  text arrives. An empty `<p>` only adds the flex gap, which is acceptable.
- No hard-coded colours.

### 9. App wiring (`src/App.tsx`, hotspot, wiring only)
- `import { createHttpAiOutfits } from "@/data/aiOutfits";`
- After `weatherClient`: `const aiOutfits = useMemo(() => createHttpAiOutfits(undefined, undefined, { getToken, onAuthLost }), [], // same injection as aiClient );`
- On `<OutfitsModal …>`: `ai={{ settings: aiClient, settingsRev: aiSettingsRev, outfits: aiOutfits }}`.
- No other App change and no App-level test (BUG-006). R1: the only `fetch` stays in `src/data/aiOutfits.ts`.

### 10. One-off Playwright check (D42; script in the scratchpad, not committed; result in impl-log)
Same setup as F-704.2's `weather-verify.cjs` (`pnpm dev --port 5199 --strictPort`, `NODE_PATH=$(npm root -g)`).
- Mocks: `/healthz`, `/api/items` (≥ 8 active items: tops, bottoms, dresses, shoes), `/api/locations`,
  `/api/weather`, `/api/ai-settings` (real path, `server/api.js:23`) answering `{settings: {hasKey: true,
  modelSupported: true, provider: "claude", …}}`, and `/api/ai/suggest-outfits`: 1st request 200 with 3 outfits
  (one reason of 120 characters, one with a long unbroken word), 2nd request (shuffle) 200 with a different set,
  3rd request 429 `{error:{code:"rate_limited"}}`.
- Viewports 390×844 and 1280×800; light, and dark via `localStorage["tu-do-theme"] = "dark"` (`THEME_KEY`).
- Assert: the switch is visible, unchecked, row ≥ 44 px tall; after the tap, 3 cards with the "AI" chip and the
  reason; shuffle → the request body has `avoidIds`, a new set shows; toggle off/on (3rd request) → rule cards plus
  the `rate_limited` note; no horizontal scroll (`scrollWidth <= clientWidth`); contrast ≥ 4.5 for the reason, chip,
  note and toggle label in both themes. Screenshots to the scratchpad.

### Rules
R1 (data via the client, no `fetch` in the component), R6 (copy only in `copy.ts`), R7 (only the listed files),
R8 (tests for the new copy function and the modal), R9 (390 px + dark, variables only). The reason is a text node
(F-704.3 security review). No High path, no review trigger path.

## Specialist input used
From `consult-frontend-developer.md`:
- **Correction 1 (weather timer in scope): adopted**, without the optional `settled` flag (clearing the timer
  already leaves no rejection pending).
- **Correction 2 (`SEASON_TO_DB[season]`, guard when undefined): adopted.**
- **Correction 3 (same `w` for pool and `weatherKind`): adopted.**
- **Component structure, props, `useAiLoad` + `aiAvailability`, `aiOn` not persisted, `aiActive = aiOn && ready`:
  adopted.**
- **`aiResult`/`aiState`/`aiError` state with setState inside the effect: replaced** by one `aiOutcome` keyed state
  and derived `aiLoading`/`showAi`/`aiNote` (Approach §4). Same behaviour; no synchronous setState in the effect,
  no stale flash, simpler abort handling.
- **Ref for `latest` values: rejected**; all inputs are primitives or stable (`poolKey`, `seasonId`, flags, `key`,
  `aiAvoid`), listed as deps. The repo has no ESLint, but explicit deps keep it obvious.
- **`toAiOutfits` inside the effect: changed** to render time (`useMemo` on `aiOutcome`, `items`), so the effect
  needs no `items`.
- **Shuffle: adopted** (rule `avoid` kept; `aiAvoid` = AI piece ids or rule main ids; cap 40; one call per
  shuffle; button disabled while loading). Added: toggle handler resets `aiAvoid`, so the first call after a tap
  has no `avoidIds`.
- **Loading UI: adopted** (dim + `aria-busy` + status line; piece buttons stay live, no `pointer-events:none`).
- **AI card, plain-text reason, `ai-` key, `overflow-wrap:anywhere`, no rule chips: adopted.**
- **Notes mapping and pure `note(code)` using `needsSettings`: adopted** with the exact texts. One shared
  `role="status"` element for loading and note instead of two.
- **Toggle markup (`role="switch"`, `aria-hidden` emoji, 44 px, focus-visible, never disabled): adopted**;
  `accent-color: var(--green)` (there is no `--accent`; `.check-row input` uses `--green`). Optional hint line:
  rejected (not required).
- **App wiring with per-field deps: adopted.**
- **CSS with theme variables: adopted**; AI chip uses `--green-ink` (defined in both themes).
- **Playwright check: adopted**, plus a shuffle request and a long unbroken word.
- **Test cases 1–16: adopted** (see Tests to write); case 16 is "existing tests unchanged" (AC 14).
- **Rule-empty state:** consult keeps the toggle visible and expects no call; adopted, and made explicit by
  `outfits.length > 0` in `eligible` (the server enforces the same outfit rules, so a call could not produce a
  valid set and would only spend quota).
- **Open question (Settings link): decided — text only.** The note says "Kiểm tra lại AI trong Cài đặt."; no
  "Mở Cài đặt" link. The modal has no handle to open Settings, it would need more App wiring, and the ticket does
  not ask for it.

## Assumptions
- No other ticket is `IN_PROGRESS`, `REVIEW` or `DONE` (`work/backlog.md`), so there is no hotspot conflict on
  `src/App.tsx`, `OutfitsModal.tsx`, `copy.ts` or `src/index.css`.
- **Existing tests that change: none.** All current `OutfitsModal.test.tsx` and `copy.test.ts` cases render without
  the `ai` prop (no switch, no AI path) and select `.outfit-card` / `.outfit-name` / roles, which the
  `.outfit-list` wrapper does not affect. The weather timer fix keeps the "slow weather client" test's behaviour.
  If one does need a change, the implementer records why in impl-log.
- A stale AI result after `ready` turns false mid-session is hidden by `aiActive`; no effect resets `aiOn`.
- `unauthorized` (401) falls to the generic note; the authed fetch already calls `onAuthLost`.
- Size: about 400 changed lines (≈150 component, ≈25 copy, ≈45 CSS, ≈5 App, ≈200 tests). One cycle.

## Blocking questions
None.

## Split proposal
None.

## Follow-ups (out of scope, R7)
- Narrow `AiSuggestInput.season` to `DbSeason` in `src/data/aiOutfits.ts` (F-704.4 review nit) so a label can not
  be sent by mistake.
- `cleanReason` nits from the F-704.4 review (U+2028/2029 to a space; trailing space after the 120 cut).
- A "Mở Cài đặt" shortcut from the settings-code note, if Ming wants it.
- Hide the toggle in the rule-empty state, if Ming finds a visible but idle toggle confusing.
