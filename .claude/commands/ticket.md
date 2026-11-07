---
description: Create a new ticket in work/ from a short description.
argument-hint: "<description> [P0|P1|P2]"
---

Create a ticket from: `$ARGUMENTS`

1. Read `work/backlog.md` and `docs/feature-list.md`.
   - If the description matches a feature `F-xxx` that has no ticket yet, use that ID (and the feature's
     priority, size, milestone and dependencies).
   - Otherwise the ID is the highest existing `T-xxx` + 1, zero-padded to 3 digits.
2. Create `work/tickets/<ID>/ticket.md` from `work/templates/ticket.md`:
   - **Goal**: one or two sentences, in English.
   - **Feature reference**: the `F-xxx` section of `docs/feature-list.md`. If none fits, say so and ask Ming
     whether it is in scope before creating the ticket.
   - **Acceptance criteria**: 3–7 testable bullets from the description and the feature list. Do not invent requirements.
   - **Areas**: any of `ui`, `data`, `db`, `security`, `architecture` that genuinely apply.
   - **Gate**: `plan-approval` if the ticket will touch a High path (see `CLAUDE.md` → Risk tiers), else `none`.
   - **Depends on** / **Needs Ming**: ticket IDs and `M-n` items from `work/ming-todo.md`, or `—`.
   - Priority from the argument if given, else the feature's priority, else `P1`. State `BACKLOG`, attempts `0`.
3. If the ticket is larger than **M** (about one day), propose a split into `<ID>.1`, `<ID>.2`… instead, and
   ask Ming which to create.
4. Insert a row into `work/backlog.md` after the last ticket it depends on (backlog order is run order).
5. Do not commit. Show Ming the ticket in a short Vietnamese summary.
