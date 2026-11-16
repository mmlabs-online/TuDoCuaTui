## Attempt 1 — 2026-11-16

### Files touched
| File | Required because |
|---|---|
| server/http.js | line 12: connect-src gains `blob:` `data:` (the fix) |
| server/static.test.ts | exact-CSP expectation updated; script-src guard added |
| server/README.md | one sentence on connect-src blob:/data: |

### Tests added / changed
- server/static.test.ts › "CSP directives are exact" (updated)
- server/static.test.ts › "CSP has no unsafe sources and keeps Turnstile out of connect-src" (script-src not data:/blob:)

### Checks (actual output summary)
- typecheck: exit 0
- format:check: exit 0
- test: 97 files passed, 10 skipped; 1247 tests passed, 205 skipped
- build: ok (102 modules transformed)

### Out-of-plan files
None

### Follow-ups (noticed, not done)
- Browser regression check (plan) is the reviewer's step; not run here.

### Scope self-check
- Could the diff be smaller? no
- Diff size: about +5 / -2 lines
