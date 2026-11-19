# BUG-009: Editor test "a result for a replaced photo is ignored" fails intermittently

| Field | Value |
|---|---|
| Type | bug |
| State | PLANNING |
| Severity | S3 |
| Priority | P2 |
| Size | XS |
| Areas | architecture |
| Gate | none |
| Found in | main (F-704.5 review run, 2026-11-19) |
| Introduced in | unknown |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-19 |
| Claimed by | claude@2026-11-19T17:14:10Z |
| PR | — |

## Report
F-704.5 reviewer: one full `pnpm test` run failed `src/features/items/Editor.test.tsx` › "AI fill › a result for a replaced photo is ignored"; it passed in 3 isolated runs and the next 2 full runs. That PR did not touch the file.

## Environment
- Local full Vitest run (jsdom); not yet seen on CI.

## Steps to reproduce
1. Run `pnpm test` repeatedly (or the file under CPU load).

## Expected
- The test passes deterministically.

## Actual
- Occasional failure under a full run.

## Root cause
**Suspected:** timing in the test at `src/features/items/Editor.test.tsx:632` (a real-timer wait or an unflushed promise between replacing the photo and the late AI result). The planner investigates.

## Scope
- Make the test (or, if it is a real race, the code) deterministic; nothing else. Never skip or loosen the assertion.

## Out of scope
- Other flaky tests unless the same cause.

## Acceptance criteria
- [ ] The root cause is identified and recorded (test timing vs product race).
- [ ] The test passes 50 consecutive runs of the file and under a CPU-throttled run (evidence in impl-log).
- [ ] If it is a product race, a regression test fails before the fix.
- [ ] All checks pass.

## Technical notes
- Files: `src/features/items/Editor.test.tsx` (maybe `Editor.tsx`).
- Test level: Vitest; see BUG-006 for the earlier timeout fix.

## Notes / answers from Ming

## Handoff
