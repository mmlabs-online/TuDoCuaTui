Status: READY

# Plan — T-019.13: Abuse limits before Access removal

## Feature summary
Not in `docs/feature-list.md`. This is a slice of T-019 (D31). Ticket goal: "Before Cloudflare Access is removed and
strangers can sign up and join (`join_policy = open`), a handful of accounts must not be able to lock everyone out of
AI calls or photo uploads."

Ticket scope (options): "(a) owner budget: exempt the owner `sub` from the global AI ceilings; (b) a per-IP dimension
…; (c) a shorter body deadline for photo and tag-photo uploads … / slow-sender handling; (d) keep the `tudocuatui`
join policy `closed` … until (a)–(c) land".

Ming's answers (ticket, *Notes / answers from Ming*, 2026-11-15). These are binding:
1. "**Drive: Ming's Drive for everyone** (option B), not owner-only photo storage. The consult notes this needs
   per-user quotas (umbrella A7) and a privacy notice (Ming can see users' photos) before strangers can upload; planner
   decides whether quotas fit this ticket or become a new slice that also gates T-019.9 / M-22."
2. "**Owner lane: yes**: owner exempt from the global AI ceilings and gets its own upload/tag slots; per-user limits
   still apply (R1, R2)."
3. "**Upload body deadline: 15 s total + 5 s idle** (not the recommended 10 s + 4 s)."
4. "**Join policy `open` at M-19; no per-IP limits now.** Do not run M-22 until T-019.13 is released (R7 as a
   ming-todo note)."

Ticket *Out of scope*: "Per-user quotas on item/photo counts or Drive bytes (separate follow-up, umbrella A7)."
Umbrella `work/tickets/T-019/plan.md` A7: "Per-user quotas (items, photo bytes) are out of T-019 … Ming may make M-21
[now M-22] wait for the quota ticket (security calls quotas mandatory with open join + his Drive)."

**Options chosen:** (a) as an owner lane on the AI ceilings **and** on the in-flight slots (Ming 2); (c) with 15 s total
plus 5 s idle (Ming 3); `TUDO_OWNER_SUB` required in identity mode (consult R4, needed by the owner lane). Not chosen:
(b) per-IP (Ming 4), (d) `closed` (Ming 4; it becomes a ming-todo ordering note), consult R5 owner-only photos (Ming 1).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | "With the chosen options, N cooperating accounts cannot make the owner's AI calls or photo uploads fail (tests per option)." TuDo's own limits are the scope here; see A4 for the shared Drive quota. | **AI ceilings:** `server/ai/rateLimit.test.ts` › "owner passes when N other users have filled the global ceiling" (each kind: test, save, tag), "owner calls are not counted toward the global ceiling", "owner still gets 429 at its own per-user limit". **Slots:** `server/inflight.test.ts` › "exempt user acquires while the total is full", "exempt user does not count toward total", "exempt user still limited by perUser". **Over HTTP:** `server/isolation.db.test.ts` › "owner photo PUT succeeds while B and C hold every non-owner slot"; `server/ai/tagPhoto.test.ts` › "owner tag-photo is accepted while two other users hold both shared slots". **Config:** `server/auth.test.ts` + `server/index.cli.test.ts` › identity mode without / with malformed / nil `TUDO_OWNER_SUB` → exit 2, value never printed. |
| 2 | "Slow uploads cannot hold every upload / tag slot for the full deadline (test)." | `server/photos.test.ts` (`readBody`) › "no bytes for idleMs → 408 request_timeout", "drip-feed under idleMs is cut at totalMs → 408", "a steady upload that ends before totalMs → ok"; `server/api.test.ts` › "two slow photo PUTs by one user → 408 at the idle timeout and both slots are free again (third PUT is not 503)"; `server/ai/tagPhoto.test.ts` › "slow tag-photo body → 408 at idle, slot released". Together with AC1 slot tests: slow senders free slots after 5 s idle / 15 s total (not 30 s) and never take the owner's slots. |
| 3 | "All checks pass." | `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build` green in CI; `scripts/check-image.sh` (CI image job) green with the new identity-without-owner `expect_exit 2` and the owner added to the identity smoke. |

## Ming verification after merge
- At M-21 (switch to identity): the release compose already sets `TUDO_OWNER_SUB` (`x-owner-sub`, compose.yml:36/48).
  If it is empty, the app now exits 2 in identity mode too. The startup log line `auth: identity` confirms it started.
- Optional: after the release, upload a photo from a phone on mobile data. It should still succeed (the 15 s / 5 s
  limits are generous for ~150–400 KB uploads, consult F6). If uploads on a poor connection now fail with "Tải ảnh quá
  lâu, thử lại nhé", report it. The fix is to raise the constant.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `server/ai/rateLimit.js` | `createLimiter({ now, ownerSub })`: the owner skips the global check and is never pushed to `global`; per-user `LIMITS` still apply to the owner | AC1, Ming 2, consult R1 |
| `server/inflight.js` | `createInFlight({ perUser, total, exempt })`: the exempt user ignores `total` and is not counted in it; `perUser` still applies | AC1, Ming 2, consult R2 |
| `server/photos.js` | remove the module-level `photoSlots`; `handlePhoto` takes `photoSlots` and `bodyTimeouts` from ctx; `readBody(req, { totalMs, idleMs })` with an idle timer reset on every chunk; `BODY_DEADLINE_MS` 30 s → `BODY_TIMEOUTS = { totalMs: 15_000, idleMs: 5_000 }` | AC1, AC2, Ming 3, consult F2/R3 |
| `server/ai/tagPhoto.js` | pass `ai.bodyTimeouts` (or ctx) to `readBody` | AC2 |
| `server/ai/routes.js` | `AiContext` typedef only: add `bodyTimeouts` if carried in the AI context | typecheck |
| `server/app.js` | new deps `ownerSub = null`, `bodyTimeouts = BODY_TIMEOUTS`; `createLimiter({ now, ownerSub })`; `tagSlots: createInFlight({ perUser: 1, total: 2, exempt: ownerSub })`; `photoSlots = createInFlight({ perUser: 2, total: 3, exempt: ownerSub })` per app; pass both into `handleApi` | AC1, consult F2 (singleton into `createApp`) |
| `server/api.js` | forward `photoSlots` and `bodyTimeouts` to `handlePhoto` (and `bodyTimeouts` to `handleTagPhoto` if not in the AI context) | wiring |
| `server/auth.js` | identity branch reads `TUDO_OWNER_SUB` (required, `toUserId`, `AuthConfigError` "TUDO_OWNER_SUB must be set" / "must be a valid UUID", never the value); identity config carries `ownerSub`; export `ownerSubOf(cfg)`; fix the header comment | AC1 config, consult R4 |
| `server/index.js` | `createApp({ …, ownerSub: ownerSubOf(authConfig) })` | wiring |
| `server/README.md` | env table: `TUDO_OWNER_SUB` required in both modes and used for the owner lane; `TUDO_AUTH_MODE` row no longer says identity ignores it; limits text: owner lane, slots, 15 s total + 5 s idle → 408 `request_timeout` | docs |
| `scripts/check-image.sh` | add `expect_exit 2 "identity mode without TUDO_OWNER_SUB"`; add `-e TUDO_OWNER_SUB=<dummy>` to the identity smoke `docker run` (line ~161) | AC3 (otherwise the identity smoke exits 2) |
| `server/ai/rateLimit.test.ts`, `server/inflight.test.ts`, `server/photos.test.ts`, `server/api.test.ts`, `server/ai/tagPhoto.test.ts`, `server/isolation.db.test.ts`, `server/auth.test.ts`, `server/index.cli.test.ts`, `server/app.test.ts` (only if it asserts identity config shape) | tests below; update the identity fixtures that now need an owner (`auth.test.ts` `ID`, `index.cli.test.ts` "production identity needs no … owner") | R8, AC1–AC3 |

`deploy/deployment-repo/apps/tudocuatui/compose.yml` is **not** changed: it already passes `TUDO_OWNER_SUB` to the app
(line 48). `src/` is not changed: `request_timeout`, `photos_unavailable` and `ai_busy` already have Vietnamese copy
(`src/data/apiErrors.ts:19,21`, `src/features/settings/copy.ts:58,60`).

## Tests to write
| Test (file › name) | Covers |
|---|---|
| `server/ai/rateLimit.test.ts` › for each kind: N users fill `GLOBAL_LIMITS[kind]`, other user → false, owner → true | AC1 (a) |
| `server/ai/rateLimit.test.ts` › owner makes `LIMITS[kind].max` calls; other users can still make exactly `GLOBAL_LIMITS[kind].max` | AC1, owner not counted |
| `server/ai/rateLimit.test.ts` › owner → false at `LIMITS[kind].max` (per-user still applies); window expiry frees it | Ming 2 "per-user limits still apply" |
| `server/ai/rateLimit.test.ts` › `ownerSub` unset → behaviour identical to today (existing tests unchanged) | regression |
| `server/inflight.test.ts` › total full (non-exempt) → exempt `tryAcquire` returns a release; `total()` unchanged | AC1 (slots) |
| `server/inflight.test.ts` › exempt holds `perUser` → its next acquire null; others still get `total` slots | AC1, Ming 2 |
| `server/inflight.test.ts` › exempt release is idempotent and does not change `total()` | correctness |
| `server/photos.test.ts` › `readBody` with `{ totalMs: 200, idleMs: 50 }` on a `PassThrough` req: no data → 408 `request_timeout` at ~50 ms | AC2 idle |
| `server/photos.test.ts` › chunks every 20 ms (under idle), never ending → 408 at ~200 ms | AC2 total (slowloris drip) |
| `server/photos.test.ts` › chunks every 20 ms ending at ~100 ms with a matching `content-length` → ok, bytes intact | no false positives |
| `server/api.test.ts` › createApp with short `bodyTimeouts` + fake pool + stub drive: user holds 2 PUTs that send 10 of 1000 bytes → both 408; a third PUT then gets past the slot check (not 503) | AC2, slot released after timeout |
| `server/ai/tagPhoto.test.ts` › slow tag-photo body with short `bodyTimeouts` → 408, the same user's next call is not `ai_busy` | AC2 (tag) |
| `server/ai/tagPhoto.test.ts` › `headerAuth` + `ownerSub: OWNER_A`: B and C hold both shared tag slots (held bodies) → A's request is accepted (200 suggestion); a fourth user (if a helper exists, else B again) → 503 `ai_busy` | AC1 (tag slots) |
| `server/isolation.db.test.ts` › createApp with `ownerSub: OWNER_A`: B holds 2 and C holds 1 photo PUT (the existing `hold` helper) → A's photo PUT → 200; B's third → 503 `photos_unavailable` | AC1 (photo slots, over HTTP) |
| `server/auth.test.ts` › identity mode: missing / blank `TUDO_OWNER_SUB` → `AuthConfigError` "must be set"; malformed / nil → "must be a valid UUID", value not in the message; valid → `ownerSubOf(cfg)` is the canonical id; access mode `ownerSubOf` → `access.ownerSub` | consult R4 |
| `server/index.cli.test.ts` › the existing "production identity needs no … owner" becomes: identity with `TUDO_OWNER_SUB: ""` → exit 2 "TUDO_OWNER_SUB must be set"; with `SECRETISH-…` → exit 2, not printed; with a valid owner → starts, `/healthz` `{auth:"identity"}`, `/api/items` 401 | consult R4, AC3 |

## Approach
1. **Owner sub in identity mode (R4).** In `loadAuthConfig`, after `loadIdentityConfig(env)` (issuer errors keep their
   current messages and precedence), validate `TUDO_OWNER_SUB` with `toUserId`. Missing or blank: "TUDO_OWNER_SUB must
   be set". Malformed or nil: "TUDO_OWNER_SUB must be a valid UUID". Use `AuthConfigError` (already caught by
   `index.js` → exit 2) and never put the value in a message. The helper is a small local copy of `access.js`'s
   `loadOwnerSub`, so T-019.9 can delete `access.js` without moving code. Add `ownerSubOf(cfg)`. The `auth: identity`
   log line stays the same and never prints the owner.
2. **Owner lane on the AI ceilings (R1).** In `check()`: when `userId === ownerSub`, skip the global comparison and the
   `global[kind].push`. The per-user window is unchanged. `ownerSub` is a `UserId` from config, never from the
   request; the comparison is between two canonical strings (both come from `toUserId`).
3. **Owner lane on slots (R2).** `createInFlight({ perUser, total, exempt = null })`. The exempt user's acquire checks
   only `perUser` and does not touch `all`. Its release must not decrement `all`. Record exemption per acquisition so
   release is symmetric. `createApp` builds `photoSlots` (2/user, 3 shared) and `tagSlots` (1/user, 2 shared), both
   with `exempt: ownerSub`. This removes the `photos.js` module singleton (consult F2), so every test app gets fresh
   slots. Worst case in memory: (3 + 2 + 2 + 1) × 2 MiB = 16 MiB (consult R2).
4. **Body deadline (R3, Ming's numbers).** `readBody(req, { totalMs = 15_000, idleMs = 5_000 } = {})`: one total timer
   plus one idle timer that is re-armed on every `data` chunk. Both resolve 408 `request_timeout` through the existing
   `finish`, and both timers are cleared in `finish`. The callers keep their current `rejectUnread` path for 408, which
   closes the socket. The `finally` already releases the slot. Timeouts come from `createApp` deps so tests can pass
   small values. Production uses the exported defaults. The client already shows "Tải ảnh quá lâu, thử lại nhé".
5. **Docs and image check.** Update the README rows and add the `check-image.sh` lines.
6. **Orchestrator actions (not the implementer's diff).** At plan approval:
   - Add to `work/ming-todo.md` under M-22: "Do not run M-22 until T-019.13 **and T-019.14** are released, and T-019.10
     (with the photo privacy notice) is released. If Access must go earlier, register `tudocuatui` with
     `join_policy = closed` and amend D31." This is Ming's R7 note, extended by the split below.
   - Create T-019.14 from *Split proposal*.
   - Add T-019.14 to the `Depends on` of T-019.9.
   - Add the privacy-notice AC to T-019.10.
   - Record D38: "Owner lane and upload deadlines: the owner `sub` (`TUDO_OWNER_SUB`, required in both auth modes) is
     exempt from the global AI ceilings and has its own upload/tag slots; per-user limits still apply; photo and
     tag-photo bodies are cut at 15 s total / 5 s idle; no per-IP limits; join policy `open`; photos of every user
     stay in Ming's Drive (D27) with per-user quotas (T-019.14) and a privacy notice (T-019.10) before M-22."

Rules: R1 holds because this is a server-only change and local mode and the SPA are untouched. R2: no migration. R3:
`TUDO_OWNER_SUB` is not secret and is not a `VITE_*` variable. R4: the photo path and bucket rules are unchanged. R6:
there is no new UI copy. R7: the consult R8 follow-ups stay out (photo GET in-flight cap, Node
`headersTimeout`/`requestTimeout`, Drive `appProperties.userId`, `photos_not_enabled`, A7 quotas → T-019.14). R8: unit
and HTTP tests above. R9 and R10 do not apply. Size: about 120 lines of code and docs plus about 150 lines of tests,
under the ~400-line guide.

## Specialist input used
`consult-software-architect.md`:
- **Adopted:**
  - R1, the owner lane on the global AI ceilings. Ming answer 2.
  - R2, the owner lane on slots, plus moving `photoSlots` into `createApp` (F2).
  - R3, idle plus total body deadline with 408 and injectable parameters. The numbers are Ming's (15 s + 5 s), not the
    recommended 10 s + 4 s.
  - R4, `TUDO_OWNER_SUB` required in identity mode, and no `tudocuatui:owner` role (A11).
  - R6, no per-IP limits (Ming 4).
  - R7, the ming-todo note, extended with T-019.14 and T-019.10 (step 6).
- **Rejected:** R5 (owner-only photo storage), because Ming chose option B.
- **Deferred:** the R8 follow-ups stay out of scope, as asked. Per-user quotas become T-019.14 (see split).
- **Risks taken over:**
  - Cloudflare may already buffer bodies. If so, (c) is extra defence; it is unmeasured.
  - Non-owners can still lock each other out of the shared slots and ceilings. This is accepted: AC1 protects the
    owner only, and T-019.14 bounds each user's volume.
  - The owner account becomes the most valuable one to steal. Mitigations: per-user limits still apply, and tokens
    last 15 minutes.

## Assumptions
- **A1. Quotas are a separate slice (T-019.14).** It is not in this ticket, for these reasons:
  1. The ticket's own *Out of scope* line excludes it, and so does umbrella A7.
  2. It solves a different problem: storage volume in Ming's Drive, not availability for the owner. It is independent
     of the code here, so the two slices can merge in either order.
  3. It needs numbers Ming has not set yet (defaults proposed below), and Ming can tune them without re-opening this
     ticket.
  4. Together the two would be close to the ~400-line guide and mix two review concerns.
  The smallest correct form needs **no migration**. `putPhoto` replaces an item's photos, so a user's stored photos
  equal the rows in `item_photos`. Uploads are capped at 2 MiB (`MAX_BYTES`), so a count cap also bounds bytes
  (cap × 2 MiB). A byte column is not needed.
- **A2. The privacy notice goes with T-019.10 (join UX), not here.** It is UI copy that must be seen at the moment a
  stranger joins. This ticket is server-only and has no screen to put it on. Adding a screen here would pull in UI
  review (R6, R9) and is not trivial. Proposed copy for T-019.10 (Ming may edit): *"Ảnh bạn tải lên được lưu trong
  Google Drive cá nhân của Ming (người vận hành TuDo), và Ming có thể xem được. Đừng tải lên ảnh có thông tin nhạy
  cảm."* It goes on the join screen before "Tiếp tục với <email>", with the same copy in Settings or near the photo
  picker if T-019.10's plan finds that cheap. Strangers can reach TuDo only after M-22, so gating M-22 on T-019.10
  (step 6) is enough.
- **A3. M-22 ordering.** M-22 waits for T-019.13, T-019.14 and T-019.10 to be released. T-019.9 depends on T-019.14.
  Until M-22, Access still admits only allowed emails, so none of these risks is reachable today (ticket *Feature
  reference*).
- **A4. The shared Drive rate limit can still fail the owner's upload, and this is accepted here.** All users write
  through one Drive client and one Google project. Others' traffic could therefore use up Drive's per-user or
  per-project rate limits, and the owner's `createFile` would then return `photo_upload_failed`. This ticket handles
  it as follows:
  - `drive.js` already retries `drive_rate_limited` (429, or 403 `rateLimitExceeded`/`userRateLimitExceeded`) with
    backoff.
  - TuDo's own non-owner write concurrency is capped at 3 in flight, which is a few writes per second at most and far
    below Google's documented per-user limits. T-019.14's daily per-user upload count bounds it further.
  - Photo GETs have no in-flight cap. That is consult R8, a follow-up, and the residual risk is mostly there.
  AC1 is therefore verified for TuDo's limits (ceilings and slots). Drive-side quota exhaustion by others is a
  documented residual risk, not tested. If it shows up in logs (`photo_upload_failed` / `drive_rate_limited` for the
  owner), the follow-up is the photo GET cap plus a non-owner Drive request budget.
- **A5. Owner identity.** In access mode every request is already the owner, so the global ceilings stop mattering
  there. That is intended (single user under Access). In identity mode the owner is whoever's verified `sub` equals
  `TUDO_OWNER_SUB`. A wrong value hands the owner lane to another account; the M-21 check (owner sees their wardrobe)
  catches this.
- **A6. Error codes unchanged.** Idle and total timeouts both return 408 `request_timeout`, and busy slots still return
  503 with `Retry-After: 5`. The client copy already exists.
- **A7. Hotspots.**
  - T-019.9 (BACKLOG) will edit `server/auth.js`, `server/index.js`, `scripts/check-image.sh` and `server/README.md`.
  - F-701.1 (BACKLOG) may edit `server/ai/tagPhoto.js` and `server/ai/routes.js`.
  - No ticket in `IN_PROGRESS`, `REVIEW` or `DONE` other than the T-019 umbrella touches these files. `src/App.tsx` is
    not touched.

## Blocking questions
None. The quota numbers in T-019.14 below are proposed defaults that Ming can change when he approves that ticket's
plan.

## Split proposal
This plan covers T-019.13 as described above. **New slice proposed: T-019.14.** The orchestrator creates the ticket.

**T-019.14: Per-user photo quotas (Ming's Drive for everyone).** Size S. Priority P1. Areas: security, data.
Tier/Gate: High (security, abuse limits) / plan-approval. Depends on: T-019.5 (it can run in parallel with T-019.13;
both touch `server/photos.js` and `server/app.js`, so whichever merges second rebases). Gates: T-019.9 (add to its
`Depends on`) and so M-22. Feature reference: umbrella A7; T-019.13 plan A1; Ming 2026-11-15 answer 1.
- **Goal.** Before strangers can upload, one account cannot fill Ming's Drive or flood it with writes.
- **Scope:**
  1. **Stored-photo cap per user,** counted from `item_photos where user_id = $1` inside the existing
     `withLockedItem` transaction in `putPhoto`. A replacement on an item that already has a photo does not count as
     an extra photo. At the cap the server returns 403 or 409 `photo_quota_exceeded` and makes no Drive `createFile`.
     Count the photos before the Drive write, so a refused upload costs no Drive call. Proposed default: **500 photos
     per user**, which is about 1 GiB worst case and about 200 MB typical.
  2. **Daily upload count per user:** an in-memory rolling 24 h window (same pattern as `createLimiter`). A restart
     resets it, which is accepted. At the cap the server returns 429 `rate_limited`, checked before the body is read.
     Proposed default: **50 uploads per user per 24 h**.
  3. **Owner:** proposed exempt from the stored cap (it is his Drive) and subject to the daily count only if Ming
     wants it. The default is exempt from both. The owner sub comes from `createApp({ ownerSub })` (T-019.13).
  4. **Copy:** Vietnamese copy for the new code in `src/data/apiErrors.ts` (R6).
  5. **Docs:** a README note.
- **Out of scope:**
  - Item-row caps, tag-photo quotas (they store nothing and use the caller's key) and byte accounting (not needed;
    see A1).
  - Per-user Drive folders and `appProperties.userId`.
  - The privacy notice (T-019.10).
- **Acceptance criteria:**
  1. A non-owner at the stored cap gets the quota error and the fake Drive sees no `createFile`. Replacing an existing
     photo at the cap still works.
  2. A non-owner over the daily count gets 429 before the body is read.
  3. The owner is not limited (per the chosen default).
  4. Two users' counts are independent (db test).
  5. The UI shows the Vietnamese copy for the new code.
  6. All checks pass.
