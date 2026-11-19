Status: READY

# Plan — BUG-007: Signing out in one tab wipes another tab's saved account

## Scope summary
Scope reference is the bug report in `ticket.md`:

- Expected: "Tab B still restores Y: only the departing account's id is removed from storage."
- Scope: "Clear `mm_account_id` only when it still holds the departing account; nothing else."
- Out of scope: "Broadcasting sign-out on session_invalid/forget (T-029)."
- Background: T-028.3 plan.md follow-up: "Clear `mm_account_id` on sign-out/remote sign-out only if it still holds the
  account that left (`storage.read() === gone`)". T-028.3 security-review.md:28 lists it as a known side effect, and
  T-028.3 consult-frontend-developer.md §1 calls it a pre-existing hazard.

### Root cause (confirmed, with one detail added)
`src/features/auth/tokenStore.ts` holds one shared `localStorage.mm_account_id` (`accountId.ts:1`). Since T-028.3,
two tabs can hold two different accounts, and the key holds whichever tab called `adopt()` last (`:226-232`). Five
sites call `storage.clear()` without checking which id is stored:

| Line | Site | Departing id at that point |
|---|---|---|
| `:157` | `renew()` catch, `session_invalid` | `accountId` (captured at `:121`; the epoch check at `:151` guarantees `id === accountId`) |
| `:221` | `onMessage`, remote `signedOut` | `id`, which `:207` has already matched to `msg.accountId` (case-insensitive) |
| `:252` | `signOut()` | `gone` (`:247`), possibly `null` |
| `:280` | `forget()` | `id` before it is nulled, possibly `null` |
| `:326` | `join()` catch, `session_invalid` | `id` (the `gen === generation` check guarantees it did not change since `client.join(id)`) |

The ticket's repro (A=X signs out after B continued as Y) goes through `:252` in tab A. A further detail: any other
tab still on X receives A's `signedOut` and clears storage again through `:221`. So fixing `:252` alone still loses Y
whenever a third tab is on X. Test 2 below covers that case.

### Decision per clear site: all five become "clear only if the stored id is the departing id"
- **`:252` signOut.** This is the reported bug. X is leaving, and Y belongs to another tab's live session.
- **`:221` remote signedOut.** The same event seen from a third tab. The message only concerns X, so it must not
  remove Y.
- **`:280` forget.** It is called from `AuthGate` (`onAuthLost` `:265`; `session_invalid` on resend `:395`; "Dùng tài
  khoản khác" `:467`, `:492`). Each of these drops *this tab's* account and nothing else. Its JSDoc says "Drops token
  and account id", meaning this store's id. When `id` is `null`, nothing is cleared: a store whose id is `null` can only
  see a stored value that another tab wrote, because the store reads storage once at creation (`:74`).
- **`:157` and `:326` session_invalid.** Identity said that X's account session is gone, which says nothing about Y.
  A stale Y left in storage is self-correcting: the next `/token` for Y (B's own renewal, or `restore()` on reload)
  gets `session_invalid` for Y, and the stored id equals Y at that moment, so it is cleared. Clearing Y
  unconditionally instead would sign B out on reload for no reason. This is the same bug, so it is in scope (the ticket
  Root cause names both lines).

Comparison is case-insensitive, matching `onMessage` (`:207`) and `accountEmail` (`:314`).

## Acceptance criteria → verification
| # | Criterion | How the reviewer verifies it |
|---|---|---|
| 1 | A regression test reproduces the bug: two stores sharing storage, A=X signs out after B continued as Y → storage still holds Y (fails on `main`, passes after). | `tabs.test.ts › BUG-007: A (X) signs out after B continued as Y on shared storage -> storage still holds Y`. The implementer records in impl-log the failing run on the unfixed code (test added first, `expected null to be ID2`), then the passing run. The reviewer may revert `tokenStore.ts` locally to confirm. |
| 1b | The same holds for every other clear site (remote signedOut, forget, both session_invalid paths). | `tabs.test.ts › BUG-007: a third tab still on X gets the remote signedOut and keeps Y in storage`; `tokenStore.test.ts › BUG-007: %s keeps another account's stored id` (rows: signOut, forget, getToken session_invalid, join session_invalid). All fail on unfixed code. |
| 2 | Signing out the account that is stored still clears it (existing tests stay green). | Unchanged existing tests: `tokenStore.test.ts › session_invalid clears token and id and notifies`, `› restore rejects with session_invalid and removes the id`, `› removes the id even when logout rejects`, `› forget clears without logout`, `› email_unverified keeps the id; session_invalid clears it`, `› join rejection (join_closed) … session_invalid clears the id`, `› never writes anything but mm_account_id …` (real `localStorage` ends `null`), `› signOut waits for a running renewal before /logout` and `› clears the id, then calls logout with it …` (`calls` still start with `"clear"`); `tabs.test.ts › sign-out in A signs out B (memory, storage, listener) …` (`b.clear` called); all `AuthGate.test.tsx` cases (`id-cleared` events). New: `tokenStore.test.ts › BUG-007: a stored id differing only in case is still cleared`. |
| 3 | All checks pass. | `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`. |

## Ming verification after merge
- Optional real-browser check (jsdom cannot see two real tabs; the unit tests model them): tab A signed in as X, tab B
  uses "Tiếp tục với Y", tab A signs out, reload tab B → B is still Y.

## Files to create / modify
| File | Change | Required because | High path? |
|---|---|---|---|
| `src/features/auth/tokenStore.ts` | Add a private helper `forgetStored(gone)` and use it in place of the five `storage.clear()` calls; capture the departing id where it is nulled first (`onMessage`, `forget`). | The fix. | **Yes**: `src/features/auth/**` (CLAUDE.md High tier) |
| `src/features/auth/tabs.test.ts` | Let `world().tab()` take an optional shared storage; add a `sharedStorage()` helper and regression tests 1 and 2. | AC1, AC1b. Today each fake tab has its own `stored` cell, so the bug cannot be seen. | Yes (same folder), test-only |
| `src/features/auth/tokenStore.test.ts` | `setup()` also returns `setStored(v)` (simulates another tab writing the key); add tests 3 and 4. | AC1b, AC2. | Yes (same folder), test-only |

No change to `accountId.ts`, `AccountIdStorage`, `fakeTabs.ts` or `AuthGate.tsx`.

## Tests to write
Write and run test 1 first, on the unfixed code, and record the failure in impl-log.

| Test (file › name) | Covers |
|---|---|
| 1. `tabs.test.ts › BUG-007: A (X) signs out after B continued as Y on shared storage -> storage still holds Y` (regression). `const shared = sharedStorage(ID)`; `a = w.tab({ storage: shared })`, `b = w.tab({ storage: shared })`; A `getToken` → `tok1`; `b.store.continueAs(ID2, "y@b.co")`; `shared.value()` is `ID2`; `await a.store.signOut()` with `settle()`; expect `shared.value()` to be `ID2`, `b.store.accountId()` to be `ID2`, B's `onRemoteSignOut` listener not called, `a.store.accountId()` null, `a.client.logout` called with `ID`. On `main` it fails at `shared.value()` (`null`). | AC1, site `:252` |
| 2. `tabs.test.ts › BUG-007: a third tab still on X gets the remote signedOut and keeps Y in storage`. A and C on X with the shared storage, B continues as Y, A signs out → C's remote listener is called once, `c.store.accountId()` is null, `shared.value()` is still `ID2`, and B is untouched. Fails on `main`, and would still fail if only `:252` were fixed. | AC1b, site `:221` |
| 3. `tokenStore.test.ts › BUG-007: %s keeps another account's stored id` (`it.each`). In each row, `setup()` (id `ID`), then `s.setStored(ID2)` (another tab adopted Y), then: (a) `signOut()`; (b) `forget()`; (c) `client.token` rejects `session_invalid` → `getToken()` rejects; (d) `client.join` rejects `session_invalid` → `join()` rejects. Expect `s.stored()` to be `ID2`, `s.storage.clear` not called, and `s.store.accountId()` null. | AC1b, sites `:252`, `:280`, `:157`, `:326` |
| 4. `tokenStore.test.ts › BUG-007: a stored id differing only in case is still cleared`. `setup()`, `s.setStored(ID.toUpperCase())`, `signOut()` → `s.stored()` is null. Passes on `main` too: it guards against the fix being too strict. | AC2, case-insensitive match |

**Existing tests that change:** none of their assertions change. Only fixtures are extended, and existing calls keep
their current behaviour:
- `tabs.test.ts` `world().tab(opts)`: the new optional `storage` field defaults to today's per-tab cell. The `clear`
  spy and `stored()` follow whichever storage is used.
- `tokenStore.test.ts` `setup()`: it gains a returned `setStored`; nothing else changes.

## Approach
1. Add test 1 to `tabs.test.ts` with the shared-storage fixture:
   ```ts
   function sharedStorage(initial: string | null) {
     let v = initial;
     return { read: () => v, write: (x: string) => void (v = x), clear: vi.fn(() => void (v = null)), value: () => v };
   }
   ```
   and `tab(opts: { id?: string | null; storage?: ReturnType<typeof sharedStorage> } = {})`, where the given storage
   replaces the per-tab cell. `clear` and `stored()` then point at it. Run it against the unfixed code and record the
   failure.
2. Add tests 2–4 (and `setStored` in `setup()`). Tests 2 and 3 fail on unfixed code; test 4 passes.
3. In `tokenStore.ts`, add next to `reset`:
   ```ts
   /** Clears `mm_account_id` only while it still names `gone`: another tab may have stored its own account since (BUG-007). */
   const forgetStored = (gone: string | null) => {
     const stored = storage.read();
     if (gone && stored && stored.toLowerCase() === gone.toLowerCase()) storage.clear();
   };
   ```
   Then replace each clear call:
   - `:157` → `forgetStored(accountId)`.
   - `onMessage` → `const gone = id;` before `reset()`, then `forgetStored(gone)` in place of `storage.clear()`.
   - `signOut` `:252` → `forgetStored(gone)`. Keep its position and comment: the local session still ends before `/logout`.
   - `forget` → `const gone = id;` first, then `forgetStored(gone)`.
   - `join` `:326` → `forgetStored(id)` before `id = null` (or capture `gone`), keeping the `gen === generation` guard.
   Do not change the order of the other statements, the epoch logic, the channel posts or the public `TokenStore`
   interface.
4. Run all checks. Expected diff: about 15 lines in `tokenStore.ts` and about 90 lines of tests.

Rules: R7 (only the clear condition changes; broadcasting on `session_invalid`/`forget` stays in T-029). R8 (unit
tests on the changed store logic; regression test fails first, D42). R3 (nothing new reaches storage; only the account
id is compared, and no token is involved). R1, R4, R5, R6, R9: not affected (no data access, photos, UI or copy).

## Specialist input used
None (no consult for this ticket). Prior input that was adopted: T-028.3 consult-frontend-developer.md §1 ("clears
storage only if `storage.read() === gone`") and T-028.3 security-review.md:58 (the same check), extended to the
`forget` and `session_invalid` sites as the ticket's Root cause asks.

## Assumptions
- **Approval needed (Ming, High path):** after this fix, a `session_invalid` for X, or `forget()` in a tab on X, no
  longer clears a Y that another tab stored. If Y is also dead, it stays in storage until Y's own next `/token` (renewal
  or reload `restore()`) gets `session_invalid` and clears it. The user may briefly see a restore attempt for Y; no
  token or access is granted, because Identity stays the authority.
- **Approval needed (Ming):** `forget()` and `signOut()` while the store holds no id no longer clear storage. Before
  the fix they did, but the only value they could remove then is another tab's account.
- The read-then-clear pair is not atomic across tabs (another tab could write between the two synchronous
  `localStorage` calls). The window is a few microseconds, and the worst case is the same as today's behaviour. No
  locking is added.
- The comparison is case-insensitive, matching the existing comparisons in this file.
- Hotspot: T-029 (BACKLOG, depends on BUG-007) will edit `tokenStore.ts` and `tabs.test.ts` next. No other open
  ticket edits these files.

## Blocking questions
None

## Split proposal
None
