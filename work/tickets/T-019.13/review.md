## Attempt 1 — 2026-11-15
Verdict: PASS

Reviewed branch `claude/magical-cori-2ssw8l` at commit 7a8e8f9 (`git diff origin/main...HEAD`, 21 files, +438/-48).

### Checks (run by reviewer)
- typecheck: pass (`tsc --noEmit && tsc -p tsconfig.server.json`, exit 0)
- format:check: pass ("All matched files use the correct format.", 236 files)
- test: pass. `pnpm test` without a DB: Test Files 88 passed | 8 skipped (96); Tests 1111 passed | 168 skipped (1279). These match impl-log exactly.
- test with Postgres: the reviewer started a throwaway PostgreSQL 16 cluster (`initdb --auth=trust` as user `postgres`, port 55432) and ran with `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres`:
  - `isolation.db.test.ts` + `api.db.test.ts` + `rls.db.test.ts`: 3 files passed, 75 tests passed.
  - The new test "owner photo PUT succeeds while B and C hold every non-owner slot" passed when run on its own (`-t "owner photo"`).
  - The full `pnpm test` with the DB: 95 files passed, 1278 tests passed, 1 failed. The failure is `migrate.cli.test.ts` › "exit 1 on wrong password". It comes from the reviewer's trust-auth cluster, where any password is accepted. It is environmental and does not involve this diff.
  - The cluster was stopped and deleted afterwards. The first attempt used the scratchpad, but the harness reset `/tmp/claude-0` to mode 700 and the server PANICked. The rerun used a `mktemp -d /tmp/tudo-review-pg.*` directory, which has been removed.
- build: pass (`vite build`, built in 325ms)
- `bash -n scripts/check-image.sh`: ok. Docker was not run, so the CI image job remains the evidence for the new `expect_exit 2` and the identity smoke owner.

### Acceptance criteria
- [x] AC1: N cooperating accounts cannot make the owner's AI calls or photo uploads fail. Evidence:
  - AI ceilings: `server/ai/rateLimit.test.ts` › "owner lane" covers all three kinds (test, save, tag):
    - another user is false at the ceiling while the owner is true;
    - owner calls are not counted toward the ceiling;
    - the owner is false at its own per-user limit and the window frees it;
    - with `ownerSub` unset there is no lane.
    - Code: `server/ai/rateLimit.js:66-72`. Owner calls skip the global check and the `global[kind].push`. The per-user check is unchanged.
  - Slots: `server/inflight.test.ts` › "createInFlight exempt user" (3 tests). Code: `server/inflight.js:16-24`. Exemption is captured per acquisition (`free`), so release is symmetric and idempotent.
  - Over HTTP:
    - `server/ai/tagPhoto.test.ts` › "owner tag-photo is accepted while two other users hold both shared slots" passed (200; B again gives 503 `ai_busy`).
    - `server/isolation.db.test.ts:282` passed on real Postgres (owner PUT 200; B's third PUT 503 `photos_unavailable`).
  - Config:
    - `server/auth.test.ts`: identity mode with a missing or blank owner gives "must be set"; malformed or nil gives "must be a valid UUID" and the value is not in the message; `ownerSubOf` returns the canonical id.
    - `server/index.cli.test.ts`: identity with a blank or malformed owner exits 2 and `SECRETISH` is never printed; production identity with an owner starts.
- [x] AC2: slow uploads cannot hold every upload / tag slot for the full deadline. Evidence:
  - `server/photos.test.ts` › "readBody timeouts": idle gives 408 in under 150 ms; a drip-feed is cut at the total deadline with 408; a steady upload succeeds with its bytes intact.
  - `server/api.test.ts` › "two slow photo PUTs by one user -> 408 at the idle timeout and both slots are free again": the third PUT is 408, not 503.
  - `server/ai/tagPhoto.test.ts` › "slow tag-photo body -> 408 at idle, slot released": the next call returns 200.
  - Defaults are `BODY_TIMEOUTS = { totalMs: 15_000, idleMs: 5_000 }` (`server/photos.js`), which are Ming's numbers.
- [x] AC3: all checks pass (see above). `check-image.sh` is only syntax-checked locally; CI's image job runs it.

Ming verification after merge (carry into the PR):
- At M-21, the release compose must set `TUDO_OWNER_SUB`. Identity mode now exits 2 without it. Confirm the `auth: identity` log line.
- Optional: upload a photo from a phone on mobile data. If you see "Tải ảnh quá lâu, thử lại nhé", report it; the fix is to raise the constant.

### Specific checks requested
- **The owner lane cannot be gained by a non-owner.**
  - `ownerSub` comes only from config: `toUserId` at `server/auth.js:35`, or `access.ownerSub` in access mode. It is never read from the request.
  - Identity auth accepts a token only when `toUserId(sub) === sub` (`server/identity.js:121-122`), so every request `userId` is already a canonical lowercase UUID.
  - The comparisons are exact `===` between two canonical strings (`rateLimit.js:66`, `inflight.js:16`). A case or whitespace variant of the owner's sub is rejected as `sub_invalid` before it can match.
  - The null guard prevents an "unset owner" match.
- **The owner is still bound by per-user limits.** The AI limit is checked unconditionally (`rateLimit.js:67`) and tested. Slots keep `perUser` (`inflight.js:17`) and this is tested.
- **The owner is not counted in the global windows or totals.** `if (!owner) global[kind].push(t)` and `if (!free) all++/all--`. Both are tested ("owner calls are not counted", "release … leaves total unchanged").
- **The slot is released on every path.**
  - Photo: `release` is acquired with no await before it. `putPhoto` starts `readBody` immediately, and `finally { release?.() }` covers timeout (408 via `rejectUnread`), idle, client abort (`close` resolves `bad`), DB error (catch) and success.
  - Tag-photo: `finally { release() }` covers every return and throw after acquisition.
  - The timeout tests prove the release after 408.
- **The idle timer resets per chunk and is cleared.** It is re-armed on each `data` event (`photos.js:55-57`), and both timers are cleared in `finish`. See nit 1 for a harmless re-arm after `finish`.
- **The 408 path does not hang.** `rejectUnread` replies with `Connection: close` and destroys the socket on `finish`. The tests read the full 408 and then see the socket close (`slowPost` resolves on `close`), so no half-read socket is left hanging.
- **`TUDO_OWNER_SUB` messages never carry the value.** Both messages are fixed strings. The CLI test asserts the value is absent from stdout and stderr. The issuer errors keep their precedence because `loadIdentityConfig` runs first.
- **The `bodyTimeouts` optional typedef deviation is acceptable.**
  - `AiContext.bodyTimeouts?` (`server/ai/routes.js:21`) is optional so that the existing `routes.test.ts` contexts stay valid.
  - `readBody(req, undefined)` falls back to the default parameter `BODY_TIMEOUTS`, so an omitted value means production defaults, never `setTimeout(undefined)`.
  - `createApp` always sets the value.
  - The plan allowed "add `bodyTimeouts` if carried in the AI context", and impl-log justifies it. This is not a blocker.

### Scope
Every changed code, test and doc file is in the plan's file list. `ticket.md` changed only in its State line (orchestration). `server/app.test.ts` was conditional in the plan and needed no change. `compose.yml` and `src/` were not touched, as the plan specifies. No unjustified out-of-plan change.

### Issues
None.

### Rules R1–R10 (CLAUDE.md)
No violations found.
- R1: server-only; local mode and the SPA are untouched.
- R2: no migration.
- R3: `TUDO_OWNER_SUB` is not secret and not `VITE_*`.
- R4: photo paths are unchanged.
- R5: not affected.
- R6: no new UI copy; `request_timeout`, `ai_busy` and `photos_unavailable` copy already exists.
- R7: within the plan.
- R8: new logic has unit tests, and the HTTP tests ran green, including on real Postgres.
- R9: no UI.
- R10: no Figma Make files.

### Nits (do not block)
1. `server/photos.js:55`: the `data` handler has no `if (done) return;`. A chunk that arrives after `finish` re-arms the idle timer, leaving a harmless ref'd 5 s timer, and is pushed to `chunks`. In practice `req.pause()` prevents this.
2. `server/isolation.db.test.ts:282`: "B's third → 503" proves B's per-user cap, not that the shared total is full. A fourth user (D → 503 `photos_unavailable`) would prove the total is exhausted. The same applies to the tag-photo owner test.
3. The plan wrote "exempt user still limited by perUser", "owner passes when N other users…". The test names differ slightly from the plan's names, but the coverage is equivalent.

### Follow-ups (out of scope)
- Consult R8 items remain open: an in-flight cap on photo GETs (the main residual for Drive quota exhaustion, plan A4), Node `headersTimeout`/`requestTimeout`, and Drive `appProperties.userId`.
- T-019.14 per-user photo quotas, and the T-019.10 privacy notice, both before M-22.
- Local DB-suite runs: `migrate.cli.test.ts` "wrong password" needs a password-auth cluster. A note in the test helper or README would save the next person time.
