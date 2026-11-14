# F-702: "✨ Tự điền từ ảnh" in the editor (real AI)

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | ui |
| Gate | none |
| Depends on | F-701, T-010 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
| PR | — |

## Goal
The editor's "Tự điền từ ảnh" calls F-701 and fills only empty fields, never overwriting what Ming typed, with undo.

## Feature reference
`docs/feature-list.md` E7 — AI (F-701/F-702). **Changed by D21 (2026-11-10):** instead of one server-wide key in
Supabase secrets, each user chooses the provider (**Claude** or **Gemini**), enters their own API key and picks a
model in Settings; the key is stored **encrypted on the server** and never returned to the browser; AI exists in
**Supabase mode only** (local mode / Figma Make preview unchanged). Ming asked for this on 2026-11-10
("dùng Claude và Gemini. Cho lựa chọn ở setting và nhập key" / "cho tùy chọn model ở setting").
Split of one L-size request into T-009 → T-010 → F-701 → F-702.

## Scope
- Replace the mock autofill in Supabase mode (T-001's `showMockAi`) with a call to `tag-item-photo`.
- Fill empty fields only; one-tap undo; loading state; Vietnamese errors (incl. "chưa cài đặt AI" → link to Settings).
- Local mode / Figma Make preview unchanged (D9).

## Acceptance criteria
- [ ] Only empty fields are filled; existing input is never overwritten; undo restores the previous values.
- [ ] Without settings/key, the button explains how to set it up.
- [ ] 390px and dark mode; tests pass.

## Notes / answers from Ming
- 2026-11-10: providers Claude + Gemini; key + provider + model chosen in Settings; key stored server-side,
  encrypted (option chosen over browser storage); AI only in Supabase mode.

- 2026-11-10: **Paused by D23** (move to self-hosted Postgres + Node API). Re-plan on the new backend after T-013/T-014; the Supabase design no longer applies.

- 2026-11-12: 'Supabase mode only' becomes 'API mode only' (D30).

- 2026-11-14 (F-701): the endpoint is `POST /api/ai/tag-photo`: raw JPEG body (`Content-Type: image/jpeg`, at most
  2 MB), answer `{ suggestion: { name, category, colors, seasons, material, brand, tags } }` with DB ids (`null`/`[]`
  when unknown; map with `*_FROM_DB`; fill empty fields only). `resizeImage` before posting, debounce the button, show
  a disclosure line near it (e.g. "Ảnh sẽ được gửi tới Claude bằng key của bạn"), and map `not_configured` to the
  Settings link. Codes: `not_configured`, `invalid_key`, `key_forbidden`, `invalid_model`, `key_unreadable`,
  `rate_limited` (100/24 h), `provider_rate_limited`, `provider_unavailable`, `provider_bad_response`, `invalid_photo`,
  `unsupported_media_type`, `payload_too_large`, `request_timeout`, `ai_busy`, `server_misconfigured`, `db_unavailable`.
  Claude only until F-701.1.

## Handoff
