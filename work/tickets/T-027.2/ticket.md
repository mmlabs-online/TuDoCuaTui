# T-027.2: Harden the photo worker

| Field | Value |
|---|---|
| State | IN_PROGRESS |
| Priority | P2 |
| Size | S |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data, security |
| Gate | none |
| Depends on | F-603.2 |
| Needs Ming | — |
| Attempts | 0 |
| Created | 2026-11-18 |
| Claimed by | claude@2026-11-18T03:17:28Z |
| PR | — |

## Goal
Photo preparation never hangs, leaks memory or crashes the tab on a hostile or broken image, on both the worker
and the main-thread path. Follow-ups from F-603.2 and F-603 (split of T-027).

## Feature reference
Not a feature-list item: hardening of F-202.1 / F-603.2 (`preparePhoto`). Sources:
`work/tickets/F-603.2/security-review.md` (🟡 1–4), `work/tickets/F-603.2/review.md`, `work/tickets/F-603/impl-log.md`
(HEIC follow-up). Decisions D47 (HEIC clear error only), D48 (re-encode every photo).

## Scope
- Terminate the worker when it is marked broken, so nothing it decodes afterwards stays in memory.
- A per-request timeout after the `ready` handshake: a hung request falls back to the main thread.
- A pixel cap (about 50 MP) checked before or right after decoding, on both paths, with a clear Vietnamese error.
- Validate message shape on both sides (`typeof m === "object"`, explicit `op === "release"`).
- A HEIC file with an empty MIME type (Windows) is still recognised as HEIC by its extension.

## Out of scope
- A client HEIC decoder (D47); CSP changes.

## Acceptance criteria
- [ ] A broken worker is terminated (unit test with a fake worker).
- [ ] A request with no answer within the timeout falls back to the main thread and still succeeds (fake timers).
- [ ] An image over the pixel cap is rejected with a clear error on both paths, and nothing is uploaded (unit tests).
- [ ] Malformed messages are ignored without throwing (unit tests).
- [ ] A `.heic` file with an empty MIME type gets the HEIC handling (unit test).
- [ ] All checks pass.

## Technical notes
- Files: `src/data/photoWorkerClient.ts`, `photoWorkerHost.ts`, `photoPrep.ts`, `photos.ts`, tests.
- Areas include `security`: route to `security-ai-generated-code-auditor` at review.

## Test plan
- Unit with fakes. Manual: none.

## Notes / answers from Ming

## Handoff
