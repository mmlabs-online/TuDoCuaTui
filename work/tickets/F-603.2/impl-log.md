## Attempt 1 — 2026-11-17

### Files touched
| File | Required because |
|---|---|
| src/data/photoScale.ts (new, 5) | One rounding rule for both paths |
| src/data/photoScale.test.ts (new, 17) | R8 |
| src/data/photos.ts (+15/-6) | `MainImage`, `mainThreadDeps`, `renderJpeg` uses `scaledSize` |
| src/data/photoPrep.ts (+38/-10) | `prepareWith`, `preparePhotoAuto`, `preparePhoto(file, deps?)`; `source` moved off `DecodedImage` |
| src/data/photoPrep.test.ts (+75) | `preparePhotoAuto` cases |
| src/data/photoWorkerHost.ts (new, 79) | Worker-side protocol, `probeEnv`, handler |
| src/data/photoWorkerHost.test.ts (new, 143) | R8 |
| src/data/photoPrep.worker.ts (new, 19) | Worker entry Vite emits |
| src/data/photoWorkerClient.ts (new, 110) | `canUseWorker`, `createWorkerDeps`, `getOffThreadDeps` |
| src/data/photoWorkerClient.test.ts (new, 187) | R8 (FakeWorker wired to the real host) |
| vitest.config.ts (+1) | Exclude the worker entry from coverage |
| server/http.js (+1) | `worker-src 'self'` |
| server/static.test.ts (+5) | Exact CSP + no blob:/data: in worker-src |

### Tests added / changed
- photoScale.test.ts: 4 cases; photoWorkerHost.test.ts: 6; photoWorkerClient.test.ts: canUseWorker (4), getOffThreadDeps null in jsdom, load/ready, scaledSize dims, ENCODE_STEPS parity, concurrent ids, ready false, 5 s timeout, error event, messageerror, release (13 total); photoPrep.test.ts › preparePhotoAuto: 6 cases; static.test.ts: 2 updated.

### Checks (actual output summary)
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` no errors
- format:check: All matched files use the correct format.
- test: Test Files 119 passed | 11 skipped (130); Tests 1495 passed | 221 skipped (1716)
- test:coverage: exit 0, all thresholds met (src/data 96.17 % stmts / 94.45 % branches)
- build: built OK; `dist/assets/photoPrep.worker-B1z90X5a.js 1.16 kB`
- AC 7: `new Worker(new URL(\`/assets/photoPrep.worker-B1z90X5a.js\`` found in dist/assets/index-*.js; `grep -c "Không"` on the worker chunk = 0

### One-off Playwright check (outside the repo, scratchpad `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-2/`)
Files: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-2/run.mjs` (driver), `serve.mjs` (static server sending the real `SPA_CSP` from server/http.js), `harness/` (throwaway Vite root, alias `@` → repo `src`, exposes `preparePhoto` and `prepareWith(file, mainThreadDeps)`), `photos/` (30 generated 4032×3024 noisy JPEGs, ~8.5 MB each, plus `orient6.jpg` with EXIF Orientation=6), output `run-output.json`.
Commands: `node_modules/.bin/vite build -c /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-2/harness/vite.config.mjs` then `node /tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/f-603-2/run.mjs` (Chromium via `require('playwright')`, CDP `Emulation.setCPUThrottlingRate {rate: 4}`, `PerformanceObserver longtask`, photos prepared sequentially, 120 ms settle after each).

| | worker (auto path) | forced main-thread baseline |
|---|---|---|
| photos | 30 | 30 |
| long tasks | 0 | 30 |
| max long task | 0 ms (none reported) | 580 ms |
| long tasks > 50 ms / > 200 ms | 0 / 0 | 30 / 30 |
| avg prepare time per photo | 179 ms | 617 ms |
| total wall time (incl. base64 transfer into page) | 139 s | 155 s |
| output | 1200×900 JPEG | 1200×900 JPEG |

- P1 pass: no long task at all with the worker at 4× throttling. P2 baseline: every main-thread photo produced a long task (max 580 ms), so the probe does detect the problem.
- P3: orientation-6 JPEG gives 900×1200 (portrait) on both the worker and main paths.
- P4: no `securitypolicyviolation` events, no console errors on either run; the worker URL observed by Playwright was `http://localhost:4599/assets/photoPrep.worker-B1z90X5a.js` (the worker path was really used; fallback cannot produce it).
- Caveats: fixtures are ~8.5 MB (plan said 3–6 MB; still under the 10 MiB input cap); total wall time is dominated by the harness pushing 8 MB base64 per photo into the page.

### Out-of-plan files
- src/App.test.tsx — its `vi.mock("@/data/photos")` lacked the new `mainThreadDeps` export that `preparePhoto` now imports, which broke "a failed photo step keeps the editor open" (mock extended with `mainThreadDeps`; no production change).

### Follow-ups (noticed, not done)
- `Editor.test.tsx` and `useWardrobe.test.tsx` also mock `@/data/photos`; they pass today, but any new `photos` export used by `photoPrep` needs adding to those mocks.
- Ming checks after merge as listed in plan.md (Turnstile, real phone, iOS < 16.4 fallback, Safari HEIC).

### Scope self-check
- Could the diff be smaller? No; every file is in the plan except the one-line mock fix.
- Diff size: tracked +136 / -19, plus ~560 lines in 7 new files (about 320 of them tests).
