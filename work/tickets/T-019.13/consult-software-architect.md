# Consult — software-architect — T-019.13 (2026-11-15)

**Bottom line:** do (a) + an owner lane on upload/tag slots, do (c), keep photo storage owner-only until Ming decides on storage; no (b); (d) only as a fallback (a ming-todo note).

## Findings
1. **F8 shared AI ceilings** (`server/ai/rateLimit.js:19-23`: test 300/h, save 600/h, tag 2000/24h). `check()` fails on either the per-user or the global limit; the owner counts toward the global. 15–20 accounts lock everyone out. AI is BYO key (D33), so the ceilings protect no money; they cap outbound calls and `/test` key-probing.
2. **F9 shared slots / slowloris.** Tag: 1/user, 2 total (`app.js:39`), held up to 30 s body + 45 s Claude (`claude.js:69`). Photos: 2/user, 3 total (`photos.js:18`), up to 30 s body + 30 s Drive (`drive.js:116`). A shorter deadline alone doesn't meet AC1; only an owner reservation guarantees the owner never gets `ai_busy`/`photos_unavailable`. `photoSlots` is a module singleton; move it into `createApp`.
3. **Identity mode ignores `TUDO_OWNER_SUB`** (`auth.js:19`, README line 8). Compose already passes it (`compose.yml:48`).
4. **`CF-Connecting-IP` is spoofable** from the shared external `web` network (`compose.yml:71,85-88`: cloudflared + every other app). Carrier NAT puts many users behind one IP.
5. **Photos/Drive:** every PUT lands in Ming's Drive (`photos.js:197`, D27): quota, privacy (Ming sees everyone's photos), shared Drive rate limits (hits AC1), account-suspension risk from abusive uploads. Photo GET has no in-flight cap. Per-user folders don't change whose Drive.
6. Uploads are small (client resizes to 1200 px q0.82, `src/data/photos.ts:2`; ~150–400 KB).
7. **(d)** is mostly covered by step order: Access stays until M-22 → T-019.9 → this ticket. M-19 not done yet; `closed` would undo M-20's "no staff assignment".

## Recommendations
- **R1 (a') owner lane on global AI ceilings:** `createLimiter({ownerSub})`; owner skips the global check and isn't counted; keeps per-user 20/30/100. Tests: N users fill global → owner passes; owner not counted; owner 429 at own limit.
- **R2 (a') owner lane on in-flight slots:** `createInFlight({perUser,total,exempt})`; owner ignores/doesn't count toward `total`, still `perUser`. Worst-case memory 16 MiB. Tests.
- **R3 (c) body deadline 10 s total + 4 s idle** in `readBody` (photo + tag-photo), 408 `request_timeout`, parameters for tests; README update. Tests: drip-feed → 408 at idle; slow steady → cut at 10 s; slot released.
- **R4 `TUDO_OWNER_SUB` required and validated in identity mode** (exit 2, never printed); README/auth comment. No `tudocuatui:owner` role (not issued; A11).
- **R5 photo storage owner-only until a storage decision:** non-owner `PUT /api/items/:id/photo` → `rejectUnread` 503 `photos_unavailable` before slot/body (existing copy `src/data/apiErrors.ts:19`). GET/DELETE stay owner-scoped (others 404, no Drive call). Tag-photo stays open (stores nothing, caller's key). Tests: non-owner PUT 503 with no Drive `createFile`; owner PUT works while others hold slots.
- **R6 no per-IP now;** later only for unauthenticated 401s after splitting the `web` network.
- **R7 (d) as a ming-todo note:** "Do not run M-22 until T-019.13 is released"; if Access goes earlier, register `closed` and amend D31.
- **R8 follow-ups (out of scope):** per-user quotas (A7), Drive `appProperties.userId`, photo GET in-flight cap, Node `headersTimeout`/`requestTimeout`, distinct `photos_not_enabled` code + UI.
- Size ~150–250 lines incl. tests.

## Risks
Wrong `TUDO_OWNER_SUB` (low; M-21 check compares it); 10 s on very poor connections (fallback 15 s); Cloudflare may already buffer bodies (then (c) is extra defence, unmeasured); R5 means other users have no photos (T-019.10 copy should say so); owner account becomes the most valuable to steal (still per-user limits, 15-min tokens); non-owners can still lock each other out of AI (needs A7 quotas).

## Open questions for Ming
1. Owner lane (exempt from global AI ceilings + own slots) — recommended — or everyone on shared limits?
2. Upload deadline: 10 s + 4 s idle (recommended) or 15 s + 5 s idle?
3. Whose Drive holds other users' photos: A. only Ming stores photos for now (recommended); B. Ming's Drive for everyone with quotas (needs A7 + privacy notice); C. each user connects own Drive (large); D. other storage such as R2 (stack change).
4. Join policy at M-19: `open` and don't run M-22 until this ships (recommended), or `closed` now?
5. Leave per-IP limits out for now?
