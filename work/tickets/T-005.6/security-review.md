# Security review — T-005.6

## Attempt 1 — security-ai-generated-code-auditor (read-only)

**Verdict:** 🔴 1 blocker (B1), 🟡 none, 🟢 N1–N10.

### 🔴 B1 — cap does not protect a small library against a wrong/empty DB (`server/photo-sweep.js:92-115`)
The reference set comes only from `item_photos` in whatever `DATABASE_URL` points at. A migrated but empty/foreign DB (fresh, restored-empty, staging, test) makes every old tagged file a candidate; the per-file re-check asks the same wrong DB. The only guard is the absolute `--max-delete` (default 50), and a personal M1 wardrobe likely has ≤ 50 photos, so `--apply` would permanently delete every photo (`files.delete` skips trash). README `:74` ("rerun with the number it prints") makes approving the number a reflex. (A DB without the table fails safe with `42P01`.)
**Fix:** in apply mode refuse (exit 1, delete nothing) when `rows.length === 0 && candidates.length > 0` or `count.referenced === 0 && candidates.length > 0`; optionally a ratio guard. Fixed log line e.g. `refusing: no listed file is referenced (check DATABASE_URL)`. DB tests: empty `item_photos` + 3 old tagged files → exit 1, 0 DELETEs; only non-matching rows → same. README: one sentence on the refusal.

### 🟢 Notes
- N1 Trash (`PATCH {trashed:true}`) instead of permanent delete — open question for Ming; follow-up (changes the shared delete contract).
- N2 `q` is safe (folder id re-checked against `FOLDER_RE`, constant tag clause, URLSearchParams). Optional: `listTaggedFiles({pageToken})` so the query cannot be widened by design.
- N3 Pagination bounded (MAX_PAGES 1000, repeated token aborts, token ≤ 4096 chars).
- N4 Tag and age gates correct; grace cannot go below 15; no env widens anything.
- N5 Re-check before each delete; re-check failure → FAIL, no delete; 15-min grace covers create→insert.
- N6 Partial failures handled; pre-delete failures exit 1.
- N7 Redirect/retry consistent with drive.js contract.
- N8 No secrets/ids/Google text in output; tested.
- N9 Failure lines go to stdout though plan A10 says stderr — align or note.
- N10 No CLI test for `--apply` on an empty DB — B1's tests close it.

### Open questions
- Trash instead of permanent delete (sweep and best-effort deletes)?
- Ratio guard on top of the zero-referenced guard?

## Attempt 2 — security-ai-generated-code-auditor (read-only)

**Verdict:** B1 resolved. No 🔴 / 🟡.

- 🟢 B1 resolved: guard `candidates.length > 0 && count.referenced === 0` (`server/photo-sweep.js:110-117`) runs before the `--max-delete` branch and the delete loop; apply → exit 1, 0 deletes, fixed line. Tests `photo-sweep.db.test.ts:247-259` (empty table) and `:261-269` (non-matching rows); also closes N10. Existing tests use `anchor()` (:49-53) and stay meaningful. README `:75` documents it.
- 🟢 N11 Partly stale DB that still matches ≥ 1 file passes the guard; only `--max-delete` limits it (optional ratio guard — open question for Ming; follow-up).
- 🟢 N12 Legitimate lockout when all rows are gone; fails safe, no override flag; README line or follow-up.
- 🟢 N13 Dry-run prints "refusing:" but exits 0 — say `warning:` in dry-run or exit non-zero (cosmetic).
- Still open from attempt 1: N1 (trash vs permanent delete), N9 (failure lines on stdout vs A10 stderr).
