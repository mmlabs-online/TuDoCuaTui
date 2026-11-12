# T-010: Settings screen: AI provider, API key and model

| Field | Value |
|---|---|
| State | BLOCKED |
| Priority | P1 |
| Size | S |
| Milestone | M1 |
| Epic | E7 — AI |
| Areas | ui, security |
| Gate | none |
| Depends on | T-009 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-10 |
| Claimed by | — |
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
- 2026-11-10: providers Claude + Gemini; key + provider + model chosen in Settings; key stored server-side,
  encrypted (option chosen over browser storage); AI only in Supabase mode.

- 2026-11-10: **Paused by D23** (move to self-hosted Postgres + Node API). Re-plan on the new backend after T-013/T-014; the Supabase design no longer applies.

## Handoff

### 2026-11-12 — claude — BLOCKED
- Done: re-planned after D23; plan.md Status BLOCKED: the Node server has no AI-settings backend (T-009 exists only as unused Supabase code).
- In progress / next: Ming answers Q1–Q3 in plan.md (default: new T-018 ports the backend to the Node server first; D21 "Supabase mode only" → "API mode only"; keep in-app key entry with a new `TUDOCUATUI_AI_KEK` deployment secret). Then create T-018 and set T-010 Depends on T-018.
- Gotchas: T-016 touches the same frontend files (aiSettings.ts, mode.ts, main.tsx, App.tsx); whichever lands second rebases.
