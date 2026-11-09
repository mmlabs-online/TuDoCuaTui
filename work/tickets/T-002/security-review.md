# Security review — T-002

## Attempt 1 — 2026-11-09 (security-ai-generated-code-auditor)

**Verdict: no blockers (🔴 none).** The change does not open any new way to read or write another user's rows, and it adds no secrets.

**Caveat on what I checked:** I only had read access and could not run `git diff`. I reviewed the current branch versions of `src/data/repo.ts`, `src/lib/dates.ts` and `src/lib/supabase.ts`, checked them against the plan, and read `supabase/migrations/20261106000000_init.sql`.

### 🟢 1. The Supabase +1 upsert with `.select("id")` stays inside the user's own rows
`src/data/repo.ts:261-269`.
- **The client never sends `user_id`.** The payload is only `{ item_id, worn_on }`. The column defaults to `auth.uid()` (`init.sql:89`).
- **Another user's `item_id` is rejected.** The `tudo_wear_logs` insert check (`init.sql:153-159`) requires `user_id = auth.uid()` and that `item_id` is one of the caller's own `tudo_items`. Postgres runs this check before it looks for an `ON CONFLICT` match. So a foreign `item_id` fails with an RLS error (42501) and never comes back as an empty result.
- **`already` cannot be used to probe other users' data.** It cannot tell you whether someone else's item or log exists. `item_id` is a UUID primary key with exactly one owner, so the table-wide `unique (item_id, worn_on)` (`init.sql:93`) can only ever conflict with the caller's own row.
- **The returned row is the caller's own.** `RETURNING` (from `.select("id")`) needs the row to pass the SELECT `USING (user_id = auth.uid())`, which a freshly inserted own row always does. `ON CONFLICT DO NOTHING` returns nothing for the existing row, so no row from another user can leak through it.
- The plan's statement about this (plan.md:104, "owner-full-access policy … allows the RETURNING select") is correct.

### 🟢 2. The −1 path and the stats read are unchanged and still protected by RLS
- The −1 path select and delete by `id` (`repo.ts:271-282`) only see the caller's own rows.
- The stats read goes through `tudo_items_with_stats`, which is `security_invoker = true` (`init.sql:99-100`). The base-table RLS therefore applies, and a foreign `item.id` makes `.single()` throw.
- Only `authenticated` has grants; `anon` has none (`init.sql:167-171`).

### 🟢 3. No secrets or new `VITE_*` variables (R3)
- `src/lib/supabase.ts` now only reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and exports `PHOTO_BUCKET`. Moving `localToday` out of it removed code and added nothing.
- `src/lib/dates.ts` is pure date math with no I/O and no env access.
- A search of `src/` found no `service_role` key, no `sk-` key and no other `VITE_*` variable.

### 🟢 4. Local mode has no security impact
- The `prevWorn` Map (`repo.ts:32`) is in memory, holds one session's undo state, and is keyed by item id.
- It holds the same `lastWorn` strings that already sit in localStorage, so it exposes nothing new.

### 🟡 5. Low, just a note: `already` comes only from the client and only picks the toast
- `already = !data?.length` (`repo.ts:269`) treats a `null` result as "already worn". That is the safe direction: it never claims a wear that did not happen.
- The DB unique constraint still enforces one wear per item per day, so nothing changes on the server. Only the toast text depends on `already`; no access decision does. No action needed.

### Recommendations
None needed for security. Optional: the reviewer can confirm that the Supabase repo tests cover a cross-user `item_id` on +1 coming back as an RLS error, not `already: true`. That is a mocked test, so it only documents the expectation; the real guarantee is the policy in `init.sql:153-159`.

### Risks
- All the guarantees above depend on `20261106000000_init.sql` being applied to the hosted project with the policy unchanged (applying migrations is Ming's step under R2). This diff touches no migration.

### Open questions
None.
