# F-706.4: Cut AI over to the shared key, credits and spend cap

| Field | Value |
|---|---|
| State | DONE |
| Priority | P1 |
| Size | M |
| Milestone | M4 |
| Epic | E7 — AI |
| Areas | security, architecture, data |
| Gate | plan-approval |
| Depends on | F-706.1, F-706.2, F-706.3 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-22 |
| Claimed by | claude@2026-11-24T04:22:19Z |
| PR | — |

## Goal
Make photo fill, bulk tagging and outfit suggestions use the shared key, charged in credits and bounded by the spend cap, so any signed-in user can use AI without their own key.

## Scope reference
`docs/feature-list.md` E7 → F-706 ("Shared AI key, credit ledger and spend cap") and its AC list; open questions OQ-1 to OQ-5 and OQ-16 (answered). Decisions D52 (shared key, amends D33) and D53 (credits and cap). Split F-706.4 "Cutover"; OQ-5 and OQ-16 (D52). Architecture consult: `docs/ai-stylist-notes.md` (refs as of commit `41ee069`) (advice, not decisions).

## Scope
- Replace `loadSettingsKey` at its call sites with the shared key; BYOK keys are no longer read or decrypted.
- Each paid call: reserve credits (photo fill 1, new suggestion 1) and spend estimate → provider call → commit or refund, with an idempotency key.
- New error codes (out of credit, cap reached, waiting for welcome approval) in both mirrors and in `AI_BATCH_OFF`.
- Keep `DELETE /api/ai-settings/key` so a user can delete their own stored key (OQ-5, D52).

## Out of scope
- Client credit UI and retiring the BYOK form (F-706.7, same release).
- Deleting legacy ciphertext (F-706.8). Sticker routes (F-708.3).

## Acceptance criteria
- [ ] Photo fill, bulk tagging and suggestions use the shared key and charge credits per D53 prices (route tests with a fake provider).
- [ ] After this ticket no code path decrypts a BYOK key; existing ciphertext is unchanged until F-706.8.
- [ ] The same idempotency key never charges or calls the provider twice, and replays the stored result.
- [ ] A failed provider call refunds credits; at the cap AI routes answer a distinct error with no provider call, and all non-AI routes still work.
- [ ] The bulk import stops cleanly when credits run out: finished photos stay, the rest are reported as not tagged.
- [ ] A user can still delete their own stored BYOK key.
- [ ] All checks pass (format, typecheck, test, build).

## Technical notes
- High tier: touches `server/**` and/or `db/migrations/**` (loop.config.md High paths), so the loop stops after PLAN until Ming approves the plan.
- **Release rule (D52, D55):** may merge before F-707.4 (D55), but ships in the same release as F-706.7, and F-707.4 (AI only on an explicit action) ships before or with them, so no user is charged without tapping (OQ-16). Do not cut a release containing this ticket without F-706.7.
- Needs Ming M-42 before release: paid provider tier whose terms exclude training (D54) and a provider-console cap ≤ $20/month (D53).
- `loadSettingsKey` call sites: `server/ai/tagPhoto.js:48`, `server/ai/suggestOutfits.js:72`, `server/ai/routes.js:85` (ai-stylist-notes.md:69).
- New error codes go in `src/shared/ai/errors.ts:4`, `server/ai/catalog.js:27` and `AI_BATCH_OFF` (`src/data/photoImport.ts:36-48`), or a bulk import keeps retrying after credits run out (ai-stylist-notes.md:72).
- Switching to the shared key before metering means unmetered spend: the key swap and the charge land together (ai-stylist-notes.md:51).
- Dev runs against production (D45): local testing spends real credits and cap unless AI is stubbed (ai-stylist-notes.md:88).
- Shared-key photo fill sends every user's photos to Ming's provider account; D54 lists its one-time AI notice for stickers (F-709.3) only. Open for the planner: flag to Ming whether the notice must also show before the first shared-key photo fill.

## Test plan
- Unit/route: shared key used, BYOK never decrypted, idempotent replay, refund on failure, cap error, bulk import stop.
- Manual (Ming): one real photo fill and one suggestion on production after M-42.

## Notes / answers from Ming
Waiting for Ming: plan approval (High tier)
- 2026-11-24 — Plan approved by Ming ("duyệt F-706.4, mặc định cả"): assumptions A1–A14 at their defaults, including A3 and A6 (recorded as D56); split approved — `GET /api/ai/credits` is ticket F-706.9. Debt: spaceM#75 (A1), #76 (A8), #77 (A9).
- 2026-11-24 — Ming: F-706.4 may start now; M-42 (paid no-training tier + provider-console cap) is required before the release, not before implementation. Also adopt the F-706.7 contract (M-50 defaults): `GET /api/ai/credits` returning `{credits:{balance:{period,monthly,lasting,total},welcome,capReached,costs:{photo_fill,suggest},provider}}`, codes `credits_exhausted` 402 and `welcome_pending` 402, reuse `ai_cap_reached` 503 (see work/tickets/F-706.7/plan.md on branch ticket/F-706.7). Existing accounts must read welcome=approved.

## Handoff

### 2026-11-24 — claude — BLOCKED
- Done: consult software-architect; plan READY (migration 20261124120000_credit_ops_replay.sql: request_hash/result/error_code on credit_ops + welcome backfill/approval for existing accounts; appKeys.open, shared provider constant gemini-2.5-flash, one paid-call runner, cutover of tag-photo and suggest, /api/ai-settings/test removed, new codes credits_exhausted/welcome_pending 402, Idempotency-Key header from the client). Proposes splitting GET /api/ai/credits into a new ticket F-706.9.
- In progress / next: waiting for Ming's plan approval (M-51, A1–A14; A3 and A6 need explicit confirmation before release) and the F-706.9 split.
- Gotchas: planner could not read the F-706.7 plan (other branch); A11 makes the implementer compare it first. Hotspots with PR #110 (F-706.5) and #111 (F-707.1): expect a rebase. CLAUDE.md R2 still names supabase/migrations/.
