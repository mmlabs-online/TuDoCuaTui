import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchAccountIdRemoved, type StorageWindowLike } from "./accountId";
import { createAuthChannel } from "./authChannel";
import {
  createFakeChannelHub,
  createFakeDoc,
  createFakeLockManager,
  createFakeStorageHub,
} from "./fakeTabs";
import type { IdentityClient } from "./identityClient";
import { createRefreshLock } from "./refreshLock";
import { createTokenStore, type AccountIdStorage } from "./tokenStore";
import type { AuthError } from "./types";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const fail = (code: AuthError["code"]) => ({ code }) as AuthError;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Lets 0 ms timers (the post-lock yield) and the microtasks behind them run. */
const settle = (ms = 10) => vi.advanceTimersByTimeAsync(ms);

function sharedStorage(initial: string | null) {
  let v = initial;
  return {
    read: () => v,
    write: (x: string) => void (v = x),
    clear: vi.fn(() => void (v = null)),
    value: () => v,
  };
}

function world(expiresIn = 900) {
  const locks = createFakeLockManager();
  const hub = createFakeChannelHub();
  let n = 0;
  const tab = (
    opts: {
      id?: string | null;
      storage?: ReturnType<typeof sharedStorage>;
      /** No BroadcastChannel: sign-out reaches this tab only through the storage event of `win`. */
      fallback?: { storage: AccountIdStorage; win: StorageWindowLike };
    } = {},
  ) => {
    const cell = (opts.fallback?.storage ??
      opts.storage ??
      sharedStorage(opts.id === undefined ? ID : opts.id)) as ReturnType<typeof sharedStorage>;
    const client = {
      token: vi.fn(async (_id: string) => {
        await Promise.resolve();
        return { accessToken: `tok${++n}`, expiresIn };
      }),
      logout: vi.fn(async (_id: string) => {}),
      join: vi.fn(async (_id: string) => {}),
    };
    const doc = createFakeDoc();
    const clear = cell.clear;
    const store = createTokenStore({
      client: client as unknown as IdentityClient,
      storage: cell,
      lock: createRefreshLock({ locks }),
      channel: () =>
        opts.fallback
          ? createAuthChannel({
              create: () => undefined,
              watchRemoved: (fn) => watchAccountIdRemoved(fn, opts.fallback?.win),
            })
          : createAuthChannel({ create: () => hub.endpoint() }),
      doc,
    });
    const stop = store.start();
    return { store, client, doc, clear, stop, stored: cell.value };
  };
  /** A bare endpoint: posts as "another tab" and records what the others broadcast. */
  const probe = () => {
    const ep = hub.endpoint();
    const seen: Record<string, unknown>[] = [];
    ep.addEventListener("message", (ev) => seen.push(ev.data as Record<string, unknown>));
    return { ep, seen };
  };
  return { tab, probe, calls: () => n };
}

const tokenMsg = (o: Record<string, unknown> = {}) => ({
  v: 1,
  type: "token",
  accountId: ID,
  accessToken: "other-tab-token",
  expiresAt: Date.now() + 900_000,
  at: Date.now(),
  ...o,
});

describe("two tabs", () => {
  it("two tabs renewing at once -> one /token, both return the same token", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const pa = a.store.getToken();
    const pb = b.store.getToken();
    await settle();
    expect(await pa).toBe("tok1");
    expect(await pb).toBe("tok1");
    expect(w.calls()).toBe(1);
  });

  it("tab B waiting on the lock adopts A's broadcast instead of calling /token", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    void a.store.getToken();
    const pb = b.store.getToken();
    await settle();
    expect(await pb).toBe("tok1");
    expect(a.client.token).toHaveBeenCalledOnce();
    expect(b.client.token).not.toHaveBeenCalled();
  });

  it("getToken(rejected) returns a token another tab broadcast, with no /token call", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const first = a.store.getToken();
    await settle();
    await first;
    expect(await b.store.getToken()).toBe("tok1");
    const renewed = a.store.getToken("tok1");
    await settle();
    expect(await renewed).toBe("tok2");
    expect(await b.store.getToken("tok1")).toBe("tok2");
    expect(b.client.token).not.toHaveBeenCalled();
  });

  it("a message older than the tab's own token is ignored", async () => {
    const w = world();
    const b = w.tab();
    const own = b.store.getToken();
    await settle();
    expect(await own).toBe("tok1");
    await settle(1000);
    const { ep } = w.probe();
    ep.postMessage(tokenMsg({ accessToken: "older", at: Date.now() - 2000 }));
    await settle();
    expect(await b.store.getToken()).toBe("tok1");
    ep.postMessage(tokenMsg({ accessToken: "newer" }));
    await settle();
    expect(await b.store.getToken()).toBe("newer");
  });

  it("tab A signed in as X, tab B continueAs Y: A keeps X's token and is not signed out, ignores Y's broadcast; storage holds Y", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const first = a.store.getToken();
    await settle();
    expect(await first).toBe("tok1");
    const remote = vi.fn();
    a.store.onRemoteSignOut(remote);
    const pb = b.store.continueAs(ID2, "y@b.co");
    await settle();
    await pb;
    expect(b.store.accountId()).toBe(ID2);
    expect(b.stored()).toBe(ID2);
    expect(a.store.accountId()).toBe(ID);
    expect(await a.store.getToken()).toBe("tok1");
    expect(remote).not.toHaveBeenCalled();
    expect(a.clear).not.toHaveBeenCalled();
  });

  it("a message for another account is ignored (token and signedOut)", async () => {
    const w = world();
    const b = w.tab();
    const own = b.store.getToken();
    await settle();
    await own;
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    const { ep } = w.probe();
    ep.postMessage(tokenMsg({ accountId: ID2, accessToken: "foreign" }));
    ep.postMessage({ v: 1, type: "signedOut", accountId: ID2, at: Date.now() });
    await settle();
    expect(await b.store.getToken()).toBe("tok1");
    expect(b.store.accountId()).toBe(ID);
    expect(remote).not.toHaveBeenCalled();
  });

  it("a signed-out tab never adopts a token", async () => {
    const w = world();
    const b = w.tab({ id: null });
    const { ep } = w.probe();
    ep.postMessage(tokenMsg());
    await settle();
    expect(await b.store.getToken()).toBeNull();
    expect(b.store.accountId()).toBeNull();
    expect(b.client.token).not.toHaveBeenCalled();
  });

  it("an adopted token is not re-broadcast", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const { seen } = w.probe();
    void a.store.getToken();
    void b.store.getToken();
    await settle();
    expect(seen.filter((m) => m.type === "token")).toHaveLength(1);
  });

  it("sign-out in A signs out B (memory, storage, listener), no /logout from B", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const first = a.store.getToken();
    await settle();
    await first;
    await b.store.getToken();
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    const out = a.store.signOut();
    await settle();
    expect(await out).toEqual({ confirmed: true });
    expect(remote).toHaveBeenCalledOnce();
    expect(b.store.accountId()).toBeNull();
    expect(await b.store.getToken()).toBeNull();
    expect(b.clear).toHaveBeenCalled();
    expect(b.client.logout).not.toHaveBeenCalled();
    expect(a.client.logout).toHaveBeenCalledOnce();
  });

  it("B's /token resolving after A's sign-out is dropped and not broadcast", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const { seen } = w.probe();
    let release!: () => void;
    b.client.token.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = () => r({ accessToken: "late", expiresIn: 900 });
        }),
    );
    const pending = b.store.getToken();
    await settle();
    const out = a.store.signOut(); // posts signedOut, then waits for B's lock
    await settle();
    expect(b.store.accountId()).toBeNull();
    release();
    await settle();
    expect(await pending).toBeNull();
    expect(await out).toEqual({ confirmed: true });
    expect(await b.store.getToken()).toBeNull();
    expect(seen.map((m) => m.type)).toEqual(["signedOut"]);
  });
});

describe("proactive renewal", () => {
  it.each([900, 43_200])("fires at exp - 60 s for a %i s token", async (expiresIn) => {
    const w = world(expiresIn);
    const a = w.tab();
    const start = Date.now(); // the token is received at this instant (the yield timer is 0 ms)
    const first = a.store.restore();
    await settle();
    await first;
    expect(a.client.token).toHaveBeenCalledTimes(1);
    const delay = (expiresIn - 60) * 1000;
    await vi.advanceTimersByTimeAsync(start + delay - 1 - Date.now());
    expect(a.client.token).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(a.client.token).toHaveBeenCalledTimes(2);
    expect(await a.store.getToken()).toBe("tok2"); // fresh again, no third call
    expect(a.client.token).toHaveBeenCalledTimes(2);
  });

  it("hidden tab skips the timer and renews on visibilitychange", async () => {
    const w = world();
    const a = w.tab();
    const first = a.store.restore();
    await settle();
    await first;
    a.doc.set("hidden");
    await vi.advanceTimersByTimeAsync(840_000 + 60_000);
    expect(a.client.token).toHaveBeenCalledTimes(1);
    a.doc.set("visible");
    await settle();
    expect(a.client.token).toHaveBeenCalledTimes(2);
  });

  it("a 30 s token is not renewed in a tight loop: at least 15 s between /token calls", async () => {
    const w = world(30);
    const a = w.tab();
    const first = a.store.restore();
    await settle();
    await first;
    expect(a.client.token).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(a.client.token).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(a.client.token).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(12_000); // 29 s in: the next renewal is due at 30 s
    expect(a.client.token).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(a.client.token.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("becoming visible does not renew when the tab has no token (join / unverified / retry screens)", async () => {
    const w = world();
    const a = w.tab();
    a.client.token.mockRejectedValueOnce(fail("not_member"));
    const first = a.store.restore().catch(() => {});
    await settle();
    await first;
    expect(a.store.accountId()).toBe(ID);
    a.doc.set("hidden");
    a.doc.set("visible");
    await settle();
    expect(a.client.token).toHaveBeenCalledTimes(1);
  });

  it("transient failure keeps the session and retries in 15 s while the token is still valid; session_invalid notifies", async () => {
    const w = world();
    const a = w.tab();
    const seen: string[] = [];
    a.store.subscribe((e) => seen.push(e.code));
    const first = a.store.restore();
    await settle();
    await first;
    a.client.token.mockRejectedValueOnce(fail("network"));
    await vi.advanceTimersByTimeAsync(840_000);
    await settle();
    expect(a.client.token).toHaveBeenCalledTimes(2);
    expect(a.store.accountId()).toBe(ID);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(15_000);
    await settle();
    expect(a.client.token).toHaveBeenCalledTimes(3);
    a.client.token.mockRejectedValueOnce(fail("session_invalid"));
    await vi.advanceTimersByTimeAsync(840_000);
    await settle();
    expect(seen).toEqual(["session_invalid"]);
    expect(a.store.accountId()).toBeNull();
    const calls = a.client.token.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(a.client.token).toHaveBeenCalledTimes(calls);
  });

  it("sign-out disarms the timer; start() cleanup removes the listener, closes the channel and clears the timer; start() twice is safe", async () => {
    const w = world();
    const a = w.tab();
    const first = a.store.restore();
    await settle();
    await first;
    expect(vi.getTimerCount()).toBe(1);
    const out = a.store.signOut();
    await settle();
    await out;
    expect(vi.getTimerCount()).toBe(0);

    const b = w.tab();
    const second = b.store.restore();
    await settle();
    await second;
    expect(b.store.start()()).toBeUndefined(); // already started: a no-op cleanup
    expect(b.doc.count()).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    b.stop();
    expect(b.doc.count()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const { ep } = w.probe();
    ep.postMessage(tokenMsg({ accessToken: "after-stop" }));
    await settle();
    expect(await b.store.getToken()).toBe("tok2"); // still its own token: the closed channel delivered nothing
  });
});

describe("BUG-007: sign-out keeps another tab's account", () => {
  it("BUG-007: A (X) signs out after B continued as Y on shared storage -> storage still holds Y", async () => {
    const w = world();
    const shared = sharedStorage(ID);
    const a = w.tab({ storage: shared });
    const b = w.tab({ storage: shared });
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    const first = a.store.getToken();
    await settle();
    await first;
    void b.store.continueAs(ID2, "y@b.co");
    await settle();
    expect(shared.value()).toBe(ID2);
    const out = a.store.signOut();
    await settle();
    await out;
    expect(shared.value()).toBe(ID2);
    expect(b.store.accountId()).toBe(ID2);
    expect(remote).not.toHaveBeenCalled();
    expect(a.store.accountId()).toBeNull();
    expect(a.client.logout).toHaveBeenCalledWith(ID);
  });

  it("BUG-007: a third tab still on X gets the remote signedOut and keeps Y in storage", async () => {
    const w = world();
    const shared = sharedStorage(ID);
    const a = w.tab({ storage: shared });
    const c = w.tab({ storage: shared });
    const b = w.tab({ storage: shared });
    const remote = vi.fn();
    c.store.onRemoteSignOut(remote);
    void b.store.continueAs(ID2, "y@b.co");
    await settle();
    const out = a.store.signOut();
    await settle();
    await out;
    expect(remote).toHaveBeenCalledOnce();
    expect(c.store.accountId()).toBeNull();
    expect(shared.value()).toBe(ID2);
    expect(b.store.accountId()).toBe(ID2);
  });
});

describe("session ends reach other tabs", () => {
  const signedOuts = (seen: Record<string, unknown>[]) =>
    seen.filter((m) => m.type === "signedOut");

  it("session_invalid on renewal in A signs out B on the same account", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    a.client.token.mockRejectedValueOnce(fail("session_invalid"));
    const pa = a.store.getToken().catch((e: unknown) => e);
    await settle();
    expect(await pa).toEqual(fail("session_invalid"));
    expect(remote).toHaveBeenCalledOnce();
    expect(b.store.accountId()).toBeNull();
    expect(await b.store.getToken()).toBeNull();
  });

  it("session_invalid from join in A signs out B; one signedOut posted", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const { seen } = w.probe();
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    a.client.join.mockRejectedValueOnce(fail("session_invalid"));
    const pj = a.store.join().catch((e: unknown) => e);
    await settle();
    expect(await pj).toEqual(fail("session_invalid"));
    expect(remote).toHaveBeenCalledOnce();
    expect(b.store.accountId()).toBeNull();
    expect(signedOuts(seen)).toHaveLength(1);
  });

  it("forget() in A signs out B", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    a.store.forget();
    await settle();
    expect(remote).toHaveBeenCalledOnce();
    expect(b.store.accountId()).toBeNull();
    expect(a.client.logout).not.toHaveBeenCalled();
    expect(b.client.logout).not.toHaveBeenCalled();
  });

  it("B on another account is not affected by A's session_invalid or forget", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab({ id: ID2 });
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    a.client.token.mockRejectedValueOnce(fail("session_invalid"));
    const pa = a.store.getToken().catch(() => {});
    await settle();
    await pa;
    const c = w.tab();
    c.store.forget();
    await settle();
    expect(remote).not.toHaveBeenCalled();
    expect(b.store.accountId()).toBe(ID2);
  });

  it("a received signedOut is not re-broadcast", async () => {
    const w = world();
    const a = w.tab();
    const b = w.tab();
    const { seen } = w.probe();
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    a.store.forget();
    await settle();
    expect(remote).toHaveBeenCalledOnce();
    expect(signedOuts(seen)).toHaveLength(1);
  });

  it("a signedOut older than the tab's session start is ignored", async () => {
    const w = world();
    const b = w.tab({ id: null });
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    const t = Date.now();
    const pb = b.store.continueAs(ID, "x@b.co");
    await settle();
    await pb;
    const { ep } = w.probe();
    ep.postMessage({ v: 1, type: "signedOut", accountId: ID, at: t - 1 });
    await settle();
    expect(remote).not.toHaveBeenCalled();
    expect(b.store.accountId()).toBe(ID);
  });
});

describe("no BroadcastChannel", () => {
  it("A signing out / forgetting X signs out B on X via the storage event", async () => {
    for (const how of ["signOut", "forget"] as const) {
      const w = world();
      const hub = createFakeStorageHub(ID);
      const a = w.tab({ fallback: hub.tab() });
      const b = w.tab({ fallback: hub.tab() });
      const remote = vi.fn();
      b.store.onRemoteSignOut(remote);
      if (how === "signOut") {
        const out = a.store.signOut();
        await settle();
        await out;
      } else {
        a.store.forget();
        await settle();
      }
      expect(remote).toHaveBeenCalledOnce();
      expect(b.store.accountId()).toBeNull();
    }
  });

  it("X -> Y does not sign out B; removing Y leaves B on X alone", async () => {
    const w = world();
    const hub = createFakeStorageHub(ID);
    const a = w.tab({ fallback: hub.tab() });
    const b = w.tab({ fallback: hub.tab() });
    const remote = vi.fn();
    b.store.onRemoteSignOut(remote);
    const pa = a.store.continueAs(ID2, "y@b.co");
    await settle();
    await pa;
    expect(remote).not.toHaveBeenCalled();
    a.store.forget(); // removes Y
    await settle();
    expect(remote).not.toHaveBeenCalled();
    expect(b.store.accountId()).toBe(ID);
  });
});
