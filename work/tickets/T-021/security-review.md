# Security review — T-021

## Attempt 1 — 2026-11-16 (security-ai-generated-code-auditor)

Read the working tree at f55b30f (no Bash; tests not run; D41 and consults not opened). **No 🔴.**

### 🟢 Verified
- **Drive query injection closed:** `checkRoot` validates every folder id with `FOLDER_RE` before it enters `q` (`server/drive.js:74-78`, used by `taggedFilesQuery`/`subfoldersQuery`/`userFolderQuery` 85-101); `userFolderQuery` requires `isUuid(userId)` (99; anchored pattern `validate.js:42`); root id checked at config load (67); subfolder ids from `listFiles` already pass `FILE_ID_RE` (553) and `checkRoot`; URL params via `URLSearchParams` (440-444, 528-534); file ids via `fileUrl` (340-343); `createFile.parentId` and `moveFile` parents checked (356, 437-439).
- **No cross-user folder:** `folders.resolve(userId)` (`photos.js:242`) uses the authenticated id (`api.js:64,117`), after the ownership-confirming `QUOTA_SQL` (`photos.js:228-231`); cache keyed by userId only (`driveFolders.js:50-61`); only folders matching that user's tag/root or just created are cached; `drive.file` limits visibility; no fallback to root.
- **Sweep can't delete outside the root or a folder:** parent filter kept, root + `app=tudo-folder` children only (`photo-sweep.js:85-93`); file query excludes folder mimeType (`drive.js:87`); candidates need `app === "tudo"` (`photo-sweep.js:120`); re-check, `--max-delete`, refusal unchanged.
- **Relocate stays in the root tree, never writes the DB:** lists root only (`photo-relocate.js:69`); moves only if parents still show the root (151-156); single SELECT via `withMaintenance` (`begin read only`, `db.js:57,101-108`, policy `photo_sweep_read`); no `withUser`/writes; `scoping.test.ts:98-107` pins no direct pool access.
- **No duplicate creates; refund/mapping intact:** `createFolder` `retry: false` (`drive.js:416`); single-flight, no cached failure (`driveFolders.js:52-63`); resolve inside the `createFile` try before `onDriveStored` (`photos.js:240-260`), refunded by the `finally` (202); 503/502 mapping; `forget` only on `drive_not_found` (254).
- **DoS bounded:** one list per user per process; folder lookups ≤ 10 pages (`driveFolders.js:8,27`); sweep 1000-page budget + seen-token guard.
- **Logging:** `{event, op, status, code, reason}` with allow-listed reasons (`drive.js:146-153`, `cannotAddParent` at 42); scripts print uuids, counts, codes only.

### 🟡
- **F1** `server/drive-smoke.js:82` (and existing 84): "left behind" lines print raw Drive ids (Ming's console only). Print the file name instead, or document the exception.
- **F2** `drive-smoke.js:57-61`: the smoke doesn't prove Drive *merges* `appProperties` on move; relocate PATCHes only `{userId}` (`photo-relocate.js:160`). If Drive replaced the map, moved files would drop out of `taggedFilesQuery` (sweep `missing`, orphans unseen). Fix: create with `{tudo:"smoke", a:"1"}`, move with `{b:"1"}`, assert `a` survives — before Ming's `--apply`.
- **F3** `driveFolders.js:50-51`: cache never expires; a trashed user folder stays cached. If real Drive accepts uploads into a trashed folder, new photos would be purged after ~30 days (fake Drive returns 404 → `forget` heals). Follow-up: TTL or a once-per-process `trashed` check.
- **F4** `scoping.test.ts:37-39` / `photo-relocate.js:95`: the cross-user SELECT passes `unscoped()` only because it names `user_id`. Add an explicit ALLOW entry with a reason; follow-up: tighten `unscoped()` to `user_id = $n`.

### 🟢 F5 (optional)
`photo-relocate.js:116`: legacy files have no `userId` tag, so placement rests on the DB row (correct). Optional extra check: compare `appProperties.itemId` with the row's `item_id`.

### Risks
Duplicate folders across processes (accepted under C1, cosmetic); trashing a user folder by hand loses its photos (README only); relocate runs show as "photo-sweep" in Postgres attribution.

### Open questions
Does real Drive return 404 for `createFile` into a trashed parent (F3)? F1 as an accepted exception? F2 assertion before `--apply`, or rely on the sweep's `missing 0`?
