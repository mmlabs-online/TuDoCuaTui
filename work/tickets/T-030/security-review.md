# Security review — T-030

## Attempt 1

## Security review: T-030 attempt 1 (403 pass-through, D55)

**Verdict: PASS.** I found no blockers and no should-fix items. Ming's decision is safe: a 403 fails closed, nothing bypasses auth, and a 403 leaks no token. The new tests pin all three properties.

This was read-only. I had no shell, so I did not run `git diff` or the checks. I confirmed "runtime code unchanged" by reading `authFetch.ts`; the diff and the checks still need to be confirmed at REVIEW.

### Findings

🟢 **Fail-closed on 403.** `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\authFetch.ts:46` and `:49` return every non-401 response unchanged. Then `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\repo.http.ts:56-67` throws `ApiError(403, code)` when `!res.ok`, and `:58` throws `ApiError(403, "unexpected")` if the body has no code. A 403 never becomes data, a retry or a downgraded request. The photo loader also rejects any non-ok status (`D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\photoUrls.ts:73`).

🟢 **No auth bypass or downgrade.** A 403 does not trigger a token refresh, does not resend without a bearer and does not fall back to anything. The same-origin guard (`authFetch.ts:14`, `:43`) is untouched, so the bearer still never goes to absolute or `//host` URLs. Not calling `onAuthLost` on 403 is also the safer side: it denies the server a client-triggered sign-out lever, and the user stays signed in but blocked from the action.

🟢 **No token leak on 403.** `ApiError` takes only server fields (`code`, `field`, `reason`, `requestId`, `Retry-After`) from `repo.http.ts:60-67`. The request headers and token never go into the error. The existing test at `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\authFetch.test.ts:122-130` still pins the "no token in message" property for `getToken` failures.

🟢 **Tests pin the decision.**
- `authFetch.test.ts:73-82`: a 403 returns 403, with one `getToken` call, one fetch and no `onAuthLost`. This pins both "no retry" and "no sign-out".
- `authFetch.test.ts:84-93`: a 401 followed by a 403 returns 403, with two fetches and no `onAuthLost`. The promise resolves instead of throwing.
- `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\repo.http.test.ts:542-552`: end to end, a 403 rejects with `{403, "forbidden_origin"}`, makes one fetch and does not call `onAuthLost`.

The existing 401 and 503 tests (`authFetch.test.ts:52-71`, `:95-120`) are intact in the current file.

🟢 **Docs and record are consistent.** The comments at `authFetch.ts:8-9` and `:17-19` match the code. D55 (`D:\Projects\SAF\spaceM\projects\tudocuatui\work\decisions.md:64`) states the rule, gives the reason and cites Ming's approval.

### Notes (optional, not blocking)

- `authFetch.test.ts:84-93` does not check that the retry after the 401 sent `Bearer t2`. That case is already covered at `:95-104`.
- `photoUrls.ts:73` turns a 403 into `ApiError(403, "unexpected")`, dropping the server's error code. A forbidden photo therefore shows generic copy. This is fail-closed, so it is a UX issue, not a security one.

### Follow-ups (out of scope)

- No 403 tests exist for the photo loader or the AI clients (`photoUrls`, `aiOutfits`, `aiSettings`, `aiTagging`). They share `createAuthedFetch`, so the behaviour is the same, but the decision is only pinned at the `authFetch` and repo level.
- The doc comment at `D:\Projects\SAF\spaceM\projects\tudocuatui\src\data\photoUrls.ts:18` on `onAuthLost` does not mention D55, while `authFetch.ts` does.
