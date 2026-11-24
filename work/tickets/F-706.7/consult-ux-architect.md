# Consult — ux-architect — F-706.7

## Findings
1. **Settings screen** (`src/features/settings/AiSettingsModal.tsx`, copy in `settings/copy.ts`) is entirely BYOK: provider select, model select, key field (autofill guards), Test, Save, Delete key + Confirm. It is opened from `App.tsx:328-336` (`settingsOpen`, `aiClient`, and `setAiSettingsRev` on close). `form.ts`/`form.test.ts` and `AiSettingsClient.save/test` exist only for this form.
2. **Availability gate**: `aiAvailability` (`items/aiFill.ts:102-110`) returns `no_key` when `!view || !view.hasKey`. It also returns `model_unsupported` and a `provider` in `ready`/`no_photo`. The `AiAvailability` kinds are consumed in three places:
   - `Editor.tsx:211-254` (via `useAiFill`): the `no_key`, `model_unsupported` and `misconfigured` branches show a "settings" link. `ready` shows `aiCopy.disclosure(providerName)`.
   - `ImportPhotosTab.tsx:143-153` (via `ImportModal.tsx:50`).
   - `OutfitsModal.tsx:104-105`: it only checks `kind === "ready"`, so the "Gợi ý bằng AI" button just disables silently with no reason shown.
3. **Error mapping**: `src/shared/ai/errors.ts` already has `ai_cap_reached` (503) with Vietnamese copy ("AI đang tạm tắt đến hết tháng này..."). It has **no** codes for out-of-credit or welcome-pending. Both are mirrored in `server/ai/*.js` with `parity.test.ts`, so new codes need a server-side mirror. `needsSettings()` (`aiFill.ts:125-133`) sends users to Settings for key errors; those codes become meaningless after cutover. `outfits/copy.ts:50` has "Kiểm tra lại AI trong Cài đặt".
4. **Server side already built** (F-706.1/2): `server/ai/credits.js` returns a balance `{period, monthly, lasting, total, welcome: "approved"|"pending"}`. A reserve returns the status `welcome_pending` or `insufficient`. No HTTP route or client exposes the balance yet. F-706.4 owns the cutover and routes, so F-706.7 needs a defined contract with it.
5. **Copy is spread across** `SETTINGS_COPY`, `AI_ERRORS`, `EDITOR_COPY.ai`, and the outfits/import copy. `aiFill.ts` imports from `features/settings/copy`. R6 wants one place per feature.
6. Decisions that matter: D52 (no release with F-706.4 without F-706.7; `DELETE /api/ai-settings/key` stays until F-706.8). D53 prices: photo fill 1, new suggestion or shuffle 1, cached 0. Welcome +300 is approval-gated for new accounts. Monthly +60 is spent first. The cap is app-wide. D55 means F-706.4 may be on `main` before this ticket, but no release is allowed until both ship.

## Recommendations
1. **Contract first (AC1, AC2)**: add a `GET /api/ai/credits` (or fold it into the ai-settings GET) returning `{balance, costs:{photoFill:1, suggestion:1}, welcome, capReached}`. Add a client `AiCreditsClient` next to `data/aiSettings.ts`. Agree the shape with F-706.4 and put it in `src/shared/ai/` with a parity test. Prices should come from the server (one source), not constants in the UI.
2. **Rework availability into a state machine** (unit-tested pure function): `loading | load_error | misconfigured | cap_off | welcome_pending | out_of_credit | no_photo | ready{balance, cost}`. Drop `no_key`, `model_unsupported` and the provider from the type. Order: cap_off, then welcome_pending, then out_of_credit (balance < cost), then no_photo/ready. Each blocked state makes no AI call (AC3); disable the button and show a distinct reason line.
3. **One shared hook/presenter**: extend `useAiLoad` to return credits, and add one shared `AiStateNote` component or copy map used by the Editor, the import tab and the outfits modal. This removes the three divergent branches.
4. **Show cost before tapping (AC2)**: put the cost on the button label, e.g. "Điền bằng AI · 1 credit", and the balance in the note ("Còn 298 credit"). Do the same for "Gợi ý bằng AI" and for the bulk import (show "N ảnh × 1 = N credit" and the balance; disable or cap the batch when the balance is lower than the batch). Show the cost as 0 for cached results.
5. **Replace the settings modal** with a read-only "AI & credit" panel:
   - the balance split into monthly (60, resets) and lasting;
   - the price list;
   - a status banner for the welcome-pending, out-of-credit and AI-off states.
   Remove the provider, model and key fields, Test and Save, `form.ts` and its tests, and the autofill code. Rename `SETTINGS_COPY` into a single `AI_COPY` per feature. Keep the entry point from the header, but also link from the blocked notes (they should open the panel instead of "settings").
6. **Old key deletion**: the cheapest option that fits D52 is a small "Xoá key cũ" row shown only when the GET still reports a stored legacy key (needs a `hasLegacyKey` flag from the server). That respects the D52 "user can still delete" promise until F-706.8, and the row is removed with F-706.8. If Ming prefers, hide it and let F-706.8 delete everything. **Flag to Ming.**
7. **Error mapping**: add `insufficient_credits` and `welcome_pending` codes (server and shared, parity test). Map them in `aiErrorText`; make `needsSettings` obsolete (remove the key-related codes from the UI path). `ai_cap_reached` is already mapped. After a failed call with these codes, refresh the credits so the UI flips state without a reload. Refresh the balance after each successful or refunded call too.
8. **R9**: the panel and notes must fit 390px (stack the balance and price rows, 44px tap targets, no horizontal overflow), use existing CSS vars for dark mode, and give state colours (cap/out-of-credit) sufficient contrast in both themes. Banners use `role="status"`/`role="alert"`.
9. **Tests (R8)**: the availability state machine for every state, the error-code mapping, per-state rendering in the Editor/Import/Outfits tests (update `Editor.test.tsx`, `ImportModal.test.tsx`, `OutfitsModal.test.tsx`, `AiSettingsModal.test.tsx`, `aiFill.test.ts`, `copy.test.ts`), and a test that no key input is rendered. The one-off Playwright run at 390px in dark mode is a manual check (D42).
10. **Suggested copy** (all in the one `AI_COPY`): waiting for approval, "Tài khoản của bạn đang chờ duyệt để nhận credit AI. Bạn vẫn dùng các chức năng khác bình thường."; out of credit, "Bạn đã hết credit AI. Credit hàng tháng được cộng lại vào đầu tháng sau."; AI off, reuse the `ai_cap_reached` text.

## Risks
- **Release coupling**: if the UI merges without F-706.4's balance endpoint, every non-owner sees no AI or a broken state. The endpoint contract must land before this implementation, or this ticket must carry a stub client behind the F-706.4 route. Confirm the F-706.4 status first.
- **Parity**: the shared `errors.ts` mirror in `server/ai/*.js` means the UI-only addition of codes fails `parity.test.ts`; the change spans server and shared.
- **Stale balance**: concurrent tabs, or a refund, can leave the UI out of date. The server remains authoritative, so a blocked client check must never be the only guard. The UI should still call and map `insufficient_credits` on the server's answer.
- **Welcome-pending** also affects existing-account semantics (they get 300 once); verify copy against the `approved` state so legacy users never see the pending note.
- **Bulk import** can spend N credits in one go. Mid-batch exhaustion needs a clear "stopped, N done" message (`aiStopped` already exists at `ImportPhotosTab.tsx:192`, so reuse it).
- **High-path guard**: nothing here touches migrations or auth, so the tier should not be High. The `src/App.tsx` hotspot is shared with other tickets, so keep the diff there minimal.

## Open questions (batched, with proposed defaults)
1. Does F-706.4 expose the balance and prices (and which path and shape)? Default: `GET /api/ai/credits` as in Rec. 1, and agree it with F-706.4 before implementing.
2. Keep a "delete my old key" action until F-706.8? Default: yes, a small row only when the server reports a legacy key, for Ming to confirm.
3. Should the UI still show the model or provider name in the disclosure note ("Ảnh sẽ được gửi tới Gemini")? Default: show "Gemini" read-only from the server, to keep the privacy disclosure (D40/D54 spirit) without a selector. Needs the server to return the provider.
4. Bulk import when the balance is less than the batch: block the start, or run until credits run out? Default: allow the run, stop at zero with a clear message (matches `aiStopped`).
5. Is the balance display needed outside the AI entry points (e.g. a header chip)? Default: no; show it only in the AI panel and next to the AI buttons.

Key files: src/features/settings/AiSettingsModal.tsx, src/features/settings/copy.ts, src/features/items/aiFill.ts, src/features/items/Editor.tsx, src/features/import-export/ImportPhotosTab.tsx, src/features/outfits/OutfitsModal.tsx, src/shared/ai/errors.ts, server/ai/credits.js, src/App.tsx.
