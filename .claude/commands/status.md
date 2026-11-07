---
description: Summarize the ticket board.
---

Read `work/backlog.md`, each listed `work/tickets/*/ticket.md` (state, attempts, PR, Claimed by) and
`work/ming-todo.md`. Reply in Vietnamese, short:

1. Counts per state, and M1 progress (`MERGED` / total).
2. Tickets that need Ming: `BLOCKED` (the blocking questions from plan.md, or "plan approval"), `ESCALATED`
   (one-line reason from escalation.md), and open items in `work/ming-todo.md`.
3. `DONE` tickets: show the PR link and its state (`gh pr view <url> --json state,mergeable`). Flag a `DONE`
   ticket with no PR link, and PRs with merge conflicts.
4. Active claims (`Claimed by` set), flagging any older than 12 hours.
5. The next ticket `/run` would pick, or why nothing is runnable.

If backlog.md and a ticket.md disagree on state, report the mismatch. The only file change allowed: when a PR
is merged, set that ticket to `MERGED` in both files and commit `chore: mark merged tickets` on `main` (pull
first; push). Change nothing else.
