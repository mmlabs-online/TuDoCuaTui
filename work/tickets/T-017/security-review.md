# Security review — T-017

## Attempt 1 — security-ai-generated-code-auditor (read-only, commit e053dfb)

**Verdict:** no 🔴. One 🟡, rest 🟢.

### Migration (`db/migrations/20261112140000_item_category_v2.sql`)
- 🟢 Transaction: migrator wraps each file in begin/commit with `lock_timeout 10s`, `statement_timeout 5min` (`server/migrator.js:163-178`); rollback undoes the enum additions; new values not used in the file (no 55P04); PG 17 in prod/CI; all 10 ids insert after commit (`server/schema.db.test.ts:284-285`).
- 🟢 Locks: short type lock; ROW EXCLUSIVE on a small `items`; no table/view rebuild.
- 🟢 Idempotent, expand-only (`if not exists`, idempotent UPDATEs, second run no-op `:286-287`; old values kept; default `'other'`).
- 🟢 Irreversible UPDATEs: header `:6-8`; deploy runs the backup and stops before migrate on failure (`deploy-tudocuatui.yml:161-168`), doesn't replace the app on migrate failure (`:170-177`); row count/ids/wear_count kept (`schema.db.test.ts:275-283`).
- 🟢 Rollback to previous image safe (migrator warns "ahead", applies nothing, `migrator.js:149-152`). Residual: during a rollback the old client writes `other` for new ids on edit and the old API accepts `bag/sport/home` again (still displayed correctly via aliases).

### Server validation (`server/validate.js`)
- 🟢 `CATEGORIES` = 10 new ids (`:6-17`), `includes` check (`:92-98`) rejects retired/unknown/non-string/prototype keys. `DEPRECATED_CATEGORIES` (`:19`) only for the drift test (`api.db.test.ts:262`); `PUT bag → 400` (`api.db.test.ts:275`, `validate.test.ts:67-69`).
- 🟢 Postgres still accepts retired values (expected for expand-only); later optional CHECK constraint — not in this ticket.

### Alias handling of untrusted input
- 🟡 **`toCategoryLabel` uses `in` on plain objects** (`src/data/mappers.ts:57-58`): `"constructor"`/`"toString"` pass through unchanged instead of "Loại khác"; `itemToRow` (`:133`) then sends a function that `JSON.stringify` drops (server defaults to `other`); `CATEGORY_ALIASES["__proto__"]` returns `Object.prototype`. Reachable only via the user's own localStorage (`repo.ts:41`) or enum-constrained rows; CSV uses a `Map` (safe). Fix: `Object.hasOwn(...)` (or `Object.create(null)`/`Map`), `typeof v !== "string"` guard, and a test that `constructor`, `__proto__`, `toString` → "Loại khác" (`mappers.test.ts:146-148` has the same blind spot).
- 🟢 CSV import (`csv/map.ts:85-86, 167-173`) uses a `Map` of normalized keys; no alias collisions (`src/lib/text.ts:2-9`); unknown → `unknownCategory`; empty → "Loại khác"; no HTML injection.
- 🟢 `load()` (`repo.ts:41`) now throws on malformed storage (non-array / null element) — pre-existing local-only case; follow-up guard.

### Other
- 🟢 Migrate → new app race: stray `bag` rows display as Phụ kiện and are rewritten on next save.
- 🟢 Supabase path (A4) fails on the 3 new ids; documented; prod is Node API.
- 🟢 No secrets/env/auth changes; no dynamic SQL.

### Recommendations
1. 🟡 Own-property lookups in `toCategoryLabel` + prototype-key test (inside the file list).
2. 🟢 Report moved row counts after the production migrate.
3. 🟢 Follow-ups: `load()` guard for malformed localStorage; CHECK constraint for retired categories later.
