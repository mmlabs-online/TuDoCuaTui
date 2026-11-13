Status: BLOCKED

# Plan — T-010: Settings screen: AI provider, API key and model

## Feature summary
Ticket goal: "Ming opens Settings, picks Claude or Gemini, pastes an API key, picks a model and tests it — all in the app."

`work/decisions.md`:
- D21 (2026-11-10): "Each user picks provider, model and enters their own API key in Settings; the key is stored
  **encrypted server-side** (e.g. Supabase Vault), never returned to the browser (masked hint only), and used only by
  Edge Functions. AI is available in **Supabase mode only**; local mode / Figma Make preview unchanged."
- D23 (2026-11-10): "TuDo moves its data from Supabase (D17) to the shared Postgres ... accessed only by a Node API in
  the same image as the SPA ... **No in-app authentication for now** (single user) ... Supabase-based work is paused:
  PR #28 (T-009) not merged; T-010, F-701, F-702, T-005.x re-planned on the new backend. Supersedes ... D21's Supabase
  storage design, D22."
- D25: on the self-hosted backend "schema changes are a new SQL file in the TuDo migrations folder, applied only by the
  `migrate` one-shot service ... While the app is single-user without login (D23), tables do not use RLS".
- D27/D28 set the pattern for server-only secrets: "in the server's runtime env only (R3)", stored as repository
  secrets of `mmlabs-online/deployment`.

Ticket notes: "2026-11-10: **Paused by D23** ... Re-plan on the new backend after T-013/T-014; the Supabase design no
longer applies." Ticket scope: "Out of scope: Server storage (T-009)".

## Why this plan is BLOCKED
The screen needs a server that stores the provider/model, encrypts the key, returns a masked view and runs a test
call. On the current tree **that server does not exist on the Node backend**:

- T-009 (PR #28, merged, `work/ming-todo.md`: "Its Supabase parts (Edge Function, migration) are not deployed under
  D23; T-016 removes or ports them") lives only in `supabase/migrations/20261110000000_tudo_ai_settings.sql`,
  `supabase/functions/tudo-ai-settings/**` and `supabase/functions/_shared/core/{crypto,store,settingsHandler,
  providerErrors,gemini}.ts` + `_shared/deno/claude.ts`. M-10 (deploy it) is marked superseded.
- `server/api.js` routes only `/api/items`, `/api/locations`, `/api/items/:id`, `/api/items/:id/photo`,
  `/api/items/:id/wear`, `/api/photos/:id`. No AI route, no KEK env var, no AI table.
- `db/migrations/` has `init`, `item_photos_drive`, `item_category_v2` only — no AI settings table.
- The only browser client, `src/data/aiSettings.ts`, calls `supabase.functions.invoke("tudo-ai-settings")`, and the
  T-016 plan deletes it ("Supabase-only, no caller") while keeping `src/shared/ai/*` "until T-010 is re-planned on the
  Node backend" (T-016 plan A1).
- `src/` has no Settings entry or screen today.

Porting the backend is High tier (DB migration, secret handling, new server secret in deploy config), needs plan
approval and a new Ming step (KEK secret), and alone is about T-009's size (M). T-010 is `Size S`, `Gate: none`, and
lists server storage as out of scope. Folding the port into T-010 would break rule 2 (size), the gate rule (workspace
§8 / D13) and the ticket's scope. A UI-only T-010 against a non-existent endpoint could not meet AC 1–3 or be
verified. So the backend has to be ticketed and merged first, and a few D21 wordings need Ming's confirmation under
D23.

## Acceptance criteria → verification
Deferred until unblocked. Planned mapping once the backend ticket (Q1) is merged:

| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | Saving shows the masked key; reloading never shows the full key | `AiSettingsPanel.test.tsx` with a fake `AiSettingsRepo`: after save, the hint `••••1234` is shown and the key input is empty; remount → only the hint; `httpAiSettings.test.ts`: the GET response type has no key field |
| 2 | Changing provider changes the model list; invalid combinations cannot be saved | Panel test: switching provider resets the model to `defaultModelOf`; Save disabled when the provider has no models (Gemini today); `src/shared/ai/validate.test.ts` already covers the pure rule |
| 3 | Clear Vietnamese errors; key field cleared after save | `aiSettingsCopy.test.ts`: every `AiErrorCode` maps to a non-empty Vietnamese message; panel tests for `invalid_key`, test failed, `network` |
| 4 | Hidden in local mode; 390px and dark mode; tests pass | Panel/App test: no Settings entry when `mode === "local"`; reviewer opens `pnpm dev` at 390px in light and dark; Checks green |

## Ming verification after merge
Deferred. Expected: on the deployed app (behind Cloudflare Access), save a real Claude key, press Test, reload and
see only the hint.

## Files to create / modify
Deferred until unblocked. Expected (UI only, on top of the backend ticket):

| File | Change | Required because |
|---|---|---|
| `src/data/aiSettings.ts` (or `src/data/http/aiSettings.ts`, matching T-014's layout) | rewrite: HTTP client for `/api/ai-settings`, local stub `available: false` | R1, client for the screen |
| `src/features/settings/AiSettingsPanel.tsx` | create | the screen |
| `src/features/settings/copy.ts` | create | R6, one copy file per feature |
| Header component (settings entry) | modify | entry point, API mode only |
| tests next to each | create | R8 |

## Tests to write
Deferred; see the table above.

## Approach
Deferred. When unblocked: HTTP client first (pure, unit-tested with a fake `fetch`), then copy, then the panel, then
the header entry gated on `mode === "api"`. R1 (local stub, no direct fetch in components), R3 (key only sent on
save, never read back, cleared from state after save), R6, R9.

## Specialist input used
None (no consults for this ticket; T-009's consults apply to the backend ticket, not to this UI).

## Assumptions
- A1: Gemini stays not selectable until verified model ids are added (T-009 note 2026-11-10). In the UI the Gemini
  option is shown disabled with "(sắp có)", or hidden. Non-blocking; decided at re-plan.
- A2: Single user (D23): one settings record, no per-user scoping; the API is protected by Cloudflare Access like the
  rest of `/api`.
- A3: Hotspot: T-016 (BLOCKED) deletes `src/data/aiSettings.ts` and edits `src/data/mode.ts`, `src/main.tsx`,
  `src/App.tsx` and the header. Whichever lands second rebases.

## Blocking questions
1. **Port the T-009 backend to the Node server as a new ticket before T-010?**
   Why: the screen has nothing to call; the port is High tier (migration + secret + deploy config) and about size M.
   Proposed default: **yes** — create `T-018: Store AI provider settings and an encrypted API key on the Node server`
   (P1, M, areas db/security/architecture, `Gate: plan-approval`), porting from the current tree (or the T-016 archive
   SHA if T-016 lands first): new `db/migrations/<ts>_ai_settings.sql` (single row, no RLS per D25); AES-256-GCM with
   a `TUDOCUATUI_AI_KEK` env var read only by the server; `GET /api/ai-settings` (masked view, never the key),
   `PUT /api/ai-settings` (provider, model, optional key), `DELETE /api/ai-settings/key`,
   `POST /api/ai-settings/test`; reuse `src/shared/ai/{catalog,errors,validate,mask}.ts` and port `crypto`,
   `providerErrors`, the Claude adapter (pinned baseURL, per T-009 review) from `supabase/functions/_shared`. T-010
   then `Depends on: T-018` and stays UI-only. Alternative: fold the port into T-010 (rejected: breaks size and gate).
2. **D21 "Supabase mode only" → "API mode only"?**
   Why: Supabase mode is gone under D23; the ticket and F-701/F-702 still say Supabase.
   Proposed default: **yes** — AI (settings, tagging, autofill) exists only when the app runs against the Node API
   (`mode === "api"`); local mode / Figma Make preview unchanged. Record as a D21 amendment in `work/decisions.md`
   and update the T-010/F-701/F-702 notes.
3. **Keep the key entered in the UI and stored encrypted in Postgres, with the KEK as a deployment secret?**
   Why: with a single user and no login, a simpler option is a server env secret (`ANTHROPIC_API_KEY`-style) and no
   key field at all; but Ming chose in-app entry on 2026-11-10.
   Proposed default: **keep Ming's choice** — key entered in Settings, stored encrypted in the TuDo database; the KEK
   is a new repository secret `TUDOCUATUI_AI_KEK` in `mmlabs-online/deployment` (same pattern as D28), with a new
   Ming item to generate it (`openssl rand -base64 32`), back it up in the password manager and add it before the
   first release that contains T-018.

## Split proposal
Proposed (pending Q1): T-018 (Node backend port, High, plan-approval) → T-010 (Settings UI, this ticket, S) →
F-701 (re-planned as a Node endpoint) → F-702. This plan covers none of the code until T-018 is merged.
