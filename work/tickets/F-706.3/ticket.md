# F-706.3: Owner-only shared AI key storage, replacement and test

| Field | Value |
|---|---|
| State | PLANNING |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | — |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-22 |
| Claimed by | claude@2026-11-22T13:10:00Z |
| PR | — |

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
- [ ] Non-owners get 403 on every key route, and no response ever contains the key or its hint for them.
- [ ] The owner can store, replace and test a key per provider; the test reports success or a provider error code without returning the key.
- [ ] The crypto `VERSION` is not bumped and existing v2 BYOK ciphertext still decrypts (test).
- [ ] No AI route reads the shared key yet (test or code-path check).
- [ ] The new table has RLS and is covered by the RLS tests.
- [ ] All checks pass (format, typecheck, test, build).

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

## Handoff
