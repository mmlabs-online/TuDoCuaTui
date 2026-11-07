## Attempt 1 — 2026-11-07
Verdict: REWORK

### Checks (run by reviewer)
- typecheck: `npx tsc --noEmit` exit 0, no output.
- format:check: n/a (script does not exist on this branch).
- test: n/a (script does not exist on this branch).
- build: `npx pnpm@10.34.3 build` exit 0 ("built in 403ms").
- Local stack (re-run by reviewer): `npx supabase start` exit 0, applied `20261106000000_init.sql`; `npx supabase db reset` ended `Finished supabase db reset on branch ticket/F-001.` (target port 55322). psql in `supabase_db_tudocuatui`: `item_photos, items, locations, wear_logs` = BASE TABLE, `items_with_stats` = VIEW; RLS `t` on all 4 tables; bucket `wardrobe` public=f, 10485760, `{image/jpeg,image/png,image/webp}`; 4 storage policies present; `show timezone` = `UTC`. `npx supabase stop --no-backup` → "Stopped supabase local development setup." (`project_id_filter: tudocuatui`); afterwards `docker ps` shows only the 5 `supabase_*_calechip` containers. Removed the empty `supabase/snippets/` that `start` created. Keys omitted.
- Grep: `543[0-9][0-9]` in `supabase/config.toml` → none; `eyJ…` / `sb_publishable_` / `sb_secret_` in `docs/qa/smoke-test.md`, `README.md`, `supabase/config.toml` → none.
- impl-log claims match the reviewer's run.

### Acceptance criteria
- [x] AC1 config committed, `project_id = "tudocuatui"`, 543xx → 553xx — evidence: `supabase/config.toml:1` project_id, ports 55321/55322/55320/55329/55323/55324/55327 (+ commented 55325/55326); no `543xx` left.
- [x] AC2 local auth URLs — evidence: `supabase/config.toml` `site_url = "http://localhost:8443"`, `additional_redirect_urls = ["http://localhost:8443", "http://localhost:8443/**"]`, `enable_signup = true`, `[auth.email] enable_confirmations = false`.
- [x] AC3 no secret values; CLI state ignored — evidence: credential fields are `env(...)` or empty/commented; `supabase/.gitignore` ignores `.branches`, `.temp`, `.env.*`; `git status --ignored` shows `supabase/.temp/`, `.branches/` as ignored.
- [x] AC4 init migration applies cleanly with `db reset` — evidence: reviewer re-run above.
- [x] AC5 stack stopped, calechip untouched — evidence: reviewer re-run above.
- [x] AC6 every step with exact labels and expected result — evidence: `docs/qa/smoke-test.md:73-123`; labels match code: "Gửi link đăng nhập" (`src/features/auth/AuthGate.tsx:78`), "Thêm món đồ" (`src/App.tsx:618`, `:1540`), "Lưu món đồ" (`:1241`), "Mặc hôm nay" (`:1088`), "−1" (`:1086`), "Nhân bản" (`:1232`), "Xoá" (`:1229`), "Xoá món đồ" (`:1496`), toasts (`:840`), empty-state text (`:1534`). Duplicate-only-on-save matches `src/App.tsx:831-835` + `src/data/repo.ts:213-219`.
- [ ] AC7 the three Technical-notes checks — Check b has a wrong SQL expectation, see Issue 1. Checks a and c are correct (c: `new Date("YYYY-MM-DD")` is UTC midnight, `src/App.tsx:488-489` → floor of a negative fraction = "-1 ngày" between 00:00 and 07:00 UTC+7).
- [ ] AC8 consult SQL checks incl. `wear_logs` cascade after delete — the cascade check is vacuous, see Issue 2. Duplicate/photo/storage queries are correct for the schema.
- [x] AC9 Run A / Run B and results table — evidence: `docs/qa/smoke-test.md:19-55`, `:159-173`.
- [x] AC10 no key values — evidence: grep above.
- [x] AC11 README link — evidence: `README.md:26` links `docs/qa/smoke-test.md`, `supabase init` line removed, 553xx note present.
- [x] AC12 checks green — evidence: above.

### Issues
#### Issue 1 — 🔴 blocker — smoke-test correctness (Check b)
- **Where**: `docs/qa/smoke-test.md:135`
- **Expected**: the query matches the date the app writes. The app inserts `worn_on: localToday()` (client local date, `src/data/repo.ts:242`, `src/lib/supabase.ts:21`), while `current_date` in the SQL editor is the server date, and the DB runs in UTC (`show timezone` = `UTC` on the local stack; hosted Supabase also defaults to UTC).
- **Actual**: `... and worn_on = current_date` returns 0 instead of 1 when Ming runs it between 00:00 and 07:00 UTC+7. That is a false failure and would lead to a bogus ticket.
- **Fix instruction**: replace the query with `select worn_on, count(*) from wear_logs where item_id = '<id>' group by worn_on order by worn_on desc;` and state the expectation as "today's local date (YYYY-MM-DD) appears once with count 1". Alternatively use `worn_on = '<today>'` and define `<today>` as the local date in the "Find your ids" section. Also explain the `<id>` placeholder there (any item you wore; it is not in the placeholder list at `:58-68`).

#### Issue 2 — 🔴 blocker — AC8 cascade check proves nothing
- **Where**: `docs/qa/smoke-test.md:114-123` (and the reference block at `:155-156`)
- **Expected**: the step-7 `wear_logs` query shows that deleting an item cascades its wear logs (plan AC8: "`wear_logs` count after wear twice / undo / delete (cascade)").
- **Actual**: step 5 already undoes the only wear, so `<orig_id>` has 0 `wear_logs` rows before step 7. "count is 0 (cascade)" passes whether or not the cascade works.
- **Fix instruction**: at the start of step 7, add "press 'Mặc hôm nay' once, check that `select count(*) from wear_logs where item_id = '<orig_id>';` returns 1", then delete, then expect 0. Put the same before/after note on the reference block's `wear_logs` comment.

### Rules R1–R10 (CLAUDE.md)
No violations found. No app code, migration, `VITE_*` value, Figma Make file (`AGENTS.md`, `.figma/`, `vite.config.ts`) or storage path changed. R2: migration only applied locally, not edited. R3: no key values in any committed file.

### Scope
Changed files: `README.md`, `docs/qa/smoke-test.md`, `supabase/.gitignore`, `supabase/config.toml` (all in the plan) plus `work/**` loop files (backlog, ticket state, plan, consult, impl-log). No unjustified out-of-plan change.

### Ming verification after merge
- M-1: hosted project created, `npx supabase db push` applies `20261106000000_init.sql`, Redirect URL `http://localhost:8443` set.
- M-2: `docs/qa/smoke-test.md` Run B on desktop Chrome and on a phone; results table filled in; each failure filed with `/ticket`.

### Nits (do not block)
- `docs/qa/smoke-test.md:75`: the empty-state text only shows when the account has no items; in Run B on an account that already has items it will not. Say "on a fresh account".
- `docs/qa/smoke-test.md:96` / `:101`: say where the wear count is read — the editor's "Đã mặc N lần" (`src/App.tsx:1077`) and the card pill "👕 N×".
- `docs/qa/smoke-test.md:66`: `items` query has no `user_id` filter; fine on a single-user local stack, but the SQL editor bypasses RLS, so on a shared hosted project add `where user_id = '<uid>'`.

### Follow-ups (out of scope)
- F-003: classify `supabase/config.toml` as at least Medium in `.github/risk-tiers.yml` (already in impl-log).
- `copyPhoto` (`src/data/repo.ts:169-172`) inserts the copied `item_photos` row without `width`/`height`, and leaves the copied storage object behind if the insert fails (unlike `uploadPrimary`). Candidate for its own ticket.
