# T-009: Store per-user AI provider settings and an encrypted API key

| Field | Value |
|---|---|
| State | BACKLOG |
| Priority | P1 |
| Size | M |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | db, security, architecture |
| Gate | plan-approval |
| Depends on | T-004 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

## Goal
The server keeps, per user, the chosen AI provider (Claude or Gemini), model and an **encrypted** API key, so an
Edge Function can call the provider without the key ever reaching or being readable from the browser.

## Feature reference
`docs/feature-list.md` E7 — AI (F-701/F-702). **Changed by D21 (2026-11-10):** instead of one server-wide key in
Supabase secrets, each user chooses the provider (**Claude** or **Gemini**), enters their own API key and picks a
model in Settings; the key is stored **encrypted on the server** and never returned to the browser; AI exists in
**Supabase mode only** (local mode / Figma Make preview unchanged). Ming asked for this on 2026-11-10
("dùng Claude và Gemini. Cho lựa chọn ở setting và nhập key" / "cho tùy chọn model ở setting").
Split of one L-size request into T-009 → T-010 → F-701 → F-702.

## Scope
- New migration (R2): a `tudo_` settings table (provider, model, key reference / last-4 hint, updated_at) with RLS
  (owner only) and the key stored encrypted (e.g. Supabase Vault) — never selectable by the client.
- An Edge Function (e.g. `tudo-ai-settings`) that, for the signed-in user: saves provider + model + key, deletes
  the key, returns settings with only a masked key (`••••1234`), and can run a cheap "test key" call.
- Allowed provider/model ids validated server-side (an allowlist in one place); model lists verified against the
  providers' current docs at implementation time, not guessed.
- `WardrobeRepo`-style client wrapper (R1) for the UI to call; local mode returns "not available".

## Out of scope
- The Settings UI (T-010), photo tagging (F-701), the editor button (F-702).

## Acceptance criteria
- [ ] A user can save, replace and delete their key; the browser can never read it back (only a masked hint).
- [ ] RLS: a user cannot read or change another user's settings; anon has no access (RLS tests, as F-006).
- [ ] Only allowlisted provider/model ids are accepted.
- [ ] No key or secret in client code, `VITE_*`, logs or error messages (R3).
- [ ] Unit tests for validation; checks pass.

## Technical notes
- High tier: migration, RLS, Edge Function, secrets → plan approval; security review at REVIEW.
- Applying the migration and deploying the Edge Function on the shared stoktok project are Ming steps (D17).
- Risks: Vault availability on the shared project; key encryption key management; rate limiting.

## Notes / answers from Ming
- 2026-11-10: providers Claude + Gemini; key + provider + model chosen in Settings; key stored server-side,
  encrypted (option chosen over browser storage); AI only in Supabase mode.

## Handoff
