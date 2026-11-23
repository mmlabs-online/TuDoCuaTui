# BUG-015: Last-worn label says "0 ngày trước" in the editor but "hôm nay" on the card

| Field | Value |
|---|---|
| Type | bug |
| State | MERGED |
| Severity | S3 |
| Priority | P2 |
| Size | XS |
| Areas | ui |
| Gate | none |
| Found in | v0.3.1 (production) |
| Introduced in | unknown |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-20 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/108 |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-6). After "Mặc hôm nay", the editor
showed "Đã mặc 1 lần · Lần cuối 0 ngày trước" while the card showed "👕 1× · hôm nay".

## Environment
- Production v0.3.1, Chrome desktop.

## Steps to reproduce
1. Open an item and click "Mặc hôm nay".

## Expected
- One wording in both places: "hôm nay" for 0 days (and the same "N ngày" / "hơn 1 năm" rules).

## Actual
- Editor: "Lần cuối 0 ngày trước". Card: "hôm nay".

## Root cause
**Confirmed**: `src/features/items/Editor.tsx:322` builds `Lần cuối ${ageInDays(item.lastWorn)} ngày trước` itself,
while `src/features/items/ItemCard.tsx:39` has its own rule. The two do not share a formatter.

## Scope
- One shared last-worn formatter (in the items copy/constants, R6) used by both the card and the editor.

## Out of scope
- The never-worn wording (BUG-011 decides it; reuse it here once merged).

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `Editor.test.tsx` › "worn today shows Lần cuối hôm nay").
- [ ] The expected behaviour above holds.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/items/Editor.tsx`, `ItemCard.tsx`, `src/features/items/copy.ts`.
- Hotspot: BUG-011 (card pill) and BUG-014 (wear box).

## Notes / answers from Ming

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)

### 2026-11-23 — claude — DONE
- Done: consult (frontend-developer), plan, implement (attempt 1): shared `lastWornLabel` in copy.ts used by card and editor; regression test failed on main before the fix; reviewer PASS. Branch `ticket/BUG-015` pushed.
- In progress / next: no GitHub CLI or MCP on this machine; Ming opens the PR from `ticket/BUG-015` with the body in `work/tickets/BUG-015/pr.md`, then the PR URL goes into this ticket.
- Gotchas: editor wording drops "trước" (copy call for Ming); no textual conflict with BUG-014, but re-run checks on whichever merges second.
