# T-018.2: AI key test endpoint and the AI_KEK deploy wiring

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P1 |
| Size | M |
| Milestone | M3 |
| Epic | E7 — AI |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | T-018 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-12 |
| Claimed by | — |
| PR | — |

## Goal
Ming can check that the saved AI key works (`POST /api/ai-settings/test`), and the deploy delivers the KEK to the
server, so AI settings work on the real app.

## Feature reference
- **D33 (2026-11-13)** amends D30: `ai_settings` becomes per-user (BYOK, AAD v2 bound to the `sub`) in T-019.3. The single-row shape used here is temporary; this slice keeps seams (`getSecret()`, `openStoredKey()`) so T-019.3 changes about three call sites (consult R2, R8).
- Second slice of T-018 ("Store AI provider settings and an encrypted API key on the Node server"). Its plan
  (`work/tickets/T-018/plan.md`, section *Split proposal*) outlines this slice, and Ming approved it on 2026-11-12:
  "Plan approved (T-018), chia 2".
- Covers T-018's ticket acceptance criterion 3, which moved here.
- Decisions: D21 as amended by D30 (written in T-018.1), D25, D26, D28.

## Scope
- `POST /api/ai-settings/test`:
  - It reads the stored key with `store.getSecret()`. If the key cannot be decrypted, it returns 409
    `key_unreadable`. If there is no key, it returns 409 `not_configured`. An unsupported model returns 400
    `invalid_model`.
  - It is limited to 20 calls per hour, using the in-memory limiter from T-018.1.
  - The body must be `{}` with `Content-Type: application/json`.
- `server/ai/providerErrors.js`: the Claude half of `mapClaudeError`.
- `server/ai/claude.js`:
  - It uses an injected `fetch` to call `GET https://api.anthropic.com/v1/models/<model>`. The URL is a hard-coded
    constant, and `@anthropic-ai/sdk` is not used.
  - Headers: `x-api-key` and `anthropic-version: 2023-06-01`. Options: `redirect: "error"` and a 10 s timeout.
  - It reads only the HTTP status and cancels the body. A network error or timeout returns `provider_unavailable`.
- Deploy drafts in `deploy/deployment-repo/`, which Ming copies to `mmlabs-online/deployment`:
  - `envfile` step: add `AI_KEK` from the repo secret `TUDOCUATUI_AI_KEK`. Keep it independent of the Drive group,
    check its format (`^[A-Za-z0-9+/]{43}=$`), and write it with `printf`.
  - `scripts/deploy-envfile.test.ts`: five secrets, format cases, and "unset leaves the line out".
  - README: a section "AI key encryption (T-018)". `compose.yml`: comment fix only.
- M-16 in `work/ming-todo.md`:
  1. Generate the KEK without printing it.
  2. Save it in Bitwarden (personal collection).
  3. Set it with `gh secret set TUDOCUATUI_AI_KEK -R mmlabs-online/deployment`.
  4. Delete the local file.
  5. Merge the setup PR.
  6. Run `workflow_dispatch` and check that the logs show `ai configured`.
  7. Check that `GET /api/ai-settings` returns `{"settings":null}`.

## Out of scope
- The Settings UI (T-010), tagging (F-701), and Gemini.
- Rotating the KEK.
- A separate env file for `migrate` (spaceM#47).

## Acceptance criteria
- [ ] `POST /api/ai-settings/test` maps provider failures to `AiErrorCode` values. Unit tests with a fake fetch
      cover these cases: invalid key, forbidden, model unavailable, rate limited, provider unavailable,
      timeout/network, `key_unreadable` and `not_configured`.
- [ ] The key sentinel appears only in the `x-api-key` header sent to the pinned Anthropic host. It never appears in
      responses, logs or error messages.
- [ ] The envfile step writes `AI_KEK` only when the secret is set and well-formed, and fails on a malformed value.
      `deploy-envfile.test.ts` covers this.
- [ ] Checks are green. Local mode is unchanged (R1).

## Technical notes
- Files:
  - `server/ai/{routes,claude,providerErrors}.js` and their tests
  - `deploy/deployment-repo/**` and `scripts/deploy-envfile.test.ts`
  - `work/ming-todo.md`
- High tier because it changes a production deploy workflow (`deploy*`).

## Test plan
- Unit: fake fetch for Claude; the envfile script tests.
- Manual (Ming, after merge): run M-16, then save a key (`curl` or T-010) and press Test.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-12 (from T-018.1 security review, carry into the plan): refuse AI or warn loudly when Cloudflare Access is off (Y1); `delete process.env.AI_KEK` after import (G1); map every `openKey` failure to one code, never log the error object (G2); add a `/test` sentinel case with a provider error body echoing the key.
- 2026-11-12: created from the approved T-018 split ("Plan approved (T-018), chia 2").

## Handoff

### 2026-11-13 — claude — BLOCKED
- Done: consult (software-architect) and plan.md (Status READY): `POST /api/ai-settings/test` with strict `{}` body, seams `getSecret()` / `openStoredKey()` / pure `claude.js` for T-019.3, G1 (`delete process.env.AI_KEK`) and Y1 (refuse AI when request auth is off) in `initAi`, `AI_KEK` envfile wiring + M-16; assumptions A1–A12, deviations C1–C6.
- In progress / next: Ming approves the plan, then implement → review → PR.
- Gotchas: hotspots with T-019.2/.3/.5 (`server/index.js`, `server/ai/*`); the implementer appends a forward note to T-019.3 in this diff (A5).
