# Consult — frontend-developer — F-706.7

## Findings

1. **No user-facing balance or cost API exists today.**
   - `server/api.js` routes only `/api/ai-settings` (GET/PUT), `/ai-settings/test`, `/ai-settings/key` (DELETE), `/ai/tag-photo` and `/ai/suggest-outfits`. Nothing returns a balance, cost or approval state.
   - `createCreditLedger` in `server/ai/credits.js` has `balance(userId)` and `reserve()` (statuses include `welcome_pending`). It is not wired to any route.
   - Client `AiSettingsView` (`src/shared/ai/catalog.ts`) has only `provider`, `model`, `keyHint`, `hasKey`, `modelSupported` and `updatedAt`. Credit data would have to come from F-706.4, for example extra fields on GET `/ai-settings` or a new `/api/ai/credits`. This is undecided.
2. **Error mirror.** `src/shared/ai/errors.ts` already has `ai_cap_reached` (503) and `ai_busy`. The copy for them is in `src/features/settings/copy.ts` and `server/ai/catalog.js`. There are no codes yet for out of credit, welcome pending or op-key mismatch. `server/ai/parity.test.ts` forces the TS and JS mirrors to stay identical, so codes added on one side must be added on the other.
3. **Availability.**
   - `aiAvailability` (`src/features/items/aiFill.ts:102-110`) returns `no_key` when `!view || !view.hasKey`. It has a `model_unsupported` branch too. `AiLoad` is built from `AiSettingsClient.get()`.
   - Consumers are `useAiFill.ts:61`, `ImportModal.tsx:51` (passed to `ImportPhotosTab.tsx`) and `OutfitsModal.tsx:105` (`kind === "ready"`).
   - `needsSettings` (`aiFill.ts:125-133`) sends users to Settings for key-related codes. `ImportPhotosTab.tsx` (~153, 192-202), `Editor.tsx` (~239-252) and `outfits/copy.ts:50` use it. Once keys are retired, those "check Settings" hints are wrong for most codes.
   - `AiSettingsModal` is wired at `App.tsx:328-336`. It owns the BYOK form, including the key field at about line 182, and `AiSettingsModal.test.tsx` covers it.
4. **R1 is satisfied.** All AI calls go through `src/data/aiSettings.ts`, `aiTagging.ts` and `aiOutfits.ts`.

## What the client can build without F-706.4

- A pure state model, tested with fixtures. Extend `AiAvailability` with `welcome_pending`, `out_of_credit` and `ai_off`. Build it from a `CreditView` type, `{balance, costs, welcomePending, capReached}`. Put a client-side cost table (photo fill 1, suggestion 1) in `src/constants/` or `shared/ai`, with a TODO to confirm it against the server price table.
- A fetch seam. Add `getCredits()` to `AiSettingsClient`, or to a new `CreditClient` in `src/data/`. Test it against a stubbed fetch, and keep the response shape behind one parser.
- All Vietnamese copy in `settings/copy.ts` or a new `credits/copy.ts`: a balance line, a cost badge on the buttons, and the three states (R6).
- The BYOK retirement. Remove the form and its tests, and drop `no_key` from availability. Decide how to treat `hasKey`: ignore it, or keep it only for the "delete my old key" action. Update the three flows' error mapping, and the `needsSettings` and settings links.
- The dark-mode and 390px layout work (R9).
- It cannot be verified end-to-end until F-706.4 supplies the shape and the codes.

## Recommendations

- Treat the F-706.4 response contract (shape and error codes) as the one blocking input. Before IMPLEMENT, have the planner write a short contract: credits endpoint or fields, `welcomePending` and `capReached` flags, new error codes with HTTP statuses, and a rule that approval and out-of-credit make no AI call. Ask whoever owns F-706.4 to adopt it, or align to its draft.
- Gate rollout so the same-release rule (D52/D55) cannot be broken. Keep F-706.7 merged but inert until F-706.4. For example, `aiAvailability` treats a missing credits payload as "legacy, use `hasKey`". Remove that fallback in the F-706.4 release. This is optional if F-706.7 merges only after F-706.4. State the chosen order in the plan and the PR description, and flag it to Ming.
- Make the credit check client-side only as a pre-tap hint. The server stays authoritative. After each AI call, refresh the balance, or return the new balance in the AI route responses.
- Delete-old-key: lean towards no UI action. The key can be wiped in F-706.8, and D52 keeps the DELETE endpoint until then. Alternatively, show a small "remove old key" link only when `hasKey` is true. Flag it to Ming (the ticket asks for this).
- Put the unit tests on the pure availability function, the copy mapping per error code (cap reached, out of credit, welcome pending), and a check that the BYOK form is gone. Add the new codes to `errors.ts` and `server/ai/catalog.js` together, so the parity test passes.

## Risks

- Contract drift. If F-706.7 guesses the shape, F-706.4 will need rework. If F-706.7 merges first without a legacy fallback, every non-owner gets `no_key`-style behaviour. If F-706.7 removes the `hasKey` checks but F-706.4 is not deployed, AI calls go out with no key and fail.
- Cost-table duplication between client and server can drift. Prefer the server returning costs.
- The balance can go stale across tabs, or after a failed call that gets refunded.
- `App.tsx:328-336` is a hotspot that other tickets may touch. The Settings modal may be left empty or lose its Test and Model controls. Decide whether the Settings entry stays (model choice) or goes away.
- Security: the key-delete path and `keyHint` must not be shown to users with no key.
- The existing hint "Kiểm tra lại AI trong Cài đặt" would mislead for credit errors. Fix it in `outfits/copy.ts`, `Editor.tsx` and `ImportPhotosTab.tsx`.

## Open questions (default stated)

1. Where does the balance come from: extra fields on GET `/api/ai-settings` or a new `/api/ai/credits`? Default: a new `GET /api/ai/credits` returning `{balance, costs, welcomePending, capReached}`.
2. What are the exact new error codes and statuses for out of credit, welcome pending and cap reached? Default: reuse `ai_cap_reached` (503). Add `credit_exhausted` (402) and `welcome_pending` (403).
3. Is the cost table served by the server or fixed on the client? Default: served by the server, with a client fallback table.
4. Is F-706.7 inert behind a legacy fallback until F-706.4, or does it merge only after? Default: merge after F-706.4 is ready, in the same release.
5. Keep a "delete my old key" action? Default: no UI. Leave the endpoint until F-706.8. (Ming.)
6. Does the Settings modal stay for model choice, or is it removed entirely? Default: remove the BYOK parts and keep the model choice only if the server still allows it.

Key files: src/features/items/aiFill.ts, src/shared/ai/errors.ts, src/data/aiSettings.ts, src/features/settings/AiSettingsModal.tsx, src/features/settings/copy.ts, server/api.js, server/ai/credits.js.
