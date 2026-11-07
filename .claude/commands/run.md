---
description: Run the full plan → implement → review loop for one ticket, dispatching subagents automatically.
argument-hint: "[ID]"
---

<!-- Orchestration logic adapted from agency-agents: specialized/agents-orchestrator.md and strategy/coordination/handoff-templates.md (MIT), via the stoktok project.
     The orchestrator is this command running in the main session, because subagents cannot dispatch subagents. -->

You are the **orchestrator** for ticket `$ARGUMENTS`.

**Board rule:** `work/backlog.md` is the shared board and is changed **only on `main`** (commit `chore: board — …`, pull first, push). Ticket branches change only their own `work/tickets/<ID>/` files (plus `work/ming-todo.md` when a stop adds an item), so parallel PRs never conflict on the board. The ticket's own `ticket.md` is the source of truth for its state; the board mirrors it.
 You dispatch subagents and keep the board true. You write **no product code, no plan, no review** yourself — only ticket state, backlog rows, consult files, Handoff entries and the escalation report.

## 0. Select and prepare
1. `git switch main && git pull --ff-only`. Refresh the board first: for every ticket whose `ticket.md` on its branch or on `main` has a PR link, check it (`gh pr view <url> --json state,mergedAt`); if merged, set `MERGED` in the board row (and in `ticket.md` on `main` if it was merged with `DONE`). Also mirror the current state of open tickets from their branches into the board. Commit `chore: board — sync` on `main` and push if anything changed.
2. If `$ARGUMENTS` is empty, pick the **first row in `work/backlog.md` order** that is runnable:
   - state `BACKLOG`, or `BLOCKED` whose blocking questions / plan approval are now answered in ticket.md (*Notes / answers from Ming*);
   - every ticket in its `Depends on` is `MERGED`;
   - every `M-n` in its `Needs Ming` is ticked (`- [x]`) in `work/ming-todo.md`;
   - `Claimed by` is empty, or older than 12 hours (a stale claim — say so in the report).
   If none is runnable, report "Nothing runnable" with the reason for the next three rows (waiting on merge of X / Ming item M-n / blocked) and stop.
3. With an explicit ID, check the same conditions; if one fails, stop and tell Ming which one. Refuse `DONE`, `MERGED` or `ESCALATED` tickets.
4. Make sure the working tree is clean (`git status --porcelain`). If not, stop and report.
5. Create or switch to branch `ticket/<ID>` from the latest `origin/main`. If the environment mandates a different working branch (e.g. a cloud session's designated branch), use that branch instead and say so in the report.
6. In ticket.md set `Claimed by: claude@<ISO timestamp>` and state `PLANNING`. Also set the board row to `PLANNING` on `main` (board rule) before switching to the ticket branch. Commit `work/` (`<ID>: start planning`) and push the branch, so another agent sees the claim.

## 1. Consult (only for the ticket's `Areas`)
| Area | Subagent |
|---|---|
| architecture | `software-architect` |
| db | `database-optimizer` |

Dispatch the matching specialists **in parallel**, each with: the ticket path, "consult mode, read-only, return Findings / Recommendations / Risks / Open questions". Save each reply verbatim to `work/tickets/<ID>/consult-<agent>.md`. Skip this step if `Areas` has none of the above, or if this is a resumed `BLOCKED` ticket that already has consult files.

## 2. Plan
Dispatch `planner` with the ticket path (on a resumed ticket: "re-plan using the answers in ticket.md"). When it returns, read `plan.md`:
- `Status: BLOCKED` → set state `BLOCKED`, go to **Stop and hand off** (below) with the blocking questions.
- `Status: READY` and ticket field `Gate` is `plan-approval` and *Notes / answers from Ming* has no "Plan approved" line dated after the plan → set state `BLOCKED`, add the line `Waiting for Ming: plan approval (High tier)` to ticket.md, add an unticked item to `work/ming-todo.md` ("Approve plan for <ID>: work/tickets/<ID>/plan.md"), go to **Stop and hand off**.
- `Status: READY` otherwise → set state `IN_PROGRESS`, commit `work/` (`<ID>: plan`), continue. (No approval gate for other tickets.)

## 3. Implement
Dispatch `implementer` with: ticket path, "implement plan.md; attempt N". Verify impl-log.md has a new attempt section; if not, treat it as a failed attempt.

## 4. Review
Set state `REVIEW`. Then:
1. Decide whether security review is needed: `Areas` contains `security`, **or** the diff (`git diff --name-only origin/main...HEAD`) touches any of: `supabase/`, `src/features/auth/`, `src/lib/supabase.ts`, `src/data/repo.ts`, `**/*.sql`, `.env.example`, `vite.config.ts`, `public/_redirects`, `.github/workflows/`. If yes, dispatch `security-ai-generated-code-auditor` **in parallel** with the reviewer and save its reply to `security-review.md` (append per attempt).
2. Dispatch `reviewer` with the ticket path and attempt number.
3. Read the latest section of `review.md`. The verdict is the first line: `Verdict: PASS` or `Verdict: REWORK`.
4. A 🔴 finding in `security-review.md` turns a PASS into REWORK: append it to the review attempt under "Security blockers".

## 5. Loop decision
- **PASS** → set state `DONE` in ticket.md, commit `work/tickets/<ID>/` (`<ID>: done`). Go to 6.
- **REWORK** and reworks so far < 2 → increment `Attempts` in ticket.md, set state `REWORK`, dispatch `implementer` with "REWORK attempt N: fix only the issues in the latest review.md section", then return to step 4.
- **REWORK** and reworks so far = 2 → set state `ESCALATED`, write `work/tickets/<ID>/escalation.md` from `work/templates/escalation.md` (what failed each attempt, root-cause guess, options for Ming), add an item to `work/ming-todo.md`, go to **Stop and hand off**.

## 6. Open the pull request (DONE only)
1. Rebase on the latest main if it moved (`git fetch origin main && git rebase origin/main`). On conflicts in files outside `work/`, abort the rebase, keep the PR unrebased and list the conflict under *Needs Ming's decision*.
2. Push the branch: `git push -u origin <branch>`.
3. Open a PR into `main` with `gh pr create` (or the GitHub MCP). If a PR for this branch is already open, update it instead of opening a second one.
   - Title: `<ID>: <ticket title>`.
   - Body (English, short):
     - **Summary**: what changed, 2–4 bullets.
     - **Acceptance criteria**: the ticket's checklist, each ticked with one line of evidence from `review.md`.
     - **Checks**: the results of the checks listed in `CLAUDE.md`, from the review.
     - **Needs Ming's decision**: divergences from the feature list, planner assumptions to confirm, Ming steps after merge (or "none").
     - **Follow-ups**: from impl-log, review and security-review.
     - Links to `plan.md`, `review.md`, `security-review.md` in the ticket folder.
     - End with the attribution line required by the session.
4. Write the PR URL into ticket.md (`| PR | <url> |`), clear `Claimed by`, append the Handoff entry (below), commit `<ID>: link PR`, and push.
5. **Never approve, merge or enable auto-merge.** Ming reviews and merges the PR.

## Stop and hand off (BLOCKED / ESCALATED)
Clear `Claimed by`, append the Handoff entry, commit `work/tickets/<ID>/` and `work/ming-todo.md` (`<ID>: plan blocked` / `<ID>: escalated`), push the branch (no PR), and stop: show Ming the questions or the escalation.

## Handoff entry
Append to `## Handoff` in ticket.md:
```
### YYYY-MM-DD — claude — <final state>
- Done: …
- In progress / next: …
- Gotchas: …
```

## 6b. Update the board
On `main` (pull first), set the ticket's board row to its final state (`DONE` with attempts, `BLOCKED` or `ESCALATED`) and today's date; commit `chore: board — <ID> <state>` and push. Switch back to `main` before ending, with a clean tree.

## 7. Report to Ming
Short summary in Vietnamese: ticket, final state, attempts, files changed (`git diff --stat origin/main...HEAD`), check results, follow-ups the agents listed, and the next step: the PR link to approve and merge, or the escalation / blocking questions. Then name the next runnable ticket (or why none is).

## Guardrails
- Pass each subagent only what it needs (paths, attempt number, the exact instruction). Do not paste whole files into prompts.
- Never edit `plan.md`, `impl-log.md` or `review.md` to change an outcome.
- If a subagent fails or returns nothing twice in a row, set `ESCALATED` with the reason and stop.
- Never run `supabase db push`, never touch the hosting dashboard, never read `.env*` values: those are Ming items.
