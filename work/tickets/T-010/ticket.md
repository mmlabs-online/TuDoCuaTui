# T-010: Settings screen: AI provider, API key and model

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | ui, security |
| Gate | none |
| Depends on | T-018.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | claude@2026-11-13T04:31:48Z |
| PR | — |

## Goal
Ming opens Settings, picks Claude or Gemini, pastes an API key, picks a model and tests it — all in the app.

## Feature reference
`docs/feature-list.md` E7 — AI (F-701/F-702). **Changed by D21 (2026-11-10):** instead of one server-wide key in
Supabase secrets, each user chooses the provider (**Claude** or **Gemini**), enters their own API key and picks a
model in Settings; the key is stored **encrypted on the server** and never returned to the browser; AI exists in
**Supabase mode only** (local mode / Figma Make preview unchanged). Ming asked for this on 2026-11-10
("dùng Claude và Gemini. Cho lựa chọn ở setting và nhập key" / "cho tùy chọn model ở setting").
Split of one L-size request into T-009 → T-010 → F-701 → F-702.

## Scope
- A Settings entry (header/account area) visible in Supabase mode only.
- Provider select (Claude / Gemini), model select filtered by provider (from T-009's allowlist), key field
  (write-only, `type="password"`, shows only the masked hint once saved), Save / Delete key / Test buttons.
- Vietnamese copy in the feature's copy file (R6); 390px and dark mode (R9).

## Out of scope
- Server storage (T-009), tagging (F-701), editor autofill (F-702).

## Acceptance criteria
- [ ] Saving shows the masked key; reloading never shows the full key.
- [ ] Changing provider changes the model list; invalid combinations cannot be saved.
- [ ] Clear Vietnamese errors (invalid key, test failed, network); key field cleared after save.
- [ ] Hidden in local mode; works at 390px and in dark mode; tests pass.

## Notes / answers from Ming
- 2026-11-12: backend is T-018 (D30): REST `/api/ai-settings` (GET/PUT), `/key` (DELETE), `/test` (POST, T-018.2); `{settings: AiSettingsView|null}`. Generic `/api` codes (`invalid_json`, `unsupported_media_type`, `forbidden_origin`, `db_unavailable`) are in `AI_ERROR_STATUS`. An expired Access session shows up as a redirect/network error on fetch, not a 401: show 'đăng nhập lại'.
- 2026-11-13: T-018 and T-018.2 are MERGED (PRs #42, #45). D33: AI settings become per-user in T-019.3 (server-side only; the UI contract stays `{settings}`).
- 2026-11-12 (chat with Annie): "ok" to plan.md Q1–Q3 defaults — T-018 ports the backend first (T-010 now depends on T-018 and stays UI-only); AI is "API mode only" (D21 amended in T-018); key entered in Settings, stored encrypted with `TUDOCUATUI_AI_KEK`. Re-plan T-010 after T-018 merges.
- 2026-11-10: providers Claude + Gemini; key + provider + model chosen in Settings; key stored server-side,
  encrypted (option chosen over browser storage); AI only in Supabase mode.

- 2026-11-10: **Paused by D23** (move to self-hosted Postgres + Node API). Re-plan on the new backend after T-013/T-014; the Supabase design no longer applies.

## Handoff

### 2026-11-12 — claude — BLOCKED
- Done: re-planned after D23; plan.md Status BLOCKED: the Node server has no AI-settings backend (T-009 exists only as unused Supabase code).
- In progress / next: Ming answers Q1–Q3 in plan.md (default: new T-018 ports the backend to the Node server first; D21 "Supabase mode only" → "API mode only"; keep in-app key entry with a new `TUDOCUATUI_AI_KEK` deployment secret). Then create T-018 and set T-010 Depends on T-018.
- Gotchas: T-016 touches the same frontend files (aiSettings.ts, mode.ts, main.tsx, App.tsx); whichever lands second rebases.
