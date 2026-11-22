# BUG-013: Cold weather suggests an off-shoulder party dress and heels with no warning

| Field | Value |
|---|---|
| Type | bug |
| State | MERGED |
| Severity | S3 |
| Priority | P2 |
| Size | S |
| Areas | ui, data |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | v0.3.0 (F-704.1, commit 1d53aee) |
| Depends on | BUG-012 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/105 |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-4). Weather
"Sa Pa · 9–12°C · Mưa 100%" → Bộ 1 = "Váy đi tiệc trễ vai xanh + Giày cao gót phom trơn 9p trắng + Áo cardigan voan
đen + Khăn choàng lụa nude", tagged "Trời lạnh" and "Có thể mưa". The wardrobe has 0 items tagged "Đông".

## Environment
- Production v0.3.1, Chrome desktop.

## Steps to reproduce
1. "Hôm nay mặc gì?" → Thời tiết = "Sa Pa" on a cold day.

## Expected
- When no item fits the wanted seasons, the modal says so (e.g. "Tủ đồ chưa có đồ cho trời lạnh — gợi ý có thể
  chưa phù hợp"). Items not tagged "Hạ" rank before summer items when it is cold.

## Actual
- Summer/party items are suggested as if they fit, with no note.

## Root cause
**Confirmed**: `src/features/outfits/suggest.ts:111-114` — when no item of a role fits, the pool silently falls back to
every item of that role (`pools[role] = fit.length ? fit : all`). The rain flag only adds a tag.

## Scope
- Return a "no fitting items" flag per suggestion and show the note; in cold weather, prefer items without "Hạ" in the
  fallback pool.

## Out of scope
- Rain-specific rules (e.g. avoiding suede or heels) and AI-ranked suggestions.

## Acceptance criteria
- [x] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `suggest.test.ts` › "cold weather with no Đông items flags the fallback").
- [x] The expected behaviour above holds.
- [x] All checks pass.

## Technical notes
- Files: `src/features/outfits/suggest.ts`, `copy.ts`, the suggestion modal.
- Depends on BUG-012 because both change the `Suggestion` shape and the modal heading area.

## Notes / answers from Ming

## Handoff

### 2026-11-22 — claude — DONE
- Done: Suggestion.fallback added; fallback note displayed in modal when wardrobe lacks matching season/weather clothes; non-summer items prioritized over summer items in cold weather fallback; tests in suggest.test.ts, OutfitsModal.test.tsx, copy.test.ts; all checks PASS (attempt 1).
- In progress / next: open PR, Ming merges; unblocks F-707.1.

### 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)
