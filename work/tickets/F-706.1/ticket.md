# F-706.1: Credit ledger with reserve, commit and refund

| Field | Value |
|---|---|
| State | MERGED |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 2 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/102 |

## Goal
Give every user an AI credit balance kept in a Postgres ledger, so paid AI calls can reserve credits, commit them on success and refund them on failure without ever overspending.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.1 "Ledger". Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- New migration: ledger tables with RLS in the same migration (D32), e.g. grants and operations; the balance is computed, never stored (R5 spirit).
- Server ledger module: `reserve(user, opKey, kind, credits)`, `commit`, `refund`, `balance`, using a per-user advisory lock inside `withUser`.
- Grants applied lazily on first AI use (no users table, D50): welcome +300 and monthly +60 for the UTC+7 month; grant amounts read from admin-adjustable settings (D53).
- Welcome grant rules (D53): existing accounts get 300 once; accounts that join later get a pending welcome grant that only counts after admin approval (approval route itself is F-706.5).
- Spend order: monthly credits first, then welcome/manual credits; monthly credits expire at the UTC+7 month boundary with no rollover; welcome and manual credits never expire.
- Update `server/rls.db.test.ts` for the new tables.

## Out of scope
- Spend cap and price table (F-706.2); shared key storage (F-706.3); wiring AI routes to the ledger (F-706.4).
- Admin routes and UI (F-706.5, F-706.6); user credit UI (F-706.7).

## Acceptance criteria
- [ ] Concurrent requests cannot overspend: with a balance for one action, N parallel requests produce exactly one reservation (DB test).
- [ ] The same idempotency key never reserves or charges twice for a user (DB test on the unique op key).
- [ ] A refund returns the reserved credits to the balance; a commit makes them spent.
- [ ] Monthly credits expire without rollover at the month boundary in UTC+7, and are spent before welcome and manual credits (unit/DB test with a fixed clock).
- [ ] An existing account receives the 300 welcome credits exactly once; a newly joined account's welcome credits do not count until approved; the owner gets and spends credits like anyone (D53).
- [ ] Every new table has RLS `ENABLE` + `FORCE` in the same migration and is covered by the RLS tests.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Suggested shape (advice, ai-stylist-notes.md:58-62): `credit_grants(user_id, bucket, period, amount)` unique on `(user_id, bucket, period)`; `credit_ops(id, user_id, op_key, kind, monthly_part, welcome_part, period, state, expires_at)` unique on `(user_id, op_key)`; `pg_advisory_xact_lock` per user (pattern in `server/photos.js:270-273`); stale `reserved` ops past `expires_at` (~10 min) are ignored, so no sweeper.
- Pool limits: 5 connections, 5 s statement timeout (`server/db.js:14,17`). Never hold a transaction across a provider call: reserve, call, settle as three short transactions.
- RLS: app-wide rows (grant settings) and admin reads across users do not fit `owner_only`; the plan must propose a narrow access path (feature list F-706 technical notes, ai-stylist-notes.md:65).
- Open for the planner: how "existing account" is defined without a users table (e.g. any `user_id` with rows before the cutover release), and where pending welcome approvals live. Flag to Ming if it needs a decision.
- Open for the planner: a read route for the caller's own balance is needed by F-706.7; decide whether it lands here or in F-706.4.
- Hotspot: `server/rls.db.test.ts:201,223-237` rejects any new table until updated (ai-stylist-notes.md:54); other F-706/F-707/F-708 tickets also add tables there.

## Test plan
- Unit/DB: concurrency (N parallel reserves), idempotent op key, refund, UTC+7 month boundary, spend order, welcome-once and pending approval, RLS.
- Manual: none.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-22 — Plan approved by Ming ("duyệt F-706.1"), with the plan's default assumptions A1–A12 (incl. A3 snapshot at the F-706.1 deploy, A4 amount fixed at creation for now, A5 monthly credits for new accounts immediately).

## Handoff

### 2026-11-22 — claude — BLOCKED
- Done: consults database-optimizer + software-architect; plan READY (migration with credit_settings/credit_grants/credit_ops + existing-account snapshot; server/ai/credits.js + creditMath.js, inert; RLS_TABLES per-table versions; DB tests incl. 8 parallel reserves).
- In progress / next: waiting for Ming's plan approval (M-43) incl. assumptions A1–A7; then implement.
- Gotchas: migrator.db.test.ts withExtra version must move to 29991231235959; hotspot with F-706.2/.3, F-707.3, F-708.1 (test lists, RLS_TABLES, migration version).

### 2026-11-22 — claude — DONE
- Done: migration 20261122120000_credit_ledger (credit_settings, credit_grants, credit_ops, existing-account snapshot); server/ai/credits.js + creditMath.js (inert); RLS_TABLES per-table versions. Attempt 1 REWORK (stray .vitest report; lock not proven by tests); attempt 2 PASS. Security PASS both attempts. The deleted report's blob (052b99b) holds only test names/statuses (checked).
- In progress / next: Ming merges the PR; then F-706.2 / F-706.3.
- Gotchas: migration version must stay newest on main (re-stamp if another migration lands first); F-706.5 should narrow user-side credit policies (security note 10); F-706.4 replay/expiry/timeouts.
