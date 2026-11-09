# Consult — database-optimizer — F-002 (2026-11-07)

**Findings**
- CLI is 3.0.0. `gen types` targets the local DB by default; `--remote[=ref]` targets the linked project; flags include `--lang`, `--schema/-s`, `--query-timeout`. The old `--local` flag is not in the help output: it may be accepted as a deprecated no-op or rejected. Verify with one run, or omit it (local is the default, so D11 is still met).
- It needs Postgres up, because it introspects the local DB (Docker, ports 553xx, project_id tudocuatui). Sequence: `supabase start` → gen → `supabase stop`. calechip (543xx) uses a different project_id and ports and is unaffected, as long as commands run from the worktree (or pass `--workdir`). Never use `supabase stop --all`.
- Current hand-written file: enums are non-exported aliases; `Functions` / `CompositeTypes` are `{[_ in never]: never}`; there is no `__InternalSupabase` and no helper exports. View Rows are already all-nullable, matching the generator.
- Likely generated differences:
  - an `__InternalSupabase: { PostgrestVersion }` header;
  - view Row nullable for `i.*`, and `wear_count` still `number | null` (the mapper already uses `?? 0`);
  - enums inline as string unions plus an `Enums` block;
  - `Insert` optionality follows column defaults;
  - tail exports `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, `CompositeTypes`, `Constants` (the last is a runtime const, harmless);
  - `Relationships` populated with FK entries;
  - a slightly different `Json` shape.
- Code at risk: `mappers.ts` uses only `Enums`, `Views.items_with_stats.Row` and `Tables.items.Insert`, so its structure is unchanged. Possible failures:
  - `itemToRow` return type, if Insert optionality differs;
  - test fixtures in `mappers.test.ts` that build view Row literals (excess-property / missing-field checks).
  - `repo.ts` is fine (it already handles nullable fields).

**Recommendations**
1. Script: `"db:types": "supabase gen types typescript --schema public > src/types/database.ts && oxfmt src/types/database.ts"`. Pin the CLI version for reproducible output. (A `supabase` devDependency needs `onlyBuiltDependencies` for its postinstall, which is security-relevant; a pinned `npx supabase@<ver>` avoids that.) Document start/gen/stop in the README; run in Git Bash/WSL.
2. Format the file inside the script; do not ignore it, so `format:check` stays meaningful. Fallback, if oxfmt churns the output: add the file to `.prettierignore`.
3. Generate via bash. PowerShell 5.1 `>` writes UTF-16 LE, which breaks tsc. Afterwards confirm UTF-8 without a BOM, and that `git diff --stat` shows no whole-file churn (`.gitattributes` eol=lf and oxfmt normalise line endings).
4. Drop the hand-written header comment; update comments that mention `--linked`.
5. Do not check types freshness in CI now (it needs Docker); add a follow-up: a CI job that runs start + `db:types` + `git diff --exit-code src/types/database.ts`.

**Risks**
- `--local` may be rejected by CLI 3.0; use the default.
- A stale tudocuatui stack may collide on ports; the first start pulls images.
- Generator output depends on the CLI version, so unpinned `npx` gives noisy diffs.

**Open questions (defaults)**
1. Add `supabase` as a devDependency? Consultant default: yes, pinned. Orchestrator note: prefer a pinned `npx supabase@3.0.0` to avoid allowing a dependency build script.
2. Keep the `Constants` export? Default: yes (generated, unedited).
3. Run `supabase stop` after gen? Default: yes.
