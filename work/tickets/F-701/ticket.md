# F-701: Edge Function `tag-item-photo` using the user's AI settings

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | architecture, security |
| Gate | plan-approval |
| Depends on | T-009 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
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
- 2026-11-10: providers Claude + Gemini; key + provider + model chosen in Settings; key stored server-side,
  encrypted (option chosen over browser storage); AI only in Supabase mode.
- 2026-11-10: function renamed to `tudo-tag-item-photo` (T-009 plan approval, A4; D22 naming), to avoid colliding with stoktok's functions on the shared project.

## Handoff
