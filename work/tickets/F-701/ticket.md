# F-701: Edge Function `tag-item-photo` using the user's AI settings

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | T-018.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | claude@2026-11-14T09:01:58Z |
| PR | — |

## Goal
Given an item photo, return suggested `{name, category, colors[], seasons[], material, brand, tags[]}` restricted to
the allowed ids, using the provider, model and key the user saved (Claude or Gemini).

## Feature reference
`docs/feature-list.md` E7 — AI (F-701/F-702). **Changed by D21 (2026-11-10):** instead of one server-wide key in
Supabase secrets, each user chooses the provider (**Claude** or **Gemini**), enters their own API key and picks a
model in Settings; the key is stored **encrypted on the server** and never returned to the browser; AI exists in
**Supabase mode only** (local mode / Figma Make preview unchanged). Ming asked for this on 2026-11-10
("dùng Claude và Gemini. Cho lựa chọn ở setting và nhập key" / "cho tùy chọn model ở setting").
Split of one L-size request into T-009 → T-010 → F-701 → F-702.

## Scope
- Edge Function `tag-item-photo`: reads the caller's settings + decrypted key server-side, calls Claude or Gemini
  vision, validates the JSON strictly (zod), maps to allowed ids.
- Per-user rate limit (e.g. 100 calls/day) and image size limit (feature list); clear error codes (no key set,
  invalid key, rate limited, provider error).
- Provider adapters behind one interface; Claude via the official Anthropic SDK.

## Acceptance criteria
- [ ] Returns valid ids only; unit-tested parser/mapper for both providers' responses.
- [ ] Clear error code when no key is set, the key is invalid, or the rate limit is hit.
- [ ] The key never leaves the server; nothing secret in logs (R3).

## Notes / answers from Ming
- 2026-11-14: **Plan approved** (Ming, in session: "duyệt F-701"; A1–A16 and C1–C9 as in plan.md). Gemini split to F-701.1 (A1).
- 2026-11-10: providers Claude + Gemini; key + provider + model chosen in Settings; key stored server-side,
  encrypted (option chosen over browser storage); AI only in Supabase mode.
- 2026-11-10: function renamed to `tudo-tag-item-photo` (T-009 plan approval, A4; D22 naming), to avoid colliding with stoktok's functions on the shared project.

- 2026-11-10: **Paused by D23** (move to self-hosted Postgres + Node API). Re-plan on the new backend after T-013/T-014; the Supabase design no longer applies.

- 2026-11-12: re-plan on the Node server (D30); reads settings via `server/ai/store.js` and opens the key with `server/ai/crypto.js`; depends on T-018.2.

- 2026-11-13: T-018.2 MERGED (PR #45): `store.getSecret()`, `openStoredKey()` and `server/ai/claude.js` exist; T-010 MERGED (PR #46). D33: per-user keys later in T-019.3.

## Handoff

### 2026-11-13 — claude — BLOCKED
- Done: consult (software-architect) and plan.md (Status READY): `POST /api/ai/tag-photo` (raw JPEG ≤ 2 MB), Claude Messages API with forced tool use, server sanitizer, shared `loadSettingsKey`, limits 100/24 h + 2 in flight, new codes `invalid_photo`/`request_timeout`/`provider_bad_response`/`ai_busy`; superseded ticket text C1–C9; assumptions A1–A16.
- In progress / next: Ming approves the plan. On approval, create F-701.1 (Gemini) on `main` (A1), then implement → review → PR.
- Gotchas: hotspots with T-019.2/.3/.5/.6; `src/features/settings/copy.ts` must cover the new error codes (exhaustive table).
