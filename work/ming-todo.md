# Ming's to-do (things only Ming can do)

Agents read this before `/run`. A ticket waits on an item only if it lists the item in `Needs Ming`.
Tick (`- [x]`) and date items when done. `/run` adds plan-approval and escalation items here.

## Always
- Review and merge the PRs that `/run` opens (`/status` lists them). Agents never merge.

## Setup
- [ ] **M-1 — Hosted Supabase project.** Create the project; `npx supabase login`; `npx supabase link --project-ref <ref>`;
      `npx supabase db push`; Auth → URL Configuration: add `http://localhost:8443` to Redirect URLs; put the
      Project URL and anon key in `.env.local`. (README → "Set up Supabase".)
- [ ] **M-2 — Smoke test** (after F-001 is merged and M-1 is done): run `docs/qa/smoke-test.md` once in Supabase
      mode; fill in its results table; file each failure with `/ticket`.
- [ ] **M-3 — Branch protection** (after F-003 is merged): GitHub → Settings → Branches → `main`: require the `ci` check.
- [ ] **M-4 — Cloudflare Pages** (after F-007 is merged): follow README → "Deploy": connect the repo, set the
      production-only env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, add the production URL to the
      Supabase Redirect URLs, then log in on a phone with a magic link.
- [ ] **M-5 — Apply migration** (after T-003 is merged, if it exists): `npx supabase db push`. If the hosted project already has data, first run the two read-only precheck `select`s in the header of `supabase/migrations/20261107120000_rls_hardening.sql`; both must return zero rows.
- [ ] **M-6 — Phone checks** after each of these merges, on an iPhone and an Android phone: F-202.1 (photo
      upload), F-1002 (camera / library buttons), F-603 (30 photos), F-101 (login screen, dark mode).
      Write problems as `/ticket`.

## Plan approvals and escalations
<!-- /run appends items here, e.g. "- [ ] Approve plan for F-101: work/tickets/F-101/plan.md" -->
- [x] (2026-11-07) Approve plan for T-003 (branch `ticket/T-003`): work/tickets/T-003/plan.md — new RLS migration; changes vs ticket listed as C1–C9
- [ ] Approve plan **Revision 2** for T-003 (branch `ticket/T-003`): work/tickets/T-003/plan.md — attempt 1 hit policy recursion; fix uses a `private.owns_location()` helper; new changes C10–C13
- [ ] Approve plan for F-007 (branch `ticket/F-007`): work/tickets/F-007/plan.md — drops `_redirects`, see "Changes vs ticket scope"
- [x] (2026-11-07) Approve plan for F-101 (branch `ticket/F-101`): work/tickets/F-101/plan.md
