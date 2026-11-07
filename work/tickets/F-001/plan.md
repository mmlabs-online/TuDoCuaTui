Status: READY

# Plan — F-001: Verify the Supabase backend end-to-end

## Feature summary
`docs/feature-list.md` F-001:
> Set up the real Supabase project and verify PR #1.
> - Project created, migration applied (`supabase db push`), redirect URLs configured for local and prod.
> - Manual test script in `docs/qa/smoke-test.md`: sign in → add an item with a photo → edit → wear today / undo → duplicate (photo copied) → delete (storage file removed).
> - Any bug found gets its own ticket.
> - **Notes:** this task is mostly manual (owner). Claude Code writes the smoke-test doc and checklist.

`work/decisions.md` D12:
> Tickets contain agent work only. Steps only Ming can do are `M-n` items in `work/ming-todo.md`; a ticket waits on one only when it lists it in `Needs Ming`.

So the hosted project, `db push`, hosted redirect URLs and the hosted smoke run are M-1 / M-2 (Ming). The prod redirect URL is F-007 (ticket "Out of scope"). D11 (types from `--local`) is why F-002 needs a working local stack from this ticket's `config.toml`. D15: Claude does every step.

Ticket scope (quoted): "Run `supabase init` and commit `supabase/config.toml` … Check that `npx supabase start` + `npx supabase db reset` applies `20261106000000_init.sql` cleanly to a local database", "Write `docs/qa/smoke-test.md` … Include a results table Ming fills in", "README: point the 'Set up Supabase' section at the smoke test", plus the three checks in Technical notes.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `supabase/config.toml` is committed, with `project_id = "tudocuatui"` and every host port moved from `543xx` to `553xx` (no collision with the running `calechip` stack). | `git diff --stat main...HEAD` lists `supabase/config.toml` and `supabase/.gitignore`. `grep -nE '^\s*(project_id\|port\|shadow_port\|smtp_port\|pop3_port)\s*=' supabase/config.toml` shows `"tudocuatui"` and only `553xx` values for the ports that were `543xx`. `grep -n '543[0-9][0-9]' supabase/config.toml` returns nothing. |
| 2 | Local auth URLs match the dev server. | `config.toml` `[auth] site_url = "http://localhost:8443"` and `additional_redirect_urls` contains `"http://localhost:8443"` and `"http://localhost:8443/**"` (AuthGate sends `origin + pathname`; Vite serves on 8443). `enable_signup = true`, `[auth.email] enable_confirmations = false`. |
| 3 | No secret values in `config.toml`; local CLI state is not committed. | Every credential-like field is either an `env(NAME)` placeholder or empty, and its provider/section stays `enabled = false` (as generated). `supabase/.gitignore` (from init) ignores `.temp`, `.branches` and `.env*`; `git status --short` after the run shows no `supabase/.temp/` entry. |
| 4 | The init migration applies cleanly on a local stack with `npx supabase db reset`. | `impl-log.md` contains the tail of `npx supabase start` (showing API URL on port 55321 — values like keys must be omitted, see Approach step 4) and of `npx supabase db reset` ending in `Finished supabase db reset`, plus the output of the two sanity queries in Approach step 5 (4 tables, 1 view, bucket `wardrobe` with 10485760 / 3 mime types). Reviewer may re-run Approach steps 3–6 and must stop the stack afterwards. |
| 5 | The tudocuatui stack is stopped afterwards and the `calechip` stack is untouched. | `impl-log.md` shows `npx supabase stop --no-backup` run from this repo, then `docker ps --format '{{.Names}}'` with no `*_tudocuatui` container and the `supabase_*_calechip` containers still listed. |
| 6 | `docs/qa/smoke-test.md` covers every step: sign in → add an item with a photo → edit → wear today / undo → duplicate (photo copied into the new item's folder) → delete (storage file removed, `item_photos` row gone), each with an expected result. | Read the doc: one numbered step per action, each with "Do" (exact Vietnamese button label: "Gửi link đăng nhập", "Thêm món đồ", "Lưu món đồ", "Mặc hôm nay", "−1", "Nhân bản", "Xoá") and "Expected" (UI result + SQL/Storage check). |
| 7 | The doc includes the three checks from Technical notes. | Doc has a section each for: (a) storage bucket + `item_photos` empty after delete (silent `removePhotos()` failure); (b) "Mặc hôm nay" twice on one day → still one `wear_logs` row, but toast "Đã ghi nhận mặc hôm nay" shows again (expected per current code; note it as known, links T-002 only for the pill); (c) wear pill of an item worn today, checked between 00:00 and 07:00 local time (expected per T-002: shows "-1 ngày" until T-002 lands — record, do not file a duplicate of T-002). |
| 8 | The doc contains the SQL checks from the consult. | Doc contains the queries for: photos before/after duplicate (two rows, different `storage_path`, folder segment 2 = own item id), `storage.objects` listing under `<uid>/`, `item_photos` count = 0 and no `storage.objects` under `<uid>/<id>/` after delete, `wear_logs` count after wear twice / undo / delete (cascade). Placeholders `<uid>`, `<orig_id>`, `<copy_id>` explained, with a query to find them. |
| 9 | The doc has two runs: local stack and hosted (M-2), and a results table Ming fills in. | Section "Run A — local stack" (start/reset, `.env.local` pointing at `http://127.0.0.1:55321`, magic link read in local Mailpit/Inbucket at `http://127.0.0.1:55324`, SQL in local Studio `http://127.0.0.1:55323`, stop afterwards) and "Run B — hosted project (M-2)" (dashboard SQL editor, Storage → wardrobe, real inbox, desktop Chrome + phone). One results table with columns: Step · Run A result · Run B desktop · Run B phone · Notes / ticket. Instruction: each failure → `/ticket`. |
| 10 | The doc never contains key values. | `grep -nE 'eyJ[A-Za-z0-9_-]{10,}\|sb_(publishable\|secret)_' docs/qa/smoke-test.md README.md` returns nothing. The doc says to copy the URL and anon/publishable key from `npx supabase status` into `.env.local` by hand. |
| 11 | The README links to the smoke test. | README "Set up Supabase" contains a relative link `docs/qa/smoke-test.md`; the obsolete `npx supabase init` line in step 2 is removed (config is now committed) and a one-line note says the local stack uses ports 553xx. |
| 12 | Checks green. | `npx tsc --noEmit` and `npx pnpm@10.34.3 build` both pass (no code change expected; proves nothing broke). `npx pnpm@10.34.3 format:check` / `test` do not exist on this branch. |

## Ming verification after merge
- M-1: hosted project created, `npx supabase db push` applies `20261106000000_init.sql`, Auth redirect URL `http://localhost:8443` set.
- M-2: `docs/qa/smoke-test.md` "Run B — hosted project" run once on desktop Chrome and once on a phone; results table filled in; every failure filed with `/ticket`.
- Optional: Ming runs "Run A — local stack" first (the consult's recommendation: safer).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `supabase/config.toml` | Create via `npx supabase init`, then edit `project_id`, the `543xx` ports → `553xx`, and `[auth]` URLs. | AC1; F-002 (D11) and F-006 need a local stack. |
| `supabase/.gitignore` | Created by `npx supabase init`; commit as generated. | Keeps `supabase/.temp/` (already present, untracked) and `.env*` out of git. |
| `docs/qa/smoke-test.md` | Create: prerequisites, Run A (local), Run B (hosted, M-2), steps with expected results, the three Technical-notes checks, SQL checks, results table. | AC2. |
| `README.md` | "Set up Supabase": drop the `npx supabase init` line, add a step linking `docs/qa/smoke-test.md`, one line on local ports. | AC3. |

No other file. If `supabase init` creates anything else (e.g. `.vscode/`, `supabase/seed.sql`), delete it and record it in `impl-log.md`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None (no product code changes; F-005 not landed). Verification is the command evidence in AC 1–5, 10, 12 and the manual script itself. | — |

## Approach
Run everything from the repo root in Git Bash (`/d/mmlabs/spaceM/projects/tudocuatui`), not a WSL path. Never touch the `calechip` stack: no `supabase stop` without being in this repo, no `--all`, no `docker stop/rm` of other containers.

1. **Init (non-interactive).** `npx supabase init < /dev/null`. CLI 3.0.0 only asks about IDE settings with `--interactive`/`-i`, so no flag is needed; do **not** pass `--force` (nothing to overwrite, and it must never overwrite a committed config later) and do **not** pass `-i` (no `.vscode`/Deno settings). Expect it to create `supabase/config.toml` and `supabase/.gitignore`, and leave `supabase/migrations/` untouched (`git status` must show no change under `migrations/`).
2. **Edit `config.toml`.**
   - `project_id = "tudocuatui"`.
   - For every key whose value is a `543xx` port (api `port`, db `port`, `shadow_port`, `[db.pooler] port`, studio `port`, inbucket/mailpit `port` and any `smtp_port`/`pop3_port`, analytics `port`, any other `543xx`), replace the `543` prefix with `553` (54321→55321, 54322→55322, 54320→55320, 54329→55329, 54323→55323, 54324→55324, 54327→55327, …). Use whatever section names the 3.0.0 template generates; do not add sections. Leave non-`543xx` ports (e.g. edge runtime inspector) as generated.
   - `[auth] site_url = "http://localhost:8443"`, `additional_redirect_urls = ["http://localhost:8443", "http://localhost:8443/**"]`.
   - Keep as generated: `enable_signup = true`, `[auth.email] enable_confirmations = false`, inbucket/mailpit `enabled = true`, `[storage] enabled = true` and `file_size_limit = "50MiB"`, `[db] major_version` (17), all `[auth.external.*]`/SMS/SMTP sections disabled with `env(...)` placeholders. Do not add `[auth.email.smtp]` or templates (that would make the file mail-sending High tier).
3. **Start.** `npx supabase start`. First run pulls ~10 images (slow; use a long timeout). If it fails on the `vector`/analytics container (Docker socket not exposed on Windows), retry with `npx supabase start -x vector,logflare` and note it in `impl-log.md` and the smoke-test prerequisites — do not change `config.toml` for it. If it fails on a port clash, stop (`npx supabase stop --no-backup` from this repo), record which port, and pick the next free `553xx` value; never touch calechip.
4. **Record evidence safely.** `npx supabase start` / `status` print the anon/service-role keys and JWT secret. Local defaults are not production secrets, but workspace rule §3 still applies: do **not** paste them into `impl-log.md`, the doc or any file. Record only the URL lines (`npx supabase status -o json | grep -E '"(API_URL|DB_URL|STUDIO_URL|INBUCKET_URL|MAILPIT_URL)"'`, or the equivalent keys) and the container names.
5. **Reset + sanity.** `npx supabase db reset` (local by default) → must end with `Finished supabase db reset`. Then, via `docker exec supabase_db_tudocuatui psql -U postgres -c "<sql>"`:
   - `select table_name, table_type from information_schema.tables where table_schema='public' order by 1;` → `item_photos, items, locations, wear_logs` (BASE TABLE) and `items_with_stats` (VIEW).
   - `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='wardrobe';` → `false`, `10485760`, `{image/jpeg,image/png,image/webp}`.
   - Optional: `npx supabase db lint --local` (record output; warnings are follow-ups, not blockers).
6. **Stop.** `npx supabase stop --no-backup` from this repo only; then `docker ps --format '{{.Names}}'` to show no `_tudocuatui` container and calechip still running. Do this even if an earlier step failed.
7. **Write `docs/qa/smoke-test.md`.** Sections: Purpose; Prerequisites (Docker, `.env.local` values come from `npx supabase status` (Run A) or the dashboard (Run B) — names only: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; restart `pnpm dev` after changing it; local ports table 55321 API / 55322 DB / 55323 Studio / 55324 Mail); Find your ids (`select id, email from auth.users;` and `select id, name from items order by created_at desc;`); Steps 1–7 (sign in, add with photo, edit, wear today, undo with "−1", duplicate = "Nhân bản" then "Lưu món đồ" — the copy is only written on save, delete = "Xoá" + confirm), each with Do / Expected UI / Expected DB; the three Technical-notes checks; the consult SQL checks (AC8), using `<uid>`, `<orig_id>`, `<copy_id>`; "The copy's photo still shows after the original is deleted"; Run A and Run B differences (Mailpit vs real inbox, local Studio vs dashboard, Run B on desktop Chrome and on a phone); results table (AC9); "Each failure → `/ticket`, link it in the Notes column". English text; Vietnamese only for exact UI labels and toasts.
8. **README.** In "Set up Supabase": remove `npx supabase init  # creates supabase/config.toml…` from step 2 (keep `link` and `db push`); add a step "Run the smoke test: [docs/qa/smoke-test.md](docs/qa/smoke-test.md)" with one sentence that a local stack (`npx supabase start`, ports 553xx, `npx supabase stop --no-backup` when done) is described there. Leave step 4 (`--linked` types) alone — F-002 replaces it.
9. **Checks.** `npx tsc --noEmit`; `npx pnpm@10.34.3 build`. Run the AC10 grep.

Rules: R2 — no migration is edited or added (only read/applied locally); applying to the real project stays Ming's (M-1). R3 — no key values in any file. R7 — anything else found (lint warnings, bugs) goes to follow-ups in `impl-log.md`, not into the diff. R10 — `AGENTS.md`, `.figma/`, `vite.config.ts` untouched. R1/R4/R5/R6/R9 not affected (no app code).

## Specialist input used
From `consult-database-optimizer.md`:
- Adopted — `project_id = "tudocuatui"` (prevents container/volume collision with calechip; also makes `db reset` target only this stack).
- Adopted — unique ports instead of stopping calechip (open question 1 default): committed `553xx` ports, documented in the smoke test.
- Adopted — `site_url` / `additional_redirect_urls` with `http://localhost:8443` and `/**`.
- Adopted — keep signup on, confirmations off, inbucket/mailpit on, storage on, 50MiB global cap.
- Adopted — no secrets in `config.toml`; check `supabase/.gitignore` for `.temp` / `.env`.
- Adopted — verification `start` → `db reset` → sanity query → `stop --no-backup` (sanity via `psql` in the container instead of `\dt` interactively; `db lint` optional).
- Adopted — SQL checks for duplicate, delete (exposes the silent `removePhotos()` failure, plus `wear_logs` cascade), wear twice / undo, wear pill after midnight.
- Adopted — mention local Mailpit, mark the hosted run as separate (open question 2 default); run local first.
- Adopted — Windows/Docker notes (Git Bash from `D:\`, image pull time, vector container fallback) — as `-x vector,logflare` on the command line instead of `[analytics] enabled = false` in config, to keep the committed config at defaults.
- Adopted as a note, not a change — `config.toml` should be at least Medium in `risk-tiers.yml` (open question 3 default: no change now). `.github/risk-tiers.yml` does not exist yet (F-003 creates it); implementer records this as a follow-up for F-003 in `impl-log.md`.
- Rejected — "A second user cannot see the first user's rows or signed URLs": not in the ticket or feature list (rule: quote, don't invent); F-006 covers cross-user RLS and storage policies with pgTAP.
- Rejected — "Upload > 10 MB or a non-image → rejected": not in the ticket; the UI resizes every photo to JPEG before upload (`resizeImage` in `uploadPrimary`), so the bucket limits cannot be hit through the UI. F-202.1 owns size checks.

## Assumptions
- Ming delegated open decisions ("tự quyết định", ticket notes 2026-11-07); the consult defaults above are taken without asking.
- Supabase CLI 3.0.0 via `npx` (verified with `npx supabase --version`); `npx supabase init --help` shows prompts only with `--interactive`. If the generated template differs (e.g. `[mailpit]` instead of `[inbucket]`), the implementer adapts key names and records them.
- Docker Desktop is running; calechip occupies 54321/54322 (verified with `docker ps`). 553xx ports are assumed free; step 3 handles a clash.
- The local stack's default anon key is treated like a secret for writing purposes (never written to files), even though it is a public demo value.
- Hotspots: no other ticket is `IN_PROGRESS`/`REVIEW`/`DONE`. `README.md` is also edited later by F-002, F-006 and F-007 (all BACKLOG) — expect small rebases there. `src/App.tsx` is not touched.
- This branch is based on `origin/main` without F-003, so checks are `npx tsc --noEmit` and `npx pnpm@10.34.3 build` only; main has no required CI checks yet.
- Tier: the diff is config + docs. `supabase/config.toml` contains auth settings but no mail sending; expected Low/Medium — the tier is CI's call once F-003 exists, never set by the agent.
- Known behaviours the smoke test records as "expected with current code" rather than new bugs: second "Mặc hôm nay" on the same day shows the toast again; the pill shows "-1 ngày" between 00:00 and 07:00 (T-002). The silent delete failure is checked and filed only if storage objects or `item_photos` rows actually remain.

## Blocking questions
None.

## Split proposal
None. Expected diff: `config.toml` (generated, ~10 edited lines), `.gitignore` (generated), smoke-test doc (~200 lines), README (~5 lines).
