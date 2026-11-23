Status: READY

# Plan — BUG-015: Last-worn label says "0 ngày trước" in the editor but "hôm nay" on the card

## Scope summary
Scope reference is the bug report in `work/tickets/BUG-015/ticket.md`:

> **Expected**
> - One wording in both places: "hôm nay" for 0 days (and the same "N ngày" / "hơn 1 năm" rules).

> **Scope**
> - One shared last-worn formatter (in the items copy/constants, R6) used by both the card and the editor.

> **Out of scope**
> - The never-worn wording (BUG-011 decides it; reuse it here once merged).

BUG-011 is `MERGED` (`work/backlog.md:112`); its never-worn wording on the card is `EDITOR_COPY.wear.neverWorn`
("chưa mặc"), and this plan reuses it unchanged.

Root cause, confirmed against `main` (line numbers have drifted from the ticket):
- `src/features/items/Editor.tsx:323-325` builds `` `Lần cuối ${ageInDays(item.lastWorn)} ngày trước` `` inline, with
  no 0-day or >365-day rule, so a wear logged today renders "Lần cuối 0 ngày trước".
- `src/features/items/ItemCard.tsx:40-46` has its own nested ternary (`neverWorn` / "hơn 1 năm" / "hôm nay" /
  `` `${days} ngày` ``) with the literals inline in JSX (an R6 violation).
- Date maths is correct and shared: `ageInDays` (`src/features/items/filters.ts:7`) → `daysSince`
  (`src/lib/dates.ts`), local calendar days, UTC+7 safe. Only the wording is wrong; no date code changes.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: fails on `main` before the fix, passes after | `Editor.test.tsx` › `last worn label` › `worn today shows Lần cuối hôm nay`. Implementer records in impl-log that it was run (red) before the source change, then green after. Reviewer may confirm by stashing the `Editor.tsx` change and re-running `pnpm test -- Editor.test.tsx`. |
| 2a | "hôm nay" for 0 days in both places | Regression test above (editor) + existing `ItemCard.test.tsx` › `shows "hôm nay" at 02:00 UTC+7 for an item worn today` (card) |
| 2b | Same "N ngày" rule in both places | `Editor.test.tsx` › `last worn label` › `worn 3 days ago shows Lần cuối 3 ngày` + existing `ItemCard.test.tsx` › `shows "1 ngày" ...` + `copy.test.ts` › `lastWornLabel` cases |
| 2c | Same "hơn 1 năm" rule in both places | `Editor.test.tsx` › `last worn label` › `worn over a year ago shows Lần cuối hơn 1 năm` + `ItemCard.test.tsx` › `shows "hơn 1 năm" for an item worn over 365 days ago` |
| 2d | One shared formatter (scope) | Code read: `ItemCard.tsx` and `Editor.tsx` both call `lastWornLabel` from `./copy`; no "hôm nay" / "hơn 1 năm" / "ngày trước" literals left in either component (`grep` in `src/features/items/*.tsx`) |
| 3 | All checks pass | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` all green |

## Ming verification after merge
None required for the logic. Optional: on production after the next release, open a worn-today item and see
"Lần cuối hôm nay" in the editor matching "hôm nay" on the card (UAT-6 recheck).

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/items/copy.ts` | Add `EDITOR_COPY.wear.today: "hôm nay"`, `overYear: "hơn 1 năm"`, `days: (n: number) => \`${n} ngày\``, `lastWorn: (label: string) => \`Lần cuối ${label}\``, `noHistory: "Chưa có lịch sử"`; export pure `lastWornLabel(lastWorn: string, days: number): string` | The single shared formatter (scope); R6 copy in one place | No |
| `src/features/items/ItemCard.tsx` | Replace the nested ternary in `wear-pill` (lines 40-46) with `lastWornLabel(item.lastWorn, days)` | Card uses the shared formatter; removes inline literals (R6) | No |
| `src/features/items/Editor.tsx` | Lines 322-326 only: `item.lastWorn ? EDITOR_COPY.wear.lastWorn(lastWornLabel(item.lastWorn, ageInDays(item.lastWorn))) : EDITOR_COPY.wear.noHistory`; add `lastWornLabel` to the existing `./copy` import (line 16) | The bug fix | No |
| `src/features/items/copy.test.ts` (new) | Unit tests for `lastWornLabel` | R8: new pure logic needs unit tests | No |
| `src/features/items/Editor.test.tsx` | New `describe("last worn label")` placed directly after the `renderEditor` helper (before `describe("photo inputs")`, ~line 68) | Regression test (D42) and editor wording coverage | No |
| `src/features/items/ItemCard.test.tsx` | Add one test in `describe("ItemCard wear pill")`: "hơn 1 năm" for > 365 days | Covers the card refactor's over-year branch (previously untested) | No |

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `src/features/items/Editor.test.tsx` › `last worn label` › `worn today shows Lần cuối hôm nay` | **Regression (fails on `main`).** Fake `Date` only (`vi.useFakeTimers({ toFake: ["Date"] })`, `vi.setSystemTime("2026-11-07T02:00:00+07:00")`), render `renderEditor(vi.fn(), { ...blankItem(), name: "Áo", wearCount: 1, lastWorn: "2026-11-07" }, false)`. Assert `getByText("Lần cuối hôm nay")` exists and `queryByText(/0 ngày/)` is null. On `main` it renders "Lần cuối 0 ngày trước" → fails. 02:00 UTC+7 also exercises the UTC vs UTC+7 edge (domain focus). |
| `src/features/items/Editor.test.tsx` › `last worn label` › `worn 3 days ago shows Lần cuối 3 ngày` | Same "N ngày" rule as the card; `lastWorn: "2026-11-04"` at the same system time; asserts exact text and absence of `/ngày trước/` |
| `src/features/items/Editor.test.tsx` › `last worn label` › `worn over a year ago shows Lần cuối hơn 1 năm` | Over-year rule; `lastWorn: "2025-11-01"` |
| `src/features/items/Editor.test.tsx` › `last worn label` › `never worn shows Chưa có lịch sử` | Never-worn editor text unchanged (`lastWorn: ""`, `wearCount: 0`) — guards against the formatter's `neverWorn` leaking into "Lần cuối chưa mặc" |
| `src/features/items/copy.test.ts` › `lastWornLabel` › `empty lastWorn returns the never-worn wording` | `("", 999)` → `EDITOR_COPY.wear.neverWorn` (empty-field domain focus; the 999 fallback must not yield "hơn 1 năm") |
| `src/features/items/copy.test.ts` › `lastWornLabel` › `0 days is hôm nay` | `("2026-11-07", 0)` → "hôm nay" |
| `src/features/items/copy.test.ts` › `lastWornLabel` › `1 and 365 days are N ngày` | → "1 ngày", "365 ngày" (boundary) |
| `src/features/items/copy.test.ts` › `lastWornLabel` › `366 days is hơn 1 năm` | → "hơn 1 năm" (boundary) |
| `src/features/items/ItemCard.test.tsx` › `ItemCard wear pill` › `shows "hơn 1 năm" for an item worn over 365 days ago` | Card over-year branch after the refactor, via existing `renderAt` |

The `last worn label` describe needs its own `afterEach(() => vi.useRealTimers())`: the file-level `afterEach`
only runs `cleanup()` and `vi.restoreAllMocks()`, which do not restore timers.

## Approach
1. Write the regression test in `Editor.test.tsx` first; run `pnpm test -- Editor.test.tsx` and record the
   failure (actual text "Lần cuối 0 ngày trước") in impl-log.
2. In `copy.ts`, add the wear strings and `lastWornLabel(lastWorn, days)`:
   `lastWorn === "" → neverWorn`; `days > 365 → overYear`; `days === 0 → today`; else `days(n)`. Same order and
   thresholds as the current card ternary, so the card's behaviour is byte-for-byte unchanged. The day count is a
   parameter because the card gets `age` by prop (`ItemGrid.tsx:58`). Keep it pure (no `Date.now()`).
3. `ItemCard.tsx`: call `lastWornLabel(item.lastWorn, days)` in `wear-pill`; import it from `./copy` alongside
   `EDITOR_COPY`.
4. `Editor.tsx`: change only lines 322-326 and the `./copy` import line. Keep the `item.lastWorn ? … : …` guard
   (it keeps the editor's own never-worn text and avoids the `999` fallback).
5. Add the remaining editor, card and `copy.test.ts` tests; run all checks.

Rules: R6 (all new Vietnamese strings live in `EDITOR_COPY`, components hold none of the touched literals);
R7 (only the files above; the other inline literals in `ItemCard.tsx`, e.g. "Chưa có ảnh", "Không hãng", "Chưa có
vị trí", are follow-ups, not this diff); R8 (pure formatter has unit tests); R9 (text-only change in existing
elements; "Lần cuối hôm nay" is shorter than the old string, so 390px layout is not at risk); R5 (nothing stored;
the label is derived from `lastWorn` at render). No High path is touched, so no plan approval gate.

## Specialist input used
From `consult-frontend-developer.md`:
- Adopted rec 1: formatter in `copy.ts` taking `(lastWorn, days)`; named `lastWornLabel`.
- Adopted rec 2 and 3: card and editor both call it; editor prefixes "Lần cuối".
- Adopted rec 4: regression test in a separately named `describe("last worn label")` with fake `Date` and an
  explicit `lastWorn`; formatter unit tests at 0 / 1 / 365 / 366 / empty. The parity test is covered by the
  shared function plus the same-wording assertions on both sides at the same boundaries, not a combined render.
- Adopted rec 5: keep Editor hunks to lines 322-326 + the import, and keep tests away from the end of
  `Editor.test.tsx`.
- Adopted risks: keep the `item.lastWorn` guard (999 fallback); `App.test.tsx:249` checks only the duplicate card's
  `textContent`, so it is unaffected; the other `App.test.tsx` "hôm nay" matches use exact strings or role names
  ("Mặc hôm nay", "Đã ghi nhận mặc hôm nay"), which "Lần cuối hôm nay" does not collide with.
- Open question 1 resolved from the ticket's Expected text ("the same 'N ngày' / 'hơn 1 năm' rules"): fully
  unified; the editor drops "trước" ("Lần cuối 3 ngày").
- Open question 2: default taken; see Assumptions.

## Assumptions
- **Editor wording for N ≥ 1 days** becomes "Lần cuối N ngày" (no "trước"), per the ticket's Expected text. If Ming
  prefers "Lần cuối N ngày trước", it is a one-line change in `EDITOR_COPY.wear.lastWorn` only for that branch,
  but would break "one wording"; not doing it.
- **Editor never-worn text** stays "Chưa có lịch sử" (BUG-011 owns never-worn wording; ticket marks it out of
  scope). The literal moves to `EDITOR_COPY.wear.noHistory` because the same hunk is edited anyway (R6); the
  rendered text is unchanged.
- **Hotspot BUG-014** (`DONE`, unmerged, `origin/ticket/BUG-014`): edits `Editor.tsx` near line 330 (the "−1"
  button) and appends `describe("wear bar")` to the end of `Editor.test.tsx`. BUG-015 touches `Editor.tsx` lines
  16 and 322-326 only, and inserts its describe near line 68, so no textual conflict is expected. The BUG-014
  branch was not diffed during planning; whichever merges second rebases and re-runs checks. If BUG-014 adds a
  shared wear-bar render helper, BUG-015's tests may reuse it after rebase.
- **Hotspot BUG-011** (`MERGED`): its card change is already on `main`; `lastWornLabel` reuses
  `EDITOR_COPY.wear.neverWorn` exactly.
- A future `lastWorn` date clamps to 0 in `daysSince` and shows "hôm nay"; acceptable, unchanged.
- `Editor` renders with `isNew=false` and the existing `props()` (no `ai` prop, no `PhotoLoaderContext`), as the
  existing `describe("footer")` edit-mode tests already do; if not, wrap like `describe("photo loader")` does.

## Blocking questions
None

## Split proposal
None
