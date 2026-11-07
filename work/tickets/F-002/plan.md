Status: READY

# Plan — F-002: Generate DB types from the local schema

## Feature summary
`docs/feature-list.md` §F-002 (Generated DB types · P0 · M1 · S · depends on F-001):
> - Replace the hand-written `src/types/database.ts` with `supabase gen types typescript --linked`.
> - Add a `pnpm db:types` script and document it in the README.
> - **AC:** `tsc --noEmit` passes with the generated types; no `any` introduced.

`work/decisions.md` D11 (changes the source):
> `supabase gen types typescript --local` (local stack from `supabase/migrations/`) instead of `--linked`. Why: No Supabase login or secret needed; the migrations are the source of truth.

Ticket scope (`work/tickets/F-002/ticket.md`): add `db:types` to `package.json`; regenerate `src/types/database.ts` and fix
type errors in `src/data/**`; exclude the generated file from `oxfmt --check` **or format it inside the script**; update
the README (replace the "Optional: regenerate" step). Out of scope: schema changes.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `src/types/database.ts` is generated from the local schema, not hand-written (feature list "Replace the hand-written…", D11) | File has no hand-written header; contains generator markers (`__InternalSupabase`, a `Constants` export, `Tables<`/`TablesInsert<` helper types, `Relationships` with FK entries for `items`/`item_photos`/`wear_logs`/`locations`); `impl-log.md` records the exact command run and the CLI version (3.0.0). Optional, if Docker is available: start the stack from the worktree, run `npx pnpm@10.34.3 db:types`, then `git diff --exit-code src/types/database.ts` is clean; stop the stack. |
| 2 | `pnpm db:types` script exists and uses the local DB with a pinned CLI | `package.json` `scripts.db:types` runs `npx --yes supabase@3.0.0 gen types typescript … --schema public > src/types/database.ts && oxfmt src/types/database.ts`; no `--linked` / `--remote` / `--project-id`; no `supabase` entry in `dependencies`/`devDependencies`; `pnpm-lock.yaml` unchanged. |
| 3 | `tsc --noEmit` passes with the generated types | `npx pnpm@10.34.3 typecheck` exits 0. |
| 4 | No `any` introduced | `git diff main -- src package.json \| grep '^+' \| grep -nwE 'any'` returns nothing (also no `as any`, no `@ts-ignore`/`@ts-expect-error` added); `grep -nw any src/types/database.ts` returns nothing. |
| 5 | Generated file is formatted and `format:check` stays meaningful | `npx pnpm@10.34.3 format:check` exits 0; `src/types/database.ts` is **not** added to `.prettierignore` (unless the documented fallback in Approach step 5 was needed and `impl-log.md` shows why). |
| 6 | File encoding is safe | `head -c 3 src/types/database.ts \| od -An -tx1` is not `ef bb bf`; `file src/types/database.ts` reports UTF-8/ASCII text, not UTF-16; `grep -c $'\r' src/types/database.ts` is 0. |
| 7 | `pnpm db:types` is documented in the README | README "Set up Supabase" step 5 is replaced by a section that lists: Docker running, Git Bash, start the local stack, `pnpm db:types`, `npx supabase@3.0.0 stop --no-backup`; no remaining `--linked` gen-types command in README. |
| 8 | Nothing else regresses | `npx pnpm@10.34.3 test`, `test:coverage` (thresholds still met), and `build` all exit 0. |
| 9 | No key or local-stack state leaked into the repo | `git status` shows no `supabase/snippets/`, `supabase/.temp` tracked files, or `.env*`; `git diff main` contains no JWT-looking strings (`grep -E 'eyJ[A-Za-z0-9_-]{10,}'` returns nothing). |

## Ming verification after merge
- After Ming has applied every migration to the hosted project (M-1 and later), the generated types match the hosted
  schema by construction (D11). Nothing to check per se; if the hosted DB ever drifts from `supabase/migrations/`, that is a
  migration problem, not a types problem. "None" beyond that.

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `package.json` | Add `"db:types"` script (see Approach step 3). No dependency changes. | Ticket scope; feature list "Add a `pnpm db:types` script". |
| `src/types/database.ts` | Replace with generator output (then oxfmt-formatted). Drop the hand-written header comment that mentions `--linked`. | Ticket scope; feature list "Replace the hand-written…". |
| `README.md` | Replace "Set up Supabase" step 5 with the start → `pnpm db:types` → stop sequence (pinned CLI, Git Bash note). | AC "`pnpm db:types` is documented in the README". |
| `src/data/mappers.ts` | **Only if** typecheck fails after regeneration: minimal type-only fix (e.g. `itemToRow` return/field types). No behaviour change. | Ticket scope "fix any type errors that appear in `src/data/**`"; ticket technical notes list it. |
| `src/data/mappers.test.ts` | **Only if** the `nullRow: ItemRow` fixture no longer matches the generated view Row (missing/extra column). Adjust the fixture only. | Same; consult flags the fixture as at risk. |
| `src/data/repo.ts` | **Only if** typecheck fails on Supabase query typing after regeneration. Minimal type-only fix. | Same. |
| `.prettierignore` | **Only if** the fallback in Approach step 5 is needed: add `src/types/database.ts`. | Ticket scope allows excluding it; consult recommendation 2 fallback. |
| `work/tickets/F-002/impl-log.md` | Implementer log (commands, CLI version, `--local` outcome, fallbacks used). | Workflow. |

Do **not** edit: `docs/feature-list.md` (D11 records the change), `docs/qa/smoke-test.md`, `supabase/config.toml`,
`supabase/migrations/**`, `src/lib/supabase.ts` (High tier, no change needed), `work/backlog.md` (D16), `.github/**`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None new. | Ticket test plan: "Unit: none (F-005 mapper tests cover the types indirectly)". Existing `src/data/mappers.test.ts` and `src/data/repo.local.test.ts` must stay green against the generated types; adjust only the `nullRow` fixture if the generated view Row shape requires it. |

## Approach
Run everything from `D:\mmlabs\spaceM\projects\.wt-tudocuatui\F-002` in **Git Bash** (never PowerShell: PowerShell 5.1 `>`
writes UTF-16 LE). Docker Desktop must be running.

1. **Pre-flight (do not touch other stacks).**
   - `docker ps --format '{{.Names}}'`: note any `*_calechip` containers (ports 543xx) and **leave them alone**. If
     `*_tudocuatui` containers are already up (stale or another ticket), stop: F-006 must not run concurrently. Only if
     they are clearly stale from this worktree, run `npx --yes supabase@3.0.0 stop --no-backup` from the worktree.
   - Never use `supabase stop --all`, `docker rm`, or `docker volume rm` on anything.
2. **Check the flag.** `npx --yes supabase@3.0.0 gen types typescript --help`. If `--local` is listed and not marked
   deprecated, keep it in the script (D11 wording). If it is missing or deprecated, omit it: the local DB is the default
   target in 3.0.0, which still meets D11 (no `--linked`/`--remote`, no login). Record the outcome in `impl-log.md`.
3. **Add the script** to `package.json`:
   `"db:types": "npx --yes supabase@3.0.0 gen types typescript --local --schema public > src/types/database.ts && oxfmt src/types/database.ts"`
   (drop `--local` per step 2 if needed). `--yes` avoids the npx install prompt; pinned version gives reproducible output;
   no devDependency, so no `onlyBuiltDependencies` allowance for a postinstall (orchestrator preference, consult open
   question 1). `>` in pnpm's script shell (cmd on Windows, sh elsewhere) is byte-faithful.
4. **Generate.** `npx --yes supabase@3.0.0 start` (fallback if `vector`/analytics fails on Windows:
   `npx --yes supabase@3.0.0 start -x vector,logflare`). Do **not** run `supabase status` unless needed for debugging, and
   never copy any key it prints into any file, log, commit or message. Then `npx pnpm@10.34.3 db:types`.
   **Always** finish with `npx --yes supabase@3.0.0 stop --no-backup` (also if a later step fails), then delete any
   `supabase/snippets/` the start created (`rm -rf supabase/snippets`), and confirm `git status` shows no new files under
   `supabase/`.
5. **Verify the file.** UTF-8 without BOM, LF only (AC 6). `oxfmt --check src/types/database.ts` passes. Running
   `oxfmt` twice gives no further change. Fallback only if oxfmt fails on or keeps churning the output: add
   `src/types/database.ts` to `.prettierignore`, remove `&& oxfmt …` from the script, and record why.
6. **Fix types.** `npx pnpm@10.34.3 typecheck`. Expected: passes unchanged (`mappers.ts` uses only `Enums`,
   `Views.items_with_stats.Row`, `Tables.items.Insert`; view Row is all-nullable as before; `rowToItem` already uses `??`).
   If anything fails, make the smallest type-only fix in `src/data/**`; no `any`, no `as never` beyond what exists, no
   `@ts-*` comments, no behaviour change.
7. **README.** Replace step 5 under "Set up Supabase" with a short "Regenerate DB types (after any migration)" block:
   Docker running; Git Bash on Windows; `npx supabase@3.0.0 start`; `pnpm db:types`; `npx supabase@3.0.0 stop --no-backup`;
   one line that types come from `supabase/migrations/` via the local stack (D11), no login needed.
8. **Checks.** `npx pnpm@10.34.3 typecheck`, `format:check`, `test`, `test:coverage`, `build` — all green. Run the AC 4,
   6 and 9 greps and paste results into `impl-log.md`.

Rules: **R2** (types regenerated from migrations, no migration edited) — met. **R1** (local mode) — no runtime change;
`Constants` is the only new runtime export and nothing imports it. **R3** — no keys anywhere; `supabase status` output
never written. **R7** — files limited to the table above. **R8** — all checks green; no new pure logic, so no new tests.
**R10** — no Figma Make files touched. Expected tier: Medium (`package.json`, `src/types/**`).

## Specialist input used
From `consult-database-optimizer.md`:
- **Adopted** — Rec 1 script shape (`gen types typescript --schema public > … && oxfmt …`) and pinning the CLI; but pinned
  via `npx --yes supabase@3.0.0`, **not** a devDependency (open question 1: orchestrator preference; avoids a build-script
  allowance, which is security-relevant).
- **Adopted** — Rec 2: format inside the script, keep the file under `format:check`; `.prettierignore` only as fallback.
- **Adopted** — Rec 3: generate via bash; verify UTF-8 without BOM and no whole-file CRLF churn.
- **Adopted** — Rec 4: drop the hand-written header; remove `--linked` references (README, header). Not extended to
  `docs/feature-list.md` (D11 already records the change).
- **Adopted** — Rec 5: no CI freshness check now (needs Docker); listed as a follow-up.
- **Adopted** — Risk "`--local` may be rejected": handled by the help check in step 2.
- **Adopted** — Open question 2: keep the generated `Constants` export unedited. Open question 3: always stop after gen.
- **Rejected** — Open question 1 consultant default (devDependency): see above.

## Assumptions
- `--local`/default target introspects only the running `tudocuatui` stack resolved from `supabase/config.toml` in the
  worktree (ports 553xx); calechip (543xx, different `project_id`) is unaffected as long as commands run from the worktree.
- F-006 will later use the same local stack; the orchestrator runs them sequentially. If `*_tudocuatui` containers are up
  at start, the implementer stops and reports rather than reusing or killing them (unless clearly stale from this worktree).
- If generation fails midway, `>` may leave `src/types/database.ts` empty; `git checkout -- src/types/database.ts`
  restores it. Acceptable for a dev-only script; no temp-file dance (it would need shell-specific `mv`).
- Hotspots: no open ticket (state `IN_PROGRESS`/`REVIEW`/`DONE`) touches these files in this branch's view. Later tickets
  that add migrations (T-003, F-006 fixtures) will regenerate `src/types/database.ts`; any README edits by F-007 may
  conflict lightly on README "Set up Supabase".
- Follow-ups (not in this diff, per R7): (a) CI job: start stack + `db:types` + `git diff --exit-code src/types/database.ts`;
  (b) pin `supabase@3.0.0` in `docs/qa/smoke-test.md` commands for consistency; (c) optionally ignore `supabase/snippets/`
  in `supabase/.gitignore`.

## Blocking questions
None.

## Split proposal
None (expected diff well under 400 hand-written lines; the generated file is the bulk).
