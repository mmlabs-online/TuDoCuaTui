# Security review — T-019.3

## Attempt 1 — 2026-11-14 (security-ai-generated-code-auditor, static read)

**Verdict: PASS. No 🔴.** Two 🟡, both about T-019.5 (identity mode), not this diff. Tests not executed.

Checked: migration, store, crypto, rate limiter, routes, tag-photo handler, app, api; inflight.js, user.js, errors.js, photos.js `readBody`; test/auth.ts, scoping guard, isolation AI block, migrator assertions; `scripts/check-image.sh:71` excludes `server/test` and `*.test.*` from the image.

### Findings
**🟢 F1. Every key path needs the caller's own userId; no single-row fallback.** `server/app.js:89` from `auth.authenticate`; `server/api.js:76,79` passes it to both AI handlers. Checked three times: `loadSettingsKey` throws on missing/empty (`server/ai/routes.js:44`); store `need()` requires a canonical uuid before SQL (`server/ai/store.js:30-32`, used at 38/44/87/99); crypto `aad()` (`server/ai/crypto.js:15`). Every statement uses `user_id = $1` / `on conflict (user_id)`; `user_id` never in `set` (store.js:39-104). Bad user → plain Error → 500 `internal`, only `name`/`code` logged (app.js:106-111) or `dbLogFields` (routes.js:90/159).

**🟢 F2. AAD v2 binds sub + provider; v1 rejected; row-copy closed.** AAD `tudocuatui-ai-key|v2|<canonical uuid>|<allow-listed provider>` (crypto.js:16); `openKey` accepts only `v2:` (75-76); `openStoredKey` maps every failure incl. `bad_user` to `key_unreadable`, logs nothing (61-68). Row-copy test covers `/test` and tag-photo: 409 `key_unreadable`, no outbound call (`server/isolation.db.test.ts:355-367`); B → `not_configured`, no call; A's call carries A's key (343-352).

**🟢 F3. Key never in logs or responses.** `toView` exposes only `maskHint` (routes.js:23-34); ciphertext not in `COLUMNS` (store.js:16); logs fixed fields (event, id, action, code, ms).

**🟢 F4. Migration owner check sound, constant messages.** `20261114180000_ai_settings_per_user.sql`: :19 lock before DO; :32-35 regex before any cast; :29/34/40/43 constant raises, no DETAIL; :50-51 clears all three key columns (keeps `ai_settings_key_pair_chk`); :53-56 PK swap. `owners > 1` branch (:39) unreachable (old boolean PK allowed one row), harmless. Tests check messages lack `OWNER`/`OWNER_B` (`server/migrator.db.test.ts:469-480`). Uppercase handling matches the contract migration.

**🟢 F5. Limiter correct, memory bounded.** Checks user and global windows, records only when both pass (`server/ai/rateLimit.js:62-68`); rejection records nothing; new entry stored only on success (:68). Eviction only when all three arrays are empty after pruning (:41, :46, :63) — an active user is never evicted (the implementer's "delete on rejected call when all windows empty" is consistent with this). ≤ 600 + 300 + 2000 = 2,900 live entries. Above 1,024 entries every check sweeps all (n ≤ 2,900, acceptable). Minor: `check()` doesn't validate `userId` (`undefined` would share a bucket); optional one-line guard.

**🟢 F6. Tag in-flight per user and per app instance.** `tagSlots = createInFlight({ perUser: 1, total: 2 })` per `createApp` (app.js:37); module-level counter gone. `tryAcquire` before any `await` and before the limiter (`server/ai/tagPhoto.js:39-40`) → busy consumes no quota; `finally { release() }` (:76-78), idempotent (`server/inflight.js:19-21`).

**🟢 F7. `ai_settings` in the scoping guard** (`server/scoping.test.ts:10-11, 71-75`). Existing limitation: the guard only checks for the text `user_id` (e.g. `update ai_settings set user_id = $1` would pass); runtime recorder partly compensates.

**🟡 F8 (T-019.5). Open sign-up can exhaust global ceilings and lock out everyone incl. Ming** (rateLimit.js:19-23): 15 accounts fill `test` 300/h, 20 fill `save` 600/h, 20 fill `tag` 2000/24h; then everyone gets 429, indistinguishable (A5). Intended trade-off (A4), fine under Access. Before T-019.5: accept, reserve an owner budget, add a per-IP dimension, or gate sign-up; record in the T-019.5 plan.

**🟡 F9 (T-019.5). Two accounts can hold both tag slots with slow uploads.** Slot taken before the body is read; `readBody` up to 30 s (`server/photos.js:15,51`), provider up to 45 s (claude.js:69). Needs only a well-formed saved key. Two drip-feeding accounts hold `total: 2` ~30 s per call, ≤ 100 calls/day each. For T-019.5: shorter tag body deadline (e.g. 10 s for ≤ 2 MiB), per-IP cap, or the same sign-up gate as F8.

### Recommendations
- AC1, AC2, AC3 met; R3 met.
- T-019.5 plan: address F8, F9; change `initAi`'s `requestAuth` to "auth mode is access or identity" (`server/index.js:68`, comment `server/ai/config.js:22`).
- Optional: `toUserId` guard in `limiter.check` (F5).

### Risks
- Not image-rollback-safe; the cleared key cannot be restored (migration header, A12); Ming re-enters it.
- Limiter state in memory per process; a second replica doubles limits (D30).

### Open questions
- Should T-019.5 have a sign-up gate or an owner budget against the global-ceiling lockout (F8, F9)?
