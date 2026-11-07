# Decisions — TuDoCuaTui

Decisions that change or clarify `docs/feature-list.md`. Agents read this before planning. Newest last.
On 2026-11-07 Ming delegated the open M1 questions to Annie (Claude Code): "tự quyết định". Each entry below
records the choice and the reason. Ming can overturn any of them: edit the entry, date it, and the affected
ticket is re-planned.

| # | Date | Topic | Decision | Why | Tickets |
|---|---|---|---|---|---|
| D1 | 2026-11-07 | JSON restore and ids | Restore keeps ids when they are free or already owned by the caller; ids owned by another user get new ids, and every reference is remapped. Photos are not restored across accounts (their paths are owner-scoped). The AC "restore into an empty account" becomes "same account after wipe → identical JSON". | `items.id` is a global PK and RLS blocks overwriting another user's rows | F-602 |
| D2 | 2026-11-07 | Camera capture | Two buttons on mobile ("Chụp ảnh" with `capture="environment"`, "Chọn từ thư viện" without). Desktop keeps one upload zone. | `capture` hides the gallery on Android Chrome | F-1002 |
| D3 | 2026-11-07 | Photo input size limit | Keep 10 MB, as the feature list says. | Easy to raise later; the stored file is resized anyway | F-202.1 |
| D4 | 2026-11-07 | HEIC | Convert on the client with a maintained HEIC decoder that is **lazy-loaded** only when a HEIC file is picked; on failure show a clear error. | Desktop Chrome cannot decode HEIC; no bundle cost for everyone else | F-202.1 |
| D5 | 2026-11-07 | Hosting and previews | **Cloudflare Pages** with Git integration. Only the production environment gets `VITE_SUPABASE_*`; previews run in local mode. | Free static hosting, previews per PR, and mmlabs domains are already on Cloudflare; one Supabase project means previews must not touch real data | F-007 |
| D6 | 2026-11-07 | Coverage scope | The 80% threshold covers `src/data/**` except `photos.ts` (canvas). The Supabase repo is covered with a small hand-written fake client; split it into F-005.2 if it grows beyond about 2 hours. | Honest coverage without a canvas polyfill | F-005 |
| D7 | 2026-11-07 | CSV wear columns | `wear_count` / `last_worn` are exported but ignored on import, and listed as "ignored columns" in the preview. | They are derived from wear logs (R5) | F-601.2, F-604 |
| D8 | 2026-11-07 | CSV locations | A CSV location matches an existing location whose `normalize()`d name is equal (case/diacritic-insensitive, trimmed); otherwise it is created. | Avoids duplicates like "Tủ ngăn 1" / "tủ ngăn 1" | F-601.2 |
| D9 | 2026-11-07 | Tickets not in the feature list | Accept T-001 (hide mock AI controls; in Supabase mode only, so the Figma Make preview is unchanged), T-002 (wear date math), T-003 (RLS gaps, only if F-006 confirms them). | They are bugs or gaps in today's code that block "daily use" | T-001, T-002, T-003 |
| D10 | 2026-11-07 | First `risk-tiers.yml` | Ming reviews it as part of the F-003 PR. | It sets merge rules for every later PR | F-003 |
| D11 | 2026-11-07 | DB types source | `supabase gen types typescript --local` (local stack from `supabase/migrations/`) instead of `--linked`. | No Supabase login or secret needed; the migrations are the source of truth | F-002 |
| D12 | 2026-11-07 | Human steps | Tickets contain agent work only. Steps only Ming can do are `M-n` items in `work/ming-todo.md`; a ticket waits on one only when it lists it in `Needs Ming`. | Lets the loop run without waiting on Ming | F-001, F-007, all |
| D13 | 2026-11-07 | Workflow | Same loop as stoktok (`/run`: plan → implement → review → PR, Ming merges). Differences: a plan-approval stop for High-tier tickets (`Gate: plan-approval`, workspace rule §8), and a dependency counts only when it is `MERGED`. | Branches start from `main`; High paths need Ming's eyes before code | all |
| D14 | 2026-11-07 | Ticket ids | Feature ids stay (`F-xxx`, splits `F-xxx.n`); tickets not in the feature list are `T-xxx` (`NEW-1..3` in the first plan draft became `T-001..003`). Tickets live in `work/tickets/`; `docs/tickets/M1.md` was removed after its content moved there. | One source of truth per ticket | all |
| D15 | 2026-11-07 | Agents | **Claude Code only.** Antigravity (Andy) does not work on TuDoCuaTui; Claude plans, implements, writes tests and reviews. Ming: "quên Andy đi, Annie giải quyết hết cho tôi". | Ming's decision; one agent, no handoff overhead | all |
