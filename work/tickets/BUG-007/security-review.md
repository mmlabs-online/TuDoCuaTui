## Attempt 1 — 2026-11-19 — security-ai-generated-code-auditor

Scope: `src/features/auth/tokenStore.ts` (the new `forgetStored` and its five call sites), plus the new tests in `src/features/auth/tabs.test.ts` and `src/features/auth/tokenStore.test.ts`. I checked them against the plan Ming approved, including its assumptions. I could not run git or the checks myself, so I read the files and took the check results from the impl-log.

### Findings

No 🔴 blockers. No 🟡 should-fix items.

🟢 **1. The tab that signed out cannot get the account back from storage.** At every site, the in-memory id, email and token are cleared whatever storage holds:
- `tokenStore.ts:160-164` (renew, `session_invalid`)
- `:224-228` (remote `signedOut`)
- `:254-259` (`signOut`)
- `:284-288` (`forget`)
- `:331-334` (`join`, `session_invalid`)

The store reads storage only once, when it is created (`:74`). After that, `getToken`, `renew` and `restore` all return `null` early when `id` is null (`:125`, `:179`). So keeping Y in storage cannot bring X back in tab A. The tests confirm this: `tokenStore.test.ts:522` and `tabs.test.ts:379` and `:397` all assert `accountId()` is null.

🟢 **2. Keeping another tab's stored account grants no access.** Only the account id (a UUID) stays in storage. Getting a token still needs `/token` for that id, which Identity checks against the `mm_device` cookie. A revoked Y gets `session_invalid` there, and `forgetStored(accountId)` (`:163`) then clears it, because at that moment the stored value is Y. The only cost is one failed restore attempt for a dead Y, which is the assumption Ming approved.

🟢 **3. The case-insensitive comparison is safe.** At `:120`, `toLowerCase()` on both UUIDs only decides whether to *clear*. A wrong match could only remove storage, never write it or grant anything. This matches the existing comparisons at `:213` and `:322`. A null or empty `gone`/`stored` short-circuits to no clear. The test at `tokenStore.test.ts:525` guards against the check being too strict.

🟢 **4. The remote `signedOut` path is correct.** `onMessage` only acts when `msg.accountId` matches the local id (`:213`). `forgetStored` then uses the local id captured in `gone` (`:224`), never the value from the message. So a message for X cannot clear Y. The three-tab test (`tabs.test.ts:383`) covers this.

🟢 **5. Nothing new is stored, persisted or logged.** The diff adds no storage keys and no `storage.write`, the token stays only in memory, and there is no logging or `console.` call. The impl-log says the existing `boundary.test.ts` passed; it checks for `console.` and the storage-key literal.

🟢 **6. The `join` site keeps its ordering.** `forgetStored(id)` (`:332`) runs before `id = null` and stays inside the `gen === generation` guard, so it uses the id the join was made for. In renew, `accountId` is captured at `:127`, and the epoch checks guarantee it is still the current session.

💭 **7. Side effect, no change needed.** After X signs out in tab A while tab B is on Y, reloading tab A now restores Y, because it reads the shared key. That is the account the device already has signed in with Identity, and "Tiếp tục với Y" would reach it in one click without a password anyway. So no access is gained, but tab A no longer opens on the sign-in screen after a reload. I am noting it in case Ming wants a mention in the PR description.

💭 **8. Not atomic across tabs.** `forgetStored` reads and then clears in two steps, so another tab could write in between. The plan accepts this as an assumption: the worst case is the old behaviour (Y gets cleared), never extra access.

### Follow-ups (out of scope)
- None new. Broadcasting sign-out on `session_invalid` and `forget` stays with T-029.

### Verdict
**PASS** (security). The fix narrows which stored id gets cleared and nothing else. Every exit path still drops the session from memory, and Identity still decides on `/token`. The impl-log reports all checks green; I did not re-run them.
