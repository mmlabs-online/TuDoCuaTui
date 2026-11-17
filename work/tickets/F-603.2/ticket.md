# F-603.2: Resize photos off the main thread for bulk import

| Field | Value |
|---|---|
| State | DONE |
| Priority | P0 |
| Size | S |
| Milestone | M1 |
| Epic | E6 — Import & Export |
| Areas | data, security |
| Gate | none |
| Depends on | F-603 |
| Needs Ming | — |
| Attempts | 1 |
| Created | 2026-11-17 |
| Claimed by | claude@2026-11-17T17:14:17Z |
| PR | — |

## Goal
Importing 30 phone photos in one go keeps the app responsive: decoding and re-encoding each photo runs in a
worker instead of the main thread. This is the second slice of F-603 (the split in `work/tickets/F-603/plan.md`).

## Feature reference
`docs/feature-list.md` F-603: "**AC:** 30 phone photos import in one go; the browser does not freeze (resize work
off the main thread if needed)." Ticket F-603 scope: "Run the resize off the main thread (`createImageBitmap` +
`OffscreenCanvas` in a worker) when supported; otherwise fall back to the main thread. The worker must be allowed
by the CSP (`worker-src`)." Decisions: D47 (HEIC: clear error only, no client decoder), D48 (EXIF/GPS removed by
re-encoding every photo in the browser through `preparePhoto`).

## Scope
- A same-origin module worker (e.g. `src/data/photoPrep.worker.ts`, loaded with
  `new Worker(new URL(..., import.meta.url), { type: "module" })`) that decodes with `createImageBitmap` and
  encodes with `OffscreenCanvas.convertToBlob({ type: "image/jpeg", quality })`, exposed as `PhotoDeps` for
  `preparePhoto`, so size steps, HEIC handling (D47) and error codes stay identical.
- Feature-detect `Worker`, `OffscreenCanvas` and `createImageBitmap`; fall back to the current main-thread deps
  when any is missing or the worker fails.
- EXIF orientation parity with the main-thread path (`imageOrientation: "from-image"`).
- CSP: add an explicit `worker-src 'self'` to `CSP_DIRECTIVES` in `server/http.js` and update the exact-directive
  test in `server/static.test.ts` (today `worker-src` falls back to `script-src`, which also allows the Turnstile
  host; no `blob:`, no `'unsafe-eval'`).

## Out of scope
- Anything in F-603.1 (runner, Photos tab, quota handling).
- A client HEIC decoder (D47); AI tagging during import (F-703).

## Acceptance criteria
- [ ] With worker support, `preparePhoto` decodes and encodes in the worker; output (JPEG ≤ 2 MiB, size steps,
      orientation, error codes) matches the main-thread path (unit tests with a fake worker / deps).
- [ ] Without `Worker`, `OffscreenCanvas` or `createImageBitmap`, or when the worker errors, it falls back to the
      main thread and still succeeds (unit tests).
- [ ] The CSP header contains `worker-src 'self'` and nothing broader (`server/static.test.ts`).
- [ ] Importing 30 phone photos shows no long task over 200 ms on the main thread (Performance trace on a
      mid-range phone, or a one-off Playwright trace with CPU throttling recorded in impl-log).
- [ ] All checks pass.

## Technical notes
- Files: `src/data/photoPrep.ts`, new `src/data/photoPrep.worker.ts`, tests next to them; `server/http.js`,
  `server/static.test.ts`.
- Risks / open questions: the CSP change is security-relevant — route to `security-ai-generated-code-auditor` at
  review; Vite must emit the worker as a same-origin `/assets/*.js` chunk; Safari's `OffscreenCanvas` support.

## Test plan
- Unit: worker deps vs main-thread deps parity; fallback paths; CSP directive test.
- Manual (Ming, after merge): bulk import of 30 photos on a phone stays responsive; Turnstile on sign-up and
  forgot-password still works with the new `worker-src`.

## Notes / answers from Ming

## Handoff
