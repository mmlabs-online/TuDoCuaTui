Status: READY

# Plan — F-002: Generate DB types from the local schema

Revision 2 (2026-11-09), against `main` after T-004 (shared stoktok project, `tudo_` prefix, D17). Replaces the
2026-11-07 plan. Uses `consult-database-optimizer.md` (2026-11-09); the 2026-11-07 consult is kept for reference only.

## Feature summary
`docs/feature-list.md` §F-002 (Generated DB types · P0 · M1 · S · depends on F-001):
> - Replace the hand-written `src/types/database.ts` with `supabase gen types typescript --linked`.
> - Add a `pnpm db:types` script and document it in the README.
> - **AC:** `tsc --noEmit` passes with the generated types; no `any` introduced.

`work/decisions.md`:
> D11 — `supabase gen types typescript --local` (local stack from `supabase/migrations/`) instead of `--linked`. Why: No
> Supabase login or secret needed; the migrations are the source of truth.

> D17 — TuDoCuaTui runs on the existing stoktok Supabase project … agents never run `db push`, `link`,
> `db reset --linked`, `db pull` or `db diff --linked` against it … Supersedes … `--linked` in F-002 (already D11).

> D12 — Tickets contain agent work only. Steps only Ming can do are `M-n` items in `work/ming-todo.md`; a ticket waits
> on one only when it lists it in `Needs Ming`.

Ticket scope (`work/tickets/F-002/ticket.md`): add `db:types` to `package.json`; regenerate `src/types/database.ts` and
fix type errors in `src/data/**`; exclude the generated file from `oxfmt --check` **or format it inside the script**;
update the README (replace the "Optional: regenerate" step). Out of scope: schema changes.

**State of `main` that changes the work** (consult finding 3): T-004 already replaced the hand-written file with
generator output (`work/tickets/T-004/impl-log.md` line 16; `T-004/review.md` line 19: byte-identical to
`gen types --local` + oxfmt). No migration changed since. So the remaining deliverables are the script, the README, the
formatting guarantee and the drift workflow. The one-time regeneration with the new script flags needs a running local
stack (Docker), which the agent sandbox does not have; it becomes a Ming step after merge (see below), not a precondition.

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | `pnpm db:types` script exists, targets the **local** DB only, with a pinned CLI, and formats its output (ticket scope; D11; D17) | `package.json` → `scripts["db:types"]` is exactly `npx --yes supabase@<X.Y.Z> gen types typescript --local --schema public > src/types/database.ts && oxfmt src/types/database.ts` (`--local` may be absent only if `impl-log.md` shows `--help` output without it, Approach step 2). `<X.Y.Z>` is an exact version, not a range or tag. No `--linked`, `--project-id`, `--db-url`, `--remote`. No `supabase` in `dependencies`/`devDependencies`; `git diff main -- pnpm-lock.yaml` is empty. |
| 2 | `tsc --noEmit` passes with the generated types (feature list AC) | `pnpm typecheck` exits 0. `src/types/database.ts` is the generator output on `main` (from T-004) — `git diff main -- src/types/database.ts` is empty (agents cannot regenerate without Docker; they must not hand-edit it, Approach step 4). |
| 3 | No `any` introduced (feature list AC) | `git diff main -- src package.json \| grep '^+' \| grep -wE 'any\|@ts-ignore\|@ts-expect-error'` returns nothing; `grep -nw any src/types/database.ts` returns nothing. |
| 4 | The generated file stays under `format:check` (ticket scope: "format it inside the script") | `pnpm format:check` exits 0; `.prettierignore` is unchanged (`git diff main -- .prettierignore` empty). |
| 5 | `pnpm db:types` is documented in the README (feature list; ticket AC) | README "Set up Supabase" step 5 is replaced by a "Regenerate DB types" block that lists, in order: Docker running → `npx supabase start` → `npx supabase db reset` → `pnpm db:types` → `npx supabase stop`; states that the output covers `public` only and comes from `supabase/migrations/` (D11); contains a "never" line for pointing it at the shared project (`--linked` / `--project-id`); notes `--local` is deprecated for CLI v4 and the pin protects it. `grep -n 'gen types' README.md` shows no `--linked` command and no raw `gen types … > src/types/database.ts` command other than via `pnpm db:types`. `grep -n 'no-backup' README.md` returns only "never" lines or nothing (T-004 convention, consult rec 2). |
| 6 | Nothing else regresses | `pnpm test`, `pnpm test:coverage` (thresholds still met) and `pnpm build` exit 0. |
| 7 | No secrets or local-stack state in the diff (R3) | `git diff main --stat` lists only files from the table below; `git diff main \| grep -E 'eyJ[A-Za-z0-9_-]{10,}'` returns nothing; no `supabase/.temp`, `supabase/snippets`, `.env*` files added. |
| 8 | The deferred regeneration is recorded, not hidden | `impl-log.md` has a section "Regeneration deferred" stating that Docker was unavailable, that `src/types/database.ts` was left as T-004 generated it, and the expected diff of the first real run (see Ming verification). |

## Ming verification after merge
Proposed `work/ming-todo.md` item for the orchestrator to add (not a `Needs Ming` dependency of this ticket; D12):

```
- [ ] **M-7 — Regenerate DB types once with the pinned script** (after F-002 is merged; needs Docker Desktop, Git Bash on Windows).
      From the repo root on an up-to-date `main`:
      `npx supabase start` → `npx supabase db reset` → `pnpm db:types` → `npx supabase stop` (plain stop, no flags).
      Then `pnpm typecheck && pnpm format:check && pnpm test && pnpm build`.
      Expected diff in `src/types/database.ts`: the `graphql_public` blocks disappear from `Database` and `Constants`
      (the script now passes `--schema public`), plus possibly small changes in the helper types from the pinned CLI version.
      Anything else (a `tudo_*` table/column/enum change) means the committed types had drifted: tell Annie.
      If there is a diff and the checks pass, commit it as `solo: regenerate DB types with pinned CLI` (or ask Annie to /solo it).
      Do not run it while `scripts/test-db-shared.sh` is mid-run.
```

Nothing to check on the hosted project: `--local` never touches it (D11, D17).

## Files to create / modify
| File | Change | Required because |
|---|---|---|
| `package.json` | Add the `db:types` script (Approach step 3). No dependency changes. | Ticket scope; feature list "Add a `pnpm db:types` script". |
| `README.md` | Replace "Set up Supabase" step 5 with the regenerate block (Approach step 5). Optionally one row in "Code map" for `src/types/database.ts` ("generated by `pnpm db:types`, do not edit"). | Ticket scope / AC "documented in the README". |
| `work/tickets/F-002/impl-log.md` | Implementer log: CLI version chosen and how, `--help` outcome, "Regeneration deferred" section, check outputs, greps. | Workflow; AC 8. |

**Not modified** (unless a check fails, which is not expected): `src/types/database.ts` (already generator output; do not
hand-edit — consult rec 4), `src/data/mappers.ts`, `src/data/repo.ts`, `src/data/mappers.test.ts` (the
`nullRow as unknown as ItemRow` cast stays — consult finding 4, R7). If `pnpm typecheck` fails on `main` before any change,
stop and report; do not fix it here.

Do **not** edit: `docs/feature-list.md` (D11 records the change), `docs/qa/smoke-test.md`, `supabase/**`,
`.prettierignore`, `.github/**`, `src/lib/supabase.ts`, `work/backlog.md` (D16), `work/ming-todo.md` (the orchestrator
adds M-7), `work/decisions.md`.

## Tests to write
| Test (file › name) | Covers |
|---|---|
| None new. | Ticket test plan: "Unit: none (F-005 mapper tests cover the types indirectly)". No new pure logic (R8). Existing `src/data/*.test.ts` must stay green. |

## Approach
No Docker daemon in the sandbox: do **not** run `supabase start`, `db reset`, `test db` or `gen types`. Never run any
supabase command with `--linked`, `--project-id`, `link`, `db push`, `db pull` (D17).

1. **Baseline.** On a fresh branch from `main`: `pnpm install --frozen-lockfile`, then `pnpm typecheck`,
   `pnpm format:check`, `pnpm test`, `pnpm build`. All should pass; if not, stop and report (not this ticket's problem).
2. **Pick the CLI pin and check the flag** (network via the proxy):
   - `npm view supabase@3 version` → take the highest `3.x.y` listed. Stay on major 3 (`--local` is removed in v4,
     T-004 impl-log line 40). If the registry is unreachable, use `3.0.0` (previous plan's pin) and write "pin not
     verified" in `impl-log.md`.
   - `npx --yes supabase@<X.Y.Z> gen types typescript --help` (needs no DB). If `--local` is listed (even as deprecated),
     keep it (D11 wording). If it is not listed, drop it — the local DB is then the default — and paste the help excerpt
     into `impl-log.md`. Also confirm `--schema` is listed. If `npx` cannot install the CLI at all (binary download blocked),
     keep `--local --schema public` as written and record that `--help` could not be run.
3. **Script.** Add to `package.json` `scripts` (after `test:coverage`):
   `"db:types": "npx --yes supabase@<X.Y.Z> gen types typescript --local --schema public > src/types/database.ts && oxfmt src/types/database.ts"`.
   - `--schema public`: `public` only; `tudo_private` (security-definer helper, not API) and `graphql_public` stay out and
     the output does not depend on `supabase/config.toml` `api.schemas` (consult finding 2).
   - `npx --yes` + exact pin, not a devDependency: no lockfile change and no postinstall/build-script allowance (consult
     open question 2; previous plan's choice). `oxfmt` resolves from `node_modules/.bin` inside a pnpm script.
   - Formatting inside the script keeps the file under `format:check`; no `.prettierignore` change.
4. **Leave `src/types/database.ts` as it is.** It is T-004's generator output and no migration changed since. Do not
   remove `graphql_public` or otherwise edit it by hand to look like the new script's output (consult rec 4). Run
   `pnpm format` only if `format:check` flags something, and only on files you changed.
5. **README.** Replace step 5 under "Set up Supabase" with a block like:
   - "Regenerate the DB types after any migration change (needs Docker; Git Bash on Windows, not PowerShell — its `>`
     writes UTF-16):"
   - code block: `npx supabase start` / `npx supabase db reset   # local DB = supabase/migrations/` /
     `pnpm db:types` / `npx supabase stop`
   - "The script introspects the **local** stack only (`--local --schema public`, D11) and formats the file. Commit the
     result. Never point it at the shared project (`--linked`, `--project-id`): that pulls in stoktok's tables (D17)."
   - "`db reset` first: the generator reads the running DB, not the migration files, so a stack started before a
     migration change gives stale types. Do not run it while `scripts/test-db-shared.sh` is running."
   - "The CLI is pinned to `<X.Y.Z>`; `--local` is deprecated and goes away in CLI v4, so bump the pin deliberately."
   - Use plain `npx supabase stop` (T-004/README convention: no `--no-backup`). Keep the other README sections unchanged.
   - Optional code-map row: `src/types/database.ts` — "Generated by `pnpm db:types`; do not edit by hand".
6. **Checks.** `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm test:coverage`, `pnpm build` — all green.
   Run the AC 3, 5 and 7 greps; paste outputs into `impl-log.md`.
7. **impl-log "Regeneration deferred"** section (AC 8): Docker unavailable; file unchanged from T-004; expected first-run
   diff (`graphql_public` removed from `Database` and `Constants`, possible helper-type changes from the pinned CLI);
   pointer to the M-7 text in this plan.

Rules: **R1** — no runtime change; local mode untouched. **R2** — no migration touched; types still generated from
migrations (regeneration deferred to M-7, file currently generator output). **R3** — no keys; never run `supabase status`
into a file. **R7** — files limited to the table. **R8** — checks green; no new pure logic. **R10** — no Figma Make
files. Expected tier: Medium (`package.json`).

## Specialist input used
From `consult-database-optimizer.md` (2026-11-09):
- **Adopted** — Finding 1 / rec 1: keep `--local` (D11); never `--linked`/`--project-id` (D17). Help check before use.
- **Adopted** — Finding 2: `--schema public`; no `--schema tudo_private`. Reviewer told the first real run diffs by
  ~20 lines (`graphql_public`), and that this is expected (M-7 text, AC 8).
- **Adopted** — Finding 3 / rec 4: the file is already generator output; F-002 delivers script + README + formatting;
  agent does not hand-edit the file; regeneration is a Ming step after merge, not a blocker (open question 1 → resolved:
  ship now, regenerate after, per D12).
- **Adopted** — Rec 2: documented sequence start → `db reset` → `db:types` → `stop`; plain `stop` without `--no-backup`
  (open question 3 → resolved: yes, per T-004 README convention); a "never the shared project" line.
- **Adopted** — Rec 3 / finding 4: the "view rows are all nullable" statement is dropped; the `nullRow` cast stays (open
  question 4 → resolved: no, R7; listed as follow-up).
- **Adopted, adjusted** — Finding 6 / rec 1 pin: exact pin via `npx --yes` (open question 2 → resolved: no devDependency;
  no earlier consult or decision overrides it). Version is the latest `3.x.y` checked on npm at implementation time instead
  of a blind `3.0.0`, since nothing records which version T-004 used.
- **Deferred** — Rec 5 (CI drift job): follow-up, not this diff (R7).
- **Adopted** — Risks: `test-db-shared.sh` concurrency and PowerShell UTF-16 go into the README text.

## Assumptions
- Ticket text "Requires `npx supabase start`" and "Regenerate `src/types/database.ts`" are satisfied by the script plus
  the M-7 one-time run; the file on `main` is already the regenerated output from the same migrations (T-004 review line
  19). The orchestrator adds M-7 to `work/ming-todo.md`; F-002's `Needs Ming` stays `—`.
- The feature list's `--linked` is superseded by D11/D17; `docs/feature-list.md` is not edited (flagged here as the
  known conflict, resolved by decisions).
- If `npx` cannot download the Supabase CLI in the sandbox, the script is still correct by inspection; the M-7 run is
  its first execution. Small risk that a flag spelling is wrong; mitigated by the `--help` step when possible and by M-7.
- If generation fails midway on Ming's machine, `>` leaves the file truncated; `git checkout -- src/types/database.ts`
  restores it. Acceptable for a dev script (noted in impl-log, not in README).
- Hotspots: no ticket in `IN_PROGRESS`/`REVIEW`/`DONE` touches `package.json` or `README.md` (board 2026-11-09). Later
  migration tickets (T-005.2, T-005.4) will run `pnpm db:types`; F-004.x do not touch these files.
- Follow-ups (not in this diff, R7): (a) CI job: `supabase start` + `db reset` + `pnpm db:types` +
  `git diff --exit-code src/types/database.ts` (GitHub runners have Docker); (b) align `tudo_items_with_stats` Row
  nullability with runtime nulls and remove the `nullRow as unknown as ItemRow` cast in `mappers.test.ts`; (c) pin the
  CLI version in `docs/qa/smoke-test.md` / README test commands for consistency; (d) ticket technical note "Generated view
  rows are all nullable" is stale.

## Blocking questions
None.

## Split proposal
None (expected diff well under 100 lines).
