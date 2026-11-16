# BUG-xxx: <short description of the wrong behaviour>

| Field | Value |
|---|---|
| Type | bug |
| State | BACKLOG |
| Severity | S1 / S2 / S3 |
| Priority | P0 |
| Size | XS |
| Milestone | M1 |
| Epic | E? — <name> |
| Areas | <ui, data, db, security, architecture> |
| Gate | none |
| Found in | v0.x.y (production / local / Figma Make preview) |
| Introduced in | v0.x.y (<ticket or commit>) / unknown |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | YYYY-MM-DD |
| Claimed by | — |
| PR | — |

## Report
<What Ming saw, in Ming's words (quote), date. Screenshot: describe it; do not commit images that show emails or personal data.>

## Environment
- Mode: API (identity) / local / preview · Browser and device · Light/dark · Viewport

## Steps to reproduce
1. …

## Expected
- …

## Actual
- …

## Root cause
<file:line and why, once known; "unknown — planner investigates" otherwise. Mark it **confirmed** (reproduced) or **suspected**.>

## Scope
- Fix the cause above; nothing else (R7).

## Out of scope
- …

## Acceptance criteria
- [ ] A regression test reproduces the bug: it fails on `main` before the fix and passes after (name the test).
- [ ] The expected behaviour above holds (light/dark, 390px when it is UI).
- [ ] All checks pass.

## Technical notes
- Files: …
- Test level: unit (jsdom) where it can reproduce the bug. CSS, CSP and real browser APIs are invisible to jsdom: add a one-off Playwright check (outside the repo, result recorded in impl-log) until Playwright is a repo dependency (D42).

## Notes / answers from Ming

## Handoff
