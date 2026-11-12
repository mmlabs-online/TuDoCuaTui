# T-018: Store AI provider settings and an encrypted API key on the Node server

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | T-009, T-013.2, T-015 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-12 |
| Claimed by | claude@2026-11-12T12:39:09Z |
| PR | — |

## Goal
The Node server keeps the AI provider, the model and an encrypted API key for the app's single user. The Settings
screen (T-010) and photo tagging (F-701) can use them in API mode, and the key itself never reaches the browser.

## Feature reference
- Port of T-009, which exists only as never-deployed Supabase code, to the self-hosted backend (D23, D25, D26).
- Comes from the T-010 re-plan (`work/tickets/T-010/plan.md`, branch `ticket/T-010`, questions Q1–Q3).
- Ming answered "ok" on 2026-11-12, accepting all three defaults:
  - Q1: this ticket comes first.
  - Q2: D21 "Supabase mode only" becomes "API mode only".
  - Q3: the key is entered in Settings and stored encrypted in Postgres, with a new `TUDOCUATUI_AI_KEK` deployment
    secret.
- Feature list: E7 AI (the backend part of the Settings / provider choice behind F-701 and F-702).

## Scope
- A new migration in `db/migrations/`, following D25:
  - A single-row table for provider, model, the encrypted key and its masked hint.
  - No RLS, because there is one user and no in-app login.
- Key encryption with AES-256-GCM, using the KEK from the server-only env `TUDOCUATUI_AI_KEK`. If the KEK is missing,
  the endpoints answer with a clear error code and the rest of `/api` keeps working.
- Endpoints in `server/api.js`, behind the same protection as the rest of `/api`:
  - `GET /api/ai-settings` returns the masked view only, never the key.
  - `PUT /api/ai-settings` sets provider, model and an optional key.
  - `DELETE /api/ai-settings/key` removes the key.
  - `POST /api/ai-settings/test` makes one small call to the provider with the stored key and returns a mapped
    error code.
- Reuse `src/shared/ai/{catalog,errors,validate,mask}.ts`. Port `crypto`, `providerErrors` and the Claude adapter
  (with the pinned baseURL, per the T-009 review) from `supabase/functions/_shared`.
- Record D30 in `work/decisions.md`, amending D21 to "API mode only" (Q2). Update the notes of T-010, F-701 and F-702.
- Add a new Ming item: generate the KEK, back it up in Bitwarden (personal collection), and add it as a repository
  secret in `mmlabs-online/deployment`, the same pattern as D28. Wire it into the deploy config.

## Out of scope
- The Settings UI (T-010).
- The tagging endpoint (F-701) and autofill (F-702).
- Removing the Supabase T-009 code (T-016).
- Gemini models: the catalog list is empty today.

## Acceptance criteria
- [ ] The API key is stored only encrypted. No endpoint, log line or error body ever contains the key, and tests use a
      sentinel value to prove it.
- [ ] `GET` returns provider, model and masked hint only. `PUT` rejects invalid provider/model combinations through
      the shared `validate` rule.
- [ ] `POST /api/ai-settings/test` maps provider failures to `AiErrorCode` values (invalid key, network, …). Unit tests
      cover it with a fake fetch.
- [ ] With `TUDOCUATUI_AI_KEK` unset, the AI endpoints return a defined error, and items, photos and the rest of the
      API still work.
- [ ] Local mode is unchanged (R1). Checks are green, including the migration runner test.

## Technical notes
- Files:
  - `db/migrations/<ts>_ai_settings.sql`
  - `server/api.js` and a new `server/ai/*`
  - `src/shared/ai/*` (reused)
  - the deploy config for the new env var
  - `work/decisions.md` and `work/ming-todo.md`
- Risks:
  - Losing the KEK makes the stored key unreadable. The fix is to re-enter the key.
  - KEK rotation is not in scope.
  - T-016 touches the Supabase copies of this code. Whichever lands second rebases.

## Test plan
- Unit: crypto round trip and tamper detection; endpoints with a fake DB and a fake fetch; the key sentinel never
  leaves the server.
- Manual (Ming, after merge): add the KEK secret and deploy. Save a Claude key once T-010 lands, or with `curl`
  behind Cloudflare Access.

## Notes / answers from Ming
- 2026-11-12: Plan approved, split in two (Ming, in chat with Annie: "Plan approved (T-018), chia 2"; recorded by Annie). This ticket implements slice T-018.1; T-018.2 is a separate ticket. Assumptions A1–A12 accepted as defaults.
- 2026-11-12 (chat with Annie): "ok" to T-010 plan questions Q1–Q3 (defaults).

## Handoff

### 2026-11-12 — claude — BLOCKED
- Done: consults (software-architect, database-optimizer) saved; plan.md READY: proposes split T-018.1 (migration, server/ai JS port + parity test, GET/PUT/DELETE, KEK loading) and T-018.2 (POST /test with Claude, deploy drafts, M-16); changes C1–C14, assumptions A1–A12.
- In progress / next: Ming approves the plan and the split; then create T-018.2 and run T-018.1.
- Gotchas: server image has no src/, so src/shared/ai is ported to server/ai/*.js with a parity test; hotspots with T-016 (boundary.test.ts, errors.ts header, vitest.config.ts).
