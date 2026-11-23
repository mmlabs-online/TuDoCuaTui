## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
- `pnpm format:check` — All matched files use the correct format.
- `pnpm typecheck` — pass (`tsc --noEmit && tsc -p tsconfig.server.json`, no errors).
- `pnpm test` — Tests 7 failed | 1998 passed | 288 skipped (2293); Test Files 5 failed | 139 passed | 14 skipped. The 7 failures are the known pre-existing Windows failures on main (server/ai/tagPhoto.test.ts x3, server/api.test.ts, server/index.cli.test.ts, server/scoping.test.ts, src/features/auth/boundary.test.ts), confirmed in the BUG-008 and T-029 reviews; this diff touches none of those areas. `pnpm vitest run src/data/authFetch.test.ts src/data/repo.http.test.ts` — 2 files, 59 tests passed. Matches impl-log exactly.
- `pnpm build` — built, no errors.

### Acceptance criteria
- [x] Ming's decision is recorded in `work/decisions.md` — evidence: new row D55 (work/decisions.md:64), dated 2026-11-23, states 403 (e.g. `forbidden_origin`) returns `ApiError(403, code)`, no refresh retry, no `onAuthLost`; amends the T-028.1 wording; source "Ming 2026-11-23: option (a), 'duyệt tất cả'"; applies to T-030, T-028.1. Matches ticket Notes from Ming.
- [x] Tests cover a 403 per that decision; 401 and 503 unchanged — evidence: `authFetch.test.ts › 403 is passed through: no retry, no onAuthLost` and `› 401 then 403 on the retry -> 403 returned, no onAuthLost`, `repo.http.test.ts › identity mode (getToken) › 403 forbidden_origin → ApiError(403, forbidden_origin); no onAuthLost` all pass. `git diff origin/main...HEAD` on both test files shows additions only; existing 401/503 tests are unmodified and pass.
- [x] All checks pass — evidence: above (failures only the known pre-existing Windows set).
- [x] Extra (plan, "document it"): `src/data/authFetch.ts:8-9` and `:17-19` doc comments updated; diff of authFetch.ts is comment-only. Runtime code at authFetch.ts:46-51 (`if (res.status !== 401) return res;` … `onAuthLost` only after a second 401) matches D55.

### Issues
None.

### Scope
Changed files: `src/data/authFetch.ts`, `src/data/authFetch.test.ts`, `src/data/repo.http.test.ts`, `work/decisions.md`, plus ticket files. All are in the plan's file list. No High path touched.

### Rules (CLAUDE.md)
No violations found. R1: no new data access; R7: only planned files; R8: behaviour pinned by unit tests; R3: test tokens are literal placeholders.

### Blockers from review agents
None. `security-review.md` attempt 1 is PASS with only 🟢 findings.

### Nits (do not block)
- `src/data/authFetch.ts:18` is 135 characters; oxfmt does not rewrap comments. Could be rewrapped to match the surrounding ~120-column comment style.

### Follow-ups (out of scope)
- None.
