# F-701.1: Gemini provider for AI photo tagging and the key test

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P2 |
| Size | S |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | security, architecture |
| Gate | plan-approval |
| Depends on | F-701 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-14 |
| Claimed by | — |
| PR | — |

## Goal
Users who choose Gemini in Settings can test their key and tag a photo, the same way Claude works after F-701.

## Feature reference
Split from F-701 (plan A1, approved by Ming 2026-11-14): F-701 ships Claude only; Gemini rows answer 400
`invalid_model` before the key is decrypted. `docs/feature-list.md` F-701 ("both providers"); D21, D30, D33.
Design notes: `work/tickets/F-701/consult-software-architect.md` R6.

## Scope
- Gemini models in `server/ai/catalog.js` and `src/shared/ai/` (parity test), so Settings (T-010) can pick one.
- Key check for `POST /api/ai-settings/test` and a tag adapter (`generateContent` with `inline_data`,
  `responseMimeType: application/json`, `responseSchema` with the server enums), reusing `parseTagSuggestion`.
- `mapGeminiError`: an invalid key is 400 with reason `API_KEY_INVALID` (allowlisted reason parsing, like
  `drive.js` `reasonOf`).
- Key only in the `x-goog-api-key` header, never `?key=`; pinned host, `redirect: "error"`, timeout, body cap.

## Out of scope
- Per-user keys (T-019.3); UI changes beyond enabling the Gemini option (copy only if needed).

## Acceptance criteria
- [ ] Gemini models are listed and accepted by `/test` and `/api/ai/tag-photo`.
- [ ] Error mapping covers invalid key, permission, model not found, rate limit, server errors and timeout.
- [ ] Sentinel tests: the key appears only in `x-api-key`-equivalent `x-goog-api-key` to the pinned host; never in URL, logs or responses.
- [ ] The Gemini option in Settings is enabled; all checks pass.

## Technical notes
- Files (likely): `server/ai/gemini.js` (new), `server/ai/providerErrors.js`, `server/ai/catalog.js`, `server/ai/tagPhoto.js`, `server/ai/routes.js`, `src/shared/ai/*`, `src/features/settings/*`.

## Test plan
- Unit with fake fetch, as F-701 / T-018.2.

## Notes / answers from Ming
- 2026-11-14: split approved with the F-701 plan (A1).

## Handoff
