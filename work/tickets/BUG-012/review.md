## Attempt 1 — 2026-11-21
Verdict: REWORK

The BUG-012 code change has no defect found in review. The verdict is REWORK only because the required `pnpm test`
check is red. That failure already exists on `origin/main` and this branch does not cause it (Issue 1).

### Checks (run by reviewer)
Native WSL copies of `HEAD` (ef12b2a) and `origin/main` (074ae11), Node 22.23.5, pnpm 10.34.9,
`pnpm install --frozen-lockfile`, only `.env.example` present, CI not set.
- `pnpm format:check` — pass (exit 0, 336 files).
- `pnpm typecheck` — pass (exit 0, app + server).
- `pnpm build` — pass (exit 0).
- `pnpm test` — **FAIL** (exit 1) in 3 of 3 runs: 1960 passed, 222 skipped (DB suites), 1 failed
  (`ItemGrid.test.tsx` > `without IntersectionObserver shows a "Xem thêm" button that adds 12`, "Test timed out in
  5000ms").

Full-suite comparison, same command, runs alternated between the two copies:

| Run | `origin/main` | `ticket/BUG-012` |
|---|---|---|
| 1 | ItemGrid timeout (6583ms) + `server/ai/tagPhoto.test.ts` "413 for a streamed body" (`fetch failed`) | ItemGrid timeout (5496ms) |
| 2 | ItemGrid timeout (6301ms) | ItemGrid timeout (6329ms) |
| 3 | ItemGrid timeout (5949ms) | ItemGrid timeout (6567ms) |
| ItemGrid file alone | pass (test 1540ms) | pass (test 1581ms) |
| Full suite, `--testTimeout=30000` (diagnostic only) | ItemGrid pass (6477ms); 1 other failure, see below | **exit 0, 1961 passed, 222 skipped**; ItemGrid pass (6379ms) |

Conclusions:
- The ItemGrid failure is **pre-existing**: it fails on `origin/main` under the same command, 3 of 3.
- **This branch does not cause it**: the failure and its duration range are the same on both sides, and the branch
  does not touch `ItemGrid` or its test.
- It is **not an intermittent flake in this environment**: 6 of 6 full-suite runs failed. The test needs about 6s under
  full-suite load against a 5s limit, and about 1.5s alone. `impl-log.md`'s "flaky" label is not supported.
- Two other failures appeared once each, on `origin/main` only: `tagPhoto.test.ts` (run 1; passed 5 of 5 alone) and
  `server/photos.test.ts` "drip-feed under idleMs is cut at totalMs" (diagnostic run; elapsed time was `-363999`, which
  suggests the clock moved backwards during the run). Their cause was not established. Neither appeared on this branch,
  which does not touch `server/`.

### Acceptance criteria
- [x] 1. Regression test fails before the fix and passes after — evidence: the branch's three test files on `origin/main`
  production code give 8 failed / 109 passed, including T1 (`expected [ 'season', 'hot', 'rain' ] to not include
  'season'`) and T2 (`expected 'Mùa Đông' to be 'Trời nóng'`). On the branch: 117 of 117 pass. Matches impl-log.
- [x] 2a. Hot weather heading is "Trời nóng" — T2, T11; `OutfitsModal.tsx:235`, `copy.ts` `heading`.
- [x] 2b. Cold weather heading is "Trời lạnh" — T3, T11.
- [x] 2c. Off, failed, mild and rain-only keep "Mùa {calendar}" — T4, T5, T6.
- [x] 2d. No "Hợp mùa Đông" chip on a hot day; chip follows the seasons used — T1, T7, T8, T9; `suggest.ts:175`,
  `OutfitsModal.tsx:269-273`.
- [x] 2e. AI request unchanged — T10 and the existing AI request test; `OutfitsModal.tsx:140-141` is not in the diff.
- [ ] 3. All checks pass — FAILED, see Issue 1.

Ming verification after merge (not verified here): on production, open "Hôm nay mặc gì?" and choose a city whose max
today is at least 32°C. The heading reads "Trời nóng".

### Issues
#### Issue 1 — 🔴 blocker — required check is red (pre-existing on main)
- **Where**: `src/features/items/ItemGrid.test.tsx:89`
- **Expected**: `pnpm test` exits 0 (acceptance criterion 3, rule R8).
- **Actual**: the test exceeds Vitest's default 5000ms limit in every full-suite run, on both `origin/main` and this
  branch.
- **Fix instruction**: do **not** fix this on `ticket/BUG-012`: the file is outside the plan (R7). The orchestrator
  should raise it with Ming and choose one:
  1. Default: land a separate small ticket that gives this test an explicit timeout (for example 15000ms as the third
     argument of `test(...)` at line 89), merge it, rebase `ticket/BUG-012`, and re-run the review. No BUG-012 production
     code needs to change.
  2. Ming explicitly accepts this known baseline failure for BUG-012. A reviewer cannot grant that waiver.

#### Issue 2 — 🟡 should-fix — plan gate conflict is unresolved
- **Where**: `work/tickets/BUG-012/plan.md:129-132`, `work/tickets/BUG-012/ticket.md:8,11`
- **Expected**: the conflict flagged in A8 is resolved and recorded before implementation.
- **Actual**: the ticket is P1 with `Gate: none`, and *Notes / answers from Ming* is empty. Workspace `CLAUDE.md` §8 lists
  plan approval for P1 tickets. `.claude/loop.config.md` uses the `high-paths` policy, under which this ticket is not
  gated because it touches no High path.
- **Fix instruction**: the orchestrator asks Ming in the same message as Issue 1 whether this plan needs approval, and
  records the answer in `ticket.md`. No code change.

### Rules (CLAUDE.md)
- R8: the "no PASS without green checks" condition is not met (Issue 1). The cause is not in this diff.
- Workspace §8: see Issue 2.
- R1, R5, R6, R7: no violations found. All changed source files are in the plan's file list. No High path changed.
- R9: no CSS or structure change; the heading keeps its element and class. "Trời nóng" and "Trời lạnh" are one character
  longer than "Mùa Đông" (the plan says shorter or equal), which is negligible for a short heading. Not run in a browser.

### Blockers from review agents
None. No review trigger matches the changed paths.

### Nits (do not block)
- 💭 `OUTFITS_COPY.season` (`copy.ts:10`) is now used only by `copy.test.ts`. The plan requires that test to stay, so
  removal belongs to a later tidy-up.
- 💭 The plan said existing assertions stay unchanged, but "cold weather adds Khoác in July" went from 3 to 4 matches.
  This is disclosed in impl-log and is a direct result of criterion 2b, so it is accepted.

### Follow-ups (out of scope)
- Raise the `ItemGrid.test.tsx:89` timeout or make the test cheaper (Issue 1).
- Investigate the single failures of `server/ai/tagPhoto.test.ts` and `server/photos.test.ts` seen on `origin/main`.
- A1: the AI prompt can still read "season winter … hot=true", so a free-text AI reason could mention winter.
- A5: regional seasons for warm southern November days (debt issue proposed by the plan).
