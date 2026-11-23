## Attempt 1 — 2026-11-23
Verdict: PASS

### Checks (run by reviewer)
Run in WSL Ubuntu 24.04 (rsynced working tree of `ticket/F-706.5` at `97c3a6d`), throwaway Postgres 17 on 127.0.0.1:55432, `TEST_DATABASE_URL` set.
- format — `pnpm format:check`: PASS ("All matched files use the correct format", 366 files).
- typecheck — `pnpm typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json`): PASS.
- test — `pnpm test`: PASS, 166 files, 2358 tests (baseline 2317, +41). Matches impl-log. DB suites ran, none skipped: `server/rls.db.test.ts` (26), `server/ai/credits.db.test.ts` (23), `server/ai/creditAdmin.db.test.ts` (10), `server/migrator.db.test.ts` (39). The earlier timeouts mentioned in impl-log did not happen in this run.
- build — `pnpm build`: PASS (vite build, 128 modules).

### Acceptance criteria
- [x] Non-owners get 403 on every admin route — evidence: prefix check `server/api.js:132-136` (before `match()`) plus the second-layer check in `server/ai/adminCreditRoutes.js` (`isOwner` at handler start); test `adminCreditRoutes.test.ts` › "admin credit routes: non-owner › gets 403 forbidden on every admin route x every method, including unknown paths and wrong methods" (covers the six new routes, `/api/admin`, `/api/admin/x` and `/api/admin/ai-keys*`, with zero fake calls) — PASS.
- [x] The owner can change the welcome and monthly grant amounts, and later grants use the new amounts — evidence: `adminCreditRoutes.test.ts` › "GET and PUT settings"; `creditAdmin.db.test.ts` › "updateSettings then getSettings returns the new values and a later updated_at" and › "after updateSettings(500, 100) a new user's first balance() has monthly 100 and a pending welcome row of 500; an existing user's grants are unchanged" — PASS.
- [x] The owner can add credits to a user; manual credits never expire (D53) — evidence: `creditAdmin.db.test.ts` › "addManual raises balance().lasting and the credits still count in the next UTC+7 month and across the boundary", › "a replay with the same key and amount adds nothing; another amount is grant_key_mismatch; the same key for another user is created", › "addManual for a user with no credit_grants row is unknown_user and writes nothing"; route test › "POST manual grant: 201, replay 200, 409, 404 unknown_user, 400". `credits.js` balance SQL counts `bucket = 'manual'` in `lasting` without a period filter — PASS.
- [x] The owner can list pending accounts and approve one; the approved account's 300 credits then count — evidence: `creditAdmin.db.test.ts` › "listPending returns only unapproved welcome rows, oldest first, capped by limit", › "approveWelcome raises balance().lasting by 300 and welcome 'approved'; the stored amount is kept after a settings change", › "a second approve is already_approved, an unknown user is not_found, and approve never inserts a welcome row", › "a reserve that returned welcome_pending returns reserved after approveWelcome"; route test › "POST approve: 200 approved and already_approved, 404 not_found, 400 bad id" — PASS.
- [x] The owner can read the current month's spend against the $20 cap — evidence: route test › "GET spend returns spendMeter.status() verbatim"; `creditAdmin.db.test.ts` › "GET /api/admin/spend shows a reserved estimate against capMicroUsd 20000000" (real pool through `createApp`) — PASS.
- [x] All checks pass — see Checks above.

Ming verification after merge (not verified here, carry into the PR):
- Applying `db/migrations/20261123120000_credit_admin.sql` to production is Ming's step; confirm the migrate log shows it applied after deploy.
- Optional smoke: `GET /api/admin/spend` and `GET /api/admin/credits/pending` answer 200 with an owner token and 403 with a non-owner token.

### Scope
- Every changed product/test file is in plan.md's file table, except `server/ai/spend.test.ts`, which is justified under impl-log "Out-of-plan files": the plan's `app.js` default `createSpendMeter(pool)` makes `app.js` the one importer of `spend.js`, so the F-706.2 inertness assertion had to change to `["app.js"]`. The other two inertness assertions in that test are unchanged. Accepted.
- `server/me.test.ts` is listed under plan "Tests to write" (isOwner). `work/ming-todo.md` (M-49 ticked) and `ticket.md` are workflow bookkeeping.
- `server/ai/adminRoutes.test.ts` was left untouched, as the plan allowed.
- All High paths changed (`db/migrations/**`, `server/**`) are named in the plan, which Ming approved (M-49, A1–A12).
- Migration stamp `20261123120000` is still newer than the newest file on `origin/main` (`20261122160000_ai_app_keys.sql`); `origin/main` has no commits missing from the branch.

### Code review notes
- Migration: the user-side policies match every statement in `credits.js` (grants insert/select, where inserts are monthly-approved or welcome-pending with no `grant_key`; ops insert/select/update). The full `credits.db.test.ts` passing proves this. The admin policies are limited to read, pending→approved update, manual insert (key required, `period is null`) and settings update. There is no delete and no `credit_ops` access. The guard trigger blocks every other column change for all roles, which matches A4.
- `withCreditAdmin` follows the `withAppKeys` shape. `withUser` resets `tudo.maintenance`, so a user transaction cannot carry `credit-admin`. The isolation test also covers photo-sweep, spend meter and app keys.
- Approve and manual add take `lockCreditUser` (byte-identical expression moved out of `credits.js`) as their first statement, which serialises them with reserve. Manual add is idempotent through the partial unique index and `on conflict ... do nothing`, and a key reused with a different amount returns 409.
- Route matching uses `parts[5]`/`parts[6]` for the 7-part paths, which is correct for the `["", "api", "admin", "credits", ...]` split. The plan text's `parts[4]/parts[5]` was an index slip in the plan, not in the code. Admin dispatch comes before the generic `parts[3]` UUID check.
- Logs carry only `{event, id, action, code}`, and the logging test covers this. No user ids, amounts or keys are logged.

### Issues
None.

### Rules (CLAUDE.md)
No violations found. R1/R3/R6/R9: no client change. R2 (Node-schema equivalent): new migration file, policies in the same file, no applied migration edited, not applied by the agent. R5: balances stay computed. R7: diff stays inside the plan (one justified test-assertion change). R8: pure parsers in `adminValidate.js` with unit tests; module, DB and RLS tests for the new access path.

### Blockers from review agents
None. `security-review.md` attempt 1 has no 🔴 findings. Its 🟡 1 (user insert policy does not bind `amount`/`period`; not exploitable today because `credits.js` is the only writer and takes amounts from `credit_settings`) and 💭 2 (`credit_ops` user update has no column guard) are follow-ups, filed as workspace `debt` issues.

### Nits (do not block)
- `server/README.md` intro says that without `DATABASE_URL` every endpoint "validates its input, then answers 503". The admin credit routes answer 503 for the owner before reading the body. Behaviour is fine and tested; a short note on the admin rows would make the doc exact.
- `adminValidate.js` `parseUserIdParam`: the `toUserId` call is only needed for the nil-UUID check (impl-log already notes this). A comment saying so would help.
- `addManual`: if the conflict branch ever found no row, `row.amount` would throw and map to 503. This can't happen under the lock, so it is acceptable as written.

### Follow-ups (out of scope)
- F-706.6 copy: a monthly-amount change applies only to users with no monthly grant yet for the month (A10), and a welcome-amount change does not alter pending rows (A1). This was already listed in impl-log.
