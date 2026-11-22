# F-706.3: Owner-only shared AI key storage, replacement and test

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-22 |
| Claimed by | — |
| PR | https://github.com/mmlabs-online/TuDoCuaTui/pull/106 |

## Goal
Let the owner store, replace and test one shared AI key per provider on the server, ready for the cutover but not yet used by any AI route.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.3 "Shared key"; OQ-10 (one key per provider, D52). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- New storage for app keys (one per provider) with its own encryption functions and AAD; migration with RLS in the same file.
- Owner-only routes to set, replace, test and remove the shared key; responses show at most a hint to the owner.
- The key stays inactive: no AI route reads it until F-706.4.

## Out of scope
- Switching AI routes to the shared key (F-706.4); admin screen (F-706.6).
- Deleting BYOK ciphertext (F-706.8). An OpenAI image adapter (F-708.2).

## Acceptance criteria
- [x] Non-owners get 403 on every key route, and no response ever contains the key or its hint for them.
- [x] The owner can store, replace and test a key per provider; the test reports success or a provider error code without returning the key.
- [x] The crypto `VERSION` is not bumped and existing v2 BYOK ciphertext still decrypts (test).
- [x] No AI route reads the shared key yet (test or code-path check).
- [x] The new table has RLS and is covered by the RLS tests.
- [x] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- Do not bump the crypto `VERSION`, because legacy v2 ciphertext becomes unreadable (`server/ai/crypto.js:9,76`); use separate app-key functions with distinct AAD (ai-stylist-notes.md:73, D52).
- `ai_settings.provider` allows only `claude` and `gemini`, so OpenAI belongs in the new table; keep image models out of `AI_MODELS` (ai-stylist-notes.md:74).
- Owner = `TUDO_OWNER_SUB` (D38, D50); the server enforces it.
- Never log or echo the key (R3 spirit; server secrets only).

## Test plan
- Unit/DB: owner vs non-owner on each route, no key/hint in non-owner responses, v2 ciphertext still readable, RLS.
- Manual: none (Ming tests the real key via F-706.6).

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-22 — Plan approved by Ming ("duyệt"), with assumptions A1–A4 (providers claude/gemini/openai, model list checks, /api/admin/ai-keys path, app-v1 crypto format).

## Handoff

### 2026-11-22 — claude — DONE
- Done: F-706.3 implemented and verified. Migration `20261122160000_ai_app_keys.sql`, `withAppKeys` in `server/db.js`, `sealAppKey`/`openAppKey` in `server/ai/crypto.js`, pure OpenAI key checker in `server/ai/openai.js`, app key store in `server/ai/appKeys.js`, owner-only admin routes `/api/admin/ai-keys*` in `server/ai/adminRoutes.js`. All 8 test files (109 tests) green against Postgres 17. PR #106 opened.
- In progress / next: Ming merges PR #106.

### 2026-11-22 — claude — plan approved
- Done: M-46 plan approved by Ming.
- In progress / next: start implementation (migration 20261122160000_ai_app_keys, server/ai/appKeys.js, admin routes, DB tests).

### 2026-11-22 — claude — BLOCKED
- Done: consults database-optimizer + software-architect; plan READY (ai_app_keys with maintenance session RLS on tudo.maintenance='app-keys', withAppKeys helper, sealAppKey/openAppKey with app-v1 format, checkOpenAiKey, owner-only /api/admin/ai-keys routes).
- In progress / next: waiting for Ming's plan approval (M-46, assumptions A1–A4); implementation starts after approval.
