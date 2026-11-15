# Implementation log — T-019.14

## Attempt 1 — 2026-11-15

### Files touched
| File | Required because |
|---|---|
| `server/photoQuota.js` (new) | `PHOTO_LIMITS` (500 / 50 / 24 h), `storedAllows`, `createPhotoQuota` (rolling window, refund, sweep, owner exempt) |
| `server/photos.js` | daily reserve before slot acquire (429 before body), refund unless Drive stored a file; pre-check folded into the existing exists query (409, no `createFile`); advisory lock + recount in `withLockedItem` with an `over` flag; race loser's Drive file deleted; header lock rule step 2 |
| `server/api.js` | forward `photoQuota` to `handlePhoto` |
| `server/app.js` | `photoLimits` dep, one `createPhotoQuota` per app with `exempt: ownerSub` |
| `src/data/apiErrors.ts` | Vietnamese copy for `photo_quota_exceeded`, `rate_limited` (the two approved strings) |
| `server/README.md` | errors, limits, owner exemption, lock rule step 2 |
| `server/photoQuota.test.ts` (new) | unit tests |
| `server/photoQuota.db.test.ts` (new) | HTTP + real Postgres tests |
| `server/isolation.db.test.ts` | `control` regex of the photo-routes statement guard accepts exactly the advisory-lock statement |
| `src/data/apiErrors.test.ts` | two codes in `SERVER_CODES`; own non-generic copy |
| `src/data/repo.http.test.ts` | 409 / 429 on the photo step -> `PhotoSaveError` with the copy |

### Tests added / changed
- `server/photoQuota.test.ts`: PHOTO_LIMITS defaults; `storedAllows` (7 cases); reserve + Retry-After; rolling window; refund; rejected reserve records nothing; two users; exempt (and `exempt: null`); idle sweep. 16 tests.
- `server/photoQuota.db.test.ts` (8): stored cap 409 + no Drive POST; replace at cap; parallel race at cap-1 (one 200, one 409, 2 creates, 1 delete); statement order; headers-only 429 with Retry-After and Connection: close; refund; A/B independence; owner exempt.
- `src/data/apiErrors.test.ts`: new copy test; `repo.http.test.ts`: `test.each` 409 / 429.
- Note on the plan's owner test: with `dailyMax 1`, a non-owner's second upload is 429 (daily check runs first), so the test asserts 429 on that app and 409 `photo_quota_exceeded` on a second owner app with `dailyMax 100`.

### Checks (actual output summary)
Run with a throwaway Postgres 16.15 (`initdb --auth=trust`, port 55432, `TEST_DATABASE_URL` set; stopped and the data dir deleted afterwards).
- typecheck: `tsc --noEmit && tsc -p tsconfig.server.json` clean.
- format:check: "All matched files use the correct format."
- test: `pnpm test` (with DB): 97 files passed, 1 failed; 1305 tests passed, 1 failed. The failure is `server/migrate.cli.test.ts` "exit 1 on wrong password": it fails identically on a stashed clean tree, because the throwaway cluster uses trust auth so a wrong password is accepted. Not caused by this diff; CI uses password auth.
- DB suites: `photoQuota.db.test.ts`, `isolation.db.test.ts`, `api.db.test.ts` plus `scoping.test.ts` and `photoQuota.test.ts`: 5 files, 91 tests, all passed.
- build: built OK.

### Out-of-plan files
None.

### Follow-ups (noticed, not done)
- Index on `item_photos(user_id)` when the table grows (plan A10).
- Plan's owner test text says "second item 409" under `dailyMax 1`; it would be 429. Plan wording only.

### Scope self-check
- Could the diff be smaller? No.
- Diff size: tracked +112 / -16 over 8 files, plus 3 new files (87 + 118 + 274 lines). Not committed.
