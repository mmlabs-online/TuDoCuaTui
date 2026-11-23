# BUG-014: "−1" wear button is enabled at 0 wears and still sends a request

| Field | Value |
|---|---|
| Type | bug |
| State | IN_PROGRESS |
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
| Claimed by | claude@2026-11-23T05:31:45Z |
| PR | — |

## Report
UAT of production v0.3.1 (2026-11-20, `work/uat/2026-11-20-uat-v0.3.1.md`, UAT-5). On a test item with
"Đã mặc 0 lần", "−1" was enabled. Each click sent a request to `/api/items/:id/wear` (seen in the resource timing) and
nothing changed. The count correctly never went below 0.

## Environment
- Production v0.3.1, Chrome desktop.

## Steps to reproduce
1. Open an item with "Đã mặc 0 lần".
2. Click "−1".

## Expected
- "−1" is disabled when the wear count is 0, and no request is sent.

## Actual
- Enabled; a no-op request is sent.

## Root cause
**Confirmed**: `src/features/items/Editor.tsx:328` renders `<Btn onClick={() => onWorn(-1)}>−1</Btn>` with no
`disabled` condition.

## Scope
- Disable "−1" when `item.wearCount === 0`.

## Out of scope
- The server-side wear endpoint.

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after
      (e.g. `Editor.test.tsx` › "−1 is disabled at 0 wears").
- [ ] The expected behaviour above holds.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/items/Editor.tsx`, its test. Hotspot: BUG-015 edits the same wear box.

## Notes / answers from Ming

## Handoff
- 2026-11-20 — claude — recorded from the v0.3.1 UAT; record branch `bug/BUG-010`, record PR opened by Ming (no `gh` on this device)
