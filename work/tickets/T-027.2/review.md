Verdict: PASS

## Attempt 1 — 2026-11-18

### Checks (run by reviewer)
- `pnpm typecheck`: `tsc --noEmit && tsc -p tsconfig.server.json`, exit 0, no errors.
- `pnpm format:check`: exit 0 ("Finished in 34ms on 304 files"; the "No config found" notice was already there before this ticket).
- `pnpm test`: Test Files 121 passed | 11 skipped (132); Tests 1586 passed | 221 skipped (1807). Exit 0, the same counts as impl-log.
- `pnpm build`: built in 397ms, exit 0. `dist/assets/photoPrep.worker-D_qeP6FA.js` (1.52 kB) is emitted, and `grep -c "Không"` on it returns 0, so the worker chunk still has no copy.

### Real-browser check (reviewer, Playwright Chromium, one-off script outside the repo)
I built a harness from this branch's `src/` with Vite. It exposes `preparePhoto` (auto: worker first, then main thread) and `prepareWith(f, mainThreadDeps)`. It is served with the production `SPA_CSP`, and each case runs in a fresh page. Script and output: `/tmp/claude-0/-home-user/d13078d4-3bc7-5f58-a1a9-b661b3f23890/scratchpad/rev-t0272/run.mjs`, `run-output.json`.

| Input | Auto (worker) | Main thread | Tab |
|---|---|---|---|
| p00.jpg, a real 12 MP phone JPEG (4032×3024, 8.5 MB) | ok, 1200×900, 619 KB. The worker was spawned and `getOffThreadDeps()` is still non-null afterwards | ok, 1200×900 | alive, no crash |
| ok48mp.png, a valid 8000×6000 PNG under the cap | ok, 1200×900 | ok | alive |
| huge30k.png, a valid 30000×30000 PNG (900 MP, 875 KB file) | `tooManyPixels` in 109 ms with "Ảnh có độ phân giải quá lớn (tối đa khoảng 50 MP) — hãy chọn ảnh nhỏ hơn". Worker still healthy | `tooManyPixels` in 102 ms | alive |
| sof20k.jpg, a phone JPEG whose SOF claims 20000×20000 | `tooManyPixels` | `tooManyPixels` | alive |
| sof20k-padded.jpg, the same file with 590 KB of APP2 before the SOF (the header check returns `null`) | `tooManyPixels`, caught by the post-decode check | `tooManyPixels` | alive |

None of the cases produced a console error or a CSP violation.

### Acceptance criteria
- [x] A broken worker is terminated: `photoWorkerClient.test.ts` › `markBroken terminates the worker once (ready ok:false, ready timeout, error, messageerror, request timeout)` passes with `terminated === 1` in every case, including error followed by messageerror. `markBroken` is idempotent (`photoWorkerClient.ts:41-58`: it returns early when broken, clears every request timer, and wraps `terminate()` in try/catch).
- [x] A request with no answer within the timeout falls back to the main thread and still succeeds, with fake timers. Two tests cover it: › `a load with no answer within 20 s falls back to main deps and succeeds` (the worker ends broken and terminated, and the main deps resolve) and › `a late reply after the request timeout is ignored`. › `an answered request clears its timeout` also passes. Late replies are ignored three ways: `state.broken` is checked first (`:62`), unknown ids hit `if (!p) return` (`:70`), and the terminated worker sends nothing more.
- [x] An image over the pixel cap is rejected with a clear error on both paths, and nothing is uploaded:
  - The header check runs before `deps.load` (`photoPrep.ts:128-129`). The post-decode check runs inside the `try/finally`, so release happens exactly once (`:137`).
  - `tooManyPixels` is in `DETERMINISTIC` (`:153-158`), so it is not retried on the main thread.
  - Tests: `photoPrep.test.ts` › header reject (load not called), the boundary at `MAX_PIXELS`, decoded reject (render not called, release once), and `tooManyPixels from the worker is not retried on main deps` (`main.load` not called). `photoWorkerClient.test.ts` › worker deps over `MAX_PIXELS` posts only `["load","release"]`. `repo.http.test.ts` › `a photo over the pixel cap throws before any request` (`fetch` is never called).
  - The copy lives in `copy.ts:21`, as R6 requires.
  - The browser run above confirms it on both paths.
- [x] Malformed messages are ignored without throwing:
  - Host side: `isWorkerRequest` (`photoWorkerHost.ts:18-35`) requires an object, an integer id, and an `op` from a closed set. `load` must carry a Blob; `render` must have a finite `max > 0` and `0 < quality ≤ 1`. Release only happens on an explicit `op === "release"` (`:114`).
  - Client side: `isWorkerReply` (`:38-50`), and `render` checks `instanceof Blob` (`photoWorkerClient.ts:107`).
  - Tests pass: `photoWorkerHost.test.ts` › malformed requests, unknown op does not release, `isWorkerReply` shapes; `photoWorkerClient.test.ts` › malformed replies (a valid reply still resolves afterwards), render without Blob.
- [x] A `.heic` file with an empty MIME type gets the HEIC handling:
  - `withPhotoType` (`photoPrep.ts:58-65`) only rewrites an empty or `application/octet-stream` type, so files that already have a type come back as the same object.
  - `photoImport.ts:221` wraps the file before `createUrl`.
  - Tests: `photoPrep.test.ts` › `withPhotoType …` (3 tests) and the empty-type `.HEIC` → `heicUnsupported` test; `photoImport.test.ts` › `.heic` with empty MIME reaches `createUrl` typed `image/heic`.
- [x] All checks pass (see above).

Header parser safety (`imageHeader.ts`):
- Every typed-array read is either bounds-checked or reads `undefined`, which becomes 0 under the bitwise operators. Nothing can throw, and the whole parser is also wrapped in try/catch.
- The JPEG walk always moves forward: fill bytes +1, standalone markers +2, other segments `2 + len` with `len ≥ 0`, so there is no infinite loop. It stops at SOS/EOI or the end of the buffer, and the SOF read is guarded by `i + 9 > length`.
- The PNG and WebP offsets match the specs (VP8 at 26/28 & 0x3fff, VP8L at 21–24 +1, VP8X u24 at 24/27 +1).
- The input is capped at 512 KiB, so the work is bounded.

D47 holds: HEIC is not parsed and there is no decoder. D48 holds: every output still goes through the re-encode loop.

### Issues
None.

### Rules (CLAUDE.md)
No violations found.
- R1: no new data access.
- R3: nothing secret.
- R6: the copy is only in `copy.ts`, and the worker chunk has none.
- R7: every changed file is in the plan's file list.
- R8: tests cover the new pure logic.
- R9: no UI change.

No High paths were touched.

### Blockers from review agents
None at the time of writing. The security auditor runs in parallel, and the orchestrator copies in any 🔴 it finds.

### Nits (do not block)
- 💭 A JPEG whose SOF sits beyond the first 512 KiB, for example behind padded APP segments, gets no verdict from the header check. It is caught only after `createImageBitmap` has decoded it in the worker. Chromium survived the 20000×20000 case and the post-decode check rejected it. A low-memory phone could still kill the worker on such a file; it would then be marked broken and retried on the main thread, where `<img>` gives dimensions without a canvas draw. Accepted by the plan ("`null` → post-decode").
- 💭 On a worker `ok:false` reply, the client now rejects with a generic `Error` instead of the reply object. This has no effect on behaviour (`prepareWith` maps every rejection).

### Ming verification after merge
None required. Optional: on Chrome/Windows, bulk-import a `.heic` and check that the HEIC message appears instead of "Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC".

### Follow-ups (out of scope)
- Optionally make the JPEG header scan skip APPn segments past `HEADER_BYTES`, either by reading more on demand or by reading the segment lengths through `file.slice`, so that padded JPEGs also get a pre-decode verdict.
- A huge HEIC is caught only after decoding (D47, Safari only).
