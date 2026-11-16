---
description: Record a bug as a BUG-xxx ticket (report, repro, expected/actual, root cause) for /run.
argument-hint: "<what is wrong> [S1|S2|S3]"
---

Record a bug from: `$ARGUMENTS` (plus any screenshot Ming attached).

1. ID: the highest existing `BUG-xxx` in `work/tickets/` + 1, zero-padded to 3 digits (first is `BUG-001`).
   Search `work/tickets/BUG-*/ticket.md` first: if an open bug already covers it, add the report to that
   ticket's *Notes / answers from Ming* instead and stop.
2. Investigate read-only before writing (no product code changes):
   - Find the code path (file:line). Try to reproduce: a unit test run, or Playwright for CSS / CSP /
     browser-only behaviour. Record the result in **Root cause** as *confirmed* or *suspected*.
   - `Found in`: the version Ming named, else "unknown". `Introduced in`: from `git log -S` / `git tag --contains`
     when you can tell, else "unknown".
3. Create `work/tickets/<ID>/ticket.md` from `work/templates/bug.md`. All sections filled or "unknown".
   - **Severity**: S1 = data loss, security, or a core flow is impossible (save, sign in, photos);
     S2 = a feature is broken but there is a workaround, or the UI misleads; S3 = cosmetic.
     Priority: S1 → P0, S2 → P0 or P1, S3 → P2, unless Ming said otherwise.
   - **Gate**: `plan-approval` if the fix touches a High path (`CLAUDE.md` → Risk tiers), else `none`.
   - Acceptance criteria always include the regression test criterion from the template.
   - Do not commit screenshots; describe them. Never copy emails or personal data from a screenshot.
4. Insert a board row in `work/backlog.md`: S1 bugs go **above** the first runnable `BACKLOG` row; others after the
   last ticket they depend on, else at the end of the open rows. Title starts with nothing special; the ID shows it is a bug.
5. Record it through a pull request (D42), so the bug lands on `main` and `/run` can fix it later:
   - Start from a clean tree: create branch `bug/<ID>` from the latest `origin/main` (in a cloud session with a
     mandated branch, use that branch and say so). Several bugs recorded in one session may share the branch/PR.
   - The branch holds only the bug record: `work/tickets/<ID>/ticket.md` and its `work/backlog.md` row. No product code.
   - Commit `chore: board — add <ID> (<short title>)`, push (`git push -u origin <branch>`).
   - Open a PR into `main` (GitHub MCP `create_pull_request`); if a PR for this branch is already open, update its
     title/body instead. Title: `<ID>: record bug — <short title>` (several bugs: `Record bugs <ID>, <ID>`).
     Body (English, short): severity, found in / introduced in, one-line actual vs expected, root cause
     (confirmed/suspected, file:line), link to the ticket file, "Fix: `/run <ID>` after merge", and the attribution
     line required by the session.
   - Add `- YYYY-MM-DD — claude — recorded; record PR <url>` under `## Handoff` (the `PR` field stays for the fix PR),
     commit and push.
   - **Never approve, merge or enable auto-merge.** Ming merges; until then `/run` cannot see the bug on `main`.
6. Reply to Ming in short Vietnamese: ID, severity, what is wrong, root cause (confirmed/suspected), affected
   versions, the record PR link, and the next step (merge the PR, then `/run <ID>`).
