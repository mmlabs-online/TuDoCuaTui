import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdentityClient } from "./identityClient";
import { createTokenStore, type AccountIdStorage } from "./tokenStore";
import type { AuthError } from "./types";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

function setup(opts: { id?: string | null; expiresIn?: number } = {}) {
  let n = 0;
  const calls: string[] = [];
  const client = {
    login: vi.fn(async () => ({ accountId: ID2, email: "a@b.co" })),
    token: vi.fn(async (_id: string) => {
      await Promise.resolve();
      return { accessToken: `tok${++n}`, expiresIn: opts.expiresIn ?? 900 };
    }),
    logout: vi.fn(async (_id: string) => {
      calls.push("logout");
    }),
    signup: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerification: vi.fn(),
    join: vi.fn(async (_id: string) => {
      calls.push("join");
    }),
    accounts: vi.fn(async () => [{ accountId: ID, email: "me@b.co" }]),
  };
  let stored: string | null = opts.id === undefined ? ID : opts.id;
  const storage: AccountIdStorage = {
    read: () => stored,
    write: vi.fn((v: string) => {
      stored = v;
    }),
    clear: vi.fn(() => {
      calls.push("clear");
      stored = null;
    }),
  };
  let time = 1_000_000;
  const store = createTokenStore({
    client: client as unknown as IdentityClient,
    storage,
    now: () => time,
  });
  return {
    store,
    client,
    storage,
    calls,
    advance: (ms: number) => (time += ms),
    stored: () => stored,
    setStored: (v: string | null) => void (stored = v),
  };
}
const fail = (code: AuthError["code"]) => Object.assign({}, { code }) as AuthError;

describe("getToken", () => {
  it("returns null without an account id and makes no call", async () => {
    const s = setup({ id: null });
    expect(await s.store.getToken()).toBeNull();
    expect(s.client.token).not.toHaveBeenCalled();
  });

  it("is single-flight: 10 parallel calls -> one /token", async () => {
    const s = setup();
    const all = await Promise.all(Array.from({ length: 10 }, () => s.store.getToken()));
    expect(new Set(all)).toEqual(new Set(["tok1"]));
    expect(s.client.token).toHaveBeenCalledTimes(1);
    expect(s.client.token).toHaveBeenCalledWith(ID);
  });

  it("caches until receivedAt + (expires_in - 60) s", async () => {
    const s = setup({ expiresIn: 900 });
    await s.store.getToken();
    s.advance(840_000 - 1);
    expect(await s.store.getToken()).toBe("tok1");
    expect(s.client.token).toHaveBeenCalledTimes(1);
    s.advance(1);
    expect(await s.store.getToken()).toBe("tok2");
    expect(s.client.token).toHaveBeenCalledTimes(2);
  });

  it("caches a 12-hour token until expires_in - 60 s", async () => {
    const s = setup({ expiresIn: 43200 });
    await s.store.getToken();
    s.advance(43_140_000 - 1);
    expect(await s.store.getToken()).toBe("tok1");
    expect(s.client.token).toHaveBeenCalledTimes(1);
    s.advance(1);
    expect(await s.store.getToken()).toBe("tok2");
    expect(s.client.token).toHaveBeenCalledTimes(2);
  });

  it("getToken(stale) refreshes only while the stale token is current", async () => {
    const s = setup();
    const t1 = (await s.store.getToken())!;
    const burst = await Promise.all(Array.from({ length: 10 }, () => s.store.getToken(t1)));
    expect(new Set(burst)).toEqual(new Set(["tok2"]));
    expect(s.client.token).toHaveBeenCalledTimes(2);
    expect(await s.store.getToken(t1)).toBe("tok2");
    expect(s.client.token).toHaveBeenCalledTimes(2);
  });

  it("getToken identity is stable", () => {
    const s = setup();
    expect(s.store.getToken).toBe(s.store.getToken);
  });

  it("session_invalid clears token and id and notifies", async () => {
    const s = setup();
    s.client.token.mockRejectedValueOnce(fail("session_invalid"));
    const seen: string[] = [];
    s.store.subscribe((e) => seen.push(e.code));
    await expect(s.store.getToken()).rejects.toMatchObject({ code: "session_invalid" });
    expect(seen).toEqual(["session_invalid"]);
    expect(s.stored()).toBeNull();
    expect(s.store.accountId()).toBeNull();
    expect(await s.store.getToken()).toBeNull();
  });

  it.each(["not_member", "email_unverified"] as const)(
    "%s notifies and keeps the id",
    async (code) => {
      const s = setup();
      s.client.token.mockRejectedValueOnce(fail(code));
      const seen: string[] = [];
      s.store.subscribe((e) => seen.push(e.code));
      await expect(s.store.getToken()).rejects.toMatchObject({ code });
      expect(seen).toEqual([code]);
      expect(s.store.accountId()).toBe(ID);
    },
  );

  it.each(["network", "rate_limited"] as const)(
    "%s rejects without notifying, keeps everything",
    async (code) => {
      const s = setup();
      s.client.token.mockRejectedValueOnce(fail(code));
      const seen: string[] = [];
      s.store.subscribe((e) => seen.push(e.code));
      await expect(s.store.getToken()).rejects.toMatchObject({ code });
      expect(seen).toEqual([]);
      expect(s.store.accountId()).toBe(ID);
      expect(await s.store.getToken()).toBe("tok1");
    },
  );

  it("unsubscribe stops notifications", async () => {
    const s = setup();
    s.client.token.mockRejectedValueOnce(fail("not_member"));
    const seen: string[] = [];
    s.store.subscribe((e) => seen.push(e.code))();
    await expect(s.store.getToken()).rejects.toBeDefined();
    expect(seen).toEqual([]);
  });
});

describe("signIn / restore", () => {
  it("signIn stores only the account id and then holds a token", async () => {
    const s = setup({ id: null });
    await s.store.signIn({ email: "a@b.co", password: "pw" });
    expect(s.storage.write).toHaveBeenCalledWith(ID2);
    expect(s.store.accountId()).toBe(ID2);
    expect(await s.store.getToken()).toBe("tok1");
    expect(s.client.token).toHaveBeenCalledTimes(1);
  });

  it("signIn rejects with the token-step error and keeps the id (not_member)", async () => {
    const s = setup({ id: null });
    s.client.token.mockRejectedValueOnce(fail("not_member"));
    const seen: string[] = [];
    s.store.subscribe((e) => seen.push(e.code));
    await expect(s.store.signIn({ email: "a@b.co", password: "pw" })).rejects.toMatchObject({
      code: "not_member",
    });
    expect(seen).toEqual([]);
    expect(s.store.accountId()).toBe(ID2);
  });

  it("restore rejects with session_invalid and removes the id", async () => {
    const s = setup();
    s.client.token.mockRejectedValueOnce(fail("session_invalid"));
    await expect(s.store.restore()).rejects.toMatchObject({ code: "session_invalid" });
    expect(s.stored()).toBeNull();
  });

  it("never writes anything but mm_account_id; no history or console use", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {}),
    );
    const client = {
      login: async () => ({ accountId: ID, email: "a@b.co" }),
      token: async () => ({ accessToken: "SECRET-TOKEN", expiresIn: 900 }),
      logout: async () => {},
      join: async () => {},
      accounts: async () => [],
    } as unknown as IdentityClient;
    const posts: Record<string, unknown>[] = [];
    const store = createTokenStore({
      client,
      channel: () => ({
        post: (m) => void posts.push(m as unknown as Record<string, unknown>),
        subscribe: () => () => {},
        close: () => {},
      }),
    });
    const stop = store.start();
    await store.signIn({ email: "a@b.co", password: "pw" });
    await store.getToken();
    await store.join();
    await store.signOut();
    stop();
    expect(posts.map((m) => m.type)).toEqual(["token", "signedOut"]);
    expect(Object.keys(posts[0]).sort()).toEqual(
      ["accessToken", "accountId", "at", "expiresAt", "type", "v"].sort(),
    );
    expect(JSON.stringify(posts[1])).not.toContain("SECRET-TOKEN");
    expect(setItem.mock.calls).toEqual([["mm_account_id", ID]]);
    expect(localStorage.getItem("mm_account_id")).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });
});

describe("signOut / forget", () => {
  it("signOut waits for a running renewal before /logout", async () => {
    const s = setup();
    let release!: () => void;
    s.client.token.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = () => {
            s.calls.push("token");
            r({ accessToken: "late", expiresIn: 900 });
          };
        }),
    );
    const pending = s.store.getToken();
    const out = s.store.signOut();
    await new Promise((r) => setTimeout(r, 5));
    expect(s.client.logout).not.toHaveBeenCalled();
    release();
    await out;
    await pending;
    expect(s.calls).toEqual(["clear", "token", "logout"]);
  });

  it.each<[string, AuthError["code"] | null, boolean]>([
    ["204", null, true],
    ["session_invalid", "session_invalid", true],
    ["network", "network", false],
    ["rate_limited", "rate_limited", false],
    ["unknown", "unknown", false],
  ])(
    "signOut resolves {confirmed} for a %s logout and never rejects",
    async (_n, code, confirmed) => {
      const s = setup();
      if (code) s.client.logout.mockRejectedValueOnce(fail(code));
      await expect(s.store.signOut()).resolves.toMatchObject({ confirmed });
    },
  );

  it("signOut broadcasts signedOut before /logout; nothing when already signed out", async () => {
    const order: string[] = [];
    const posts: unknown[] = [];
    const s = setup();
    const ch = {
      post: (m: unknown) => {
        posts.push(m);
        order.push("post");
      },
      subscribe: () => () => {},
      close: () => {},
    };
    s.client.logout.mockImplementation(async () => void order.push("logout"));
    const store = createTokenStore({
      client: s.client as unknown as IdentityClient,
      storage: s.storage,
      now: () => 1_000_000,
      channel: () => ch,
    });
    store.start();
    expect(await store.signOut()).toEqual({ confirmed: true });
    expect(order).toEqual(["post", "logout"]);
    expect(posts).toEqual([{ v: 1, type: "signedOut", accountId: ID, at: 1_000_000 }]);
    expect(await store.signOut()).toEqual({ confirmed: true });
    expect(order).toEqual(["post", "logout"]);
  });

  it("works when localStorage throws", async () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(boom);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(boom);
    const client = {
      login: async () => ({ accountId: ID, email: "a@b.co" }),
      token: async () => ({ accessToken: "tok", expiresIn: 900 }),
      logout: async () => {},
    } as unknown as IdentityClient;
    const store = createTokenStore({ client });
    expect(store.accountId()).toBeNull();
    await store.signIn({ email: "a@b.co", password: "pw" });
    expect(await store.getToken()).toBe("tok");
    await expect(store.signOut()).resolves.toEqual({ confirmed: true });
  });

  it("clears the id, then calls logout with it; getToken is null at once", async () => {
    const s = setup();
    await s.store.getToken();
    const p = s.store.signOut();
    expect(await s.store.getToken()).toBeNull();
    await p;
    expect(s.client.logout).toHaveBeenCalledWith(ID);
    expect(s.calls).toEqual(["clear", "logout"]);
  });

  it("removes the id even when logout rejects", async () => {
    const s = setup();
    s.client.logout.mockRejectedValueOnce(fail("network"));
    await expect(s.store.signOut()).resolves.toMatchObject({ confirmed: false });
    expect(s.stored()).toBeNull();
  });

  it("discards a late refresh", async () => {
    const s = setup();
    let release!: () => void;
    s.client.token.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = () => r({ accessToken: "late", expiresIn: 900 });
        }),
    );
    const pending = s.store.getToken();
    const out = s.store.signOut(); // waits for the running renewal before /logout
    release();
    await out;
    expect(await pending).toBeNull();
    expect(await s.store.getToken()).toBeNull();
  });

  it("forget clears without logout", async () => {
    const s = setup();
    await s.store.getToken();
    s.store.forget();
    expect(s.client.logout).not.toHaveBeenCalled();
    expect(s.stored()).toBeNull();
    expect(await s.store.getToken()).toBeNull();
  });
});

describe("continueAs", () => {
  it("writes the id, calls token(id) and never login; accountEmail() returns the given email with no accounts call", async () => {
    const s = setup({ id: null });
    await s.store.continueAs(ID2, "x@y.co");
    expect(s.storage.write).toHaveBeenCalledWith(ID2);
    expect(s.stored()).toBe(ID2);
    expect(s.client.token).toHaveBeenCalledWith(ID2);
    expect(s.client.login).not.toHaveBeenCalled();
    expect(await s.store.getToken()).toBe("tok1");
    expect(await s.store.accountEmail()).toBe("x@y.co");
    expect(s.client.accounts).not.toHaveBeenCalled();
  });

  it("drops a late /token answer of the previous epoch (restore in flight, then continueAs)", async () => {
    const s = setup();
    let release!: () => void;
    s.client.token.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ accessToken: "late", expiresIn: 900 }))),
    );
    const restoring = s.store.restore();
    await Promise.resolve();
    const continuing = s.store.continueAs(ID2, "x@y.co");
    await new Promise((r) => setTimeout(r, 5));
    release();
    await Promise.allSettled([restoring, continuing]);
    expect(s.store.accountId()).toBe(ID2);
    expect(await s.store.getToken()).not.toBe("late");
  });

  it("posts no signedOut; the token broadcast carries the new accountId", async () => {
    const s = setup();
    const posts: Record<string, unknown>[] = [];
    const store = createTokenStore({
      client: s.client as unknown as IdentityClient,
      storage: s.storage,
      now: () => 1_000_000,
      channel: () => ({
        post: (m: unknown) => void posts.push(m as Record<string, unknown>),
        subscribe: () => () => {},
        close: () => {},
      }),
    });
    store.start();
    await store.continueAs(ID2, "x@y.co");
    expect(posts.map((p) => p.type)).toEqual(["token"]);
    expect(posts[0]).toMatchObject({ accountId: ID2, accessToken: "tok1" });
    expect(s.client.logout).not.toHaveBeenCalled();
  });

  it("email_unverified keeps the id; session_invalid clears it", async () => {
    const s = setup({ id: null });
    s.client.token.mockRejectedValueOnce(fail("email_unverified"));
    await expect(s.store.continueAs(ID2, "x@y.co")).rejects.toMatchObject({
      code: "email_unverified",
    });
    expect(s.store.accountId()).toBe(ID2);
    expect(s.stored()).toBe(ID2);
    s.client.token.mockRejectedValueOnce(fail("session_invalid"));
    await expect(s.store.continueAs(ID, "me@b.co")).rejects.toMatchObject({
      code: "session_invalid",
    });
    expect(s.store.accountId()).toBeNull();
    expect(s.stored()).toBeNull();
  });
});

describe("join / accountEmail", () => {
  it("join calls client.join(id) then /token; no token before join resolves; getToken returns the new token", async () => {
    const s = setup();
    let release!: () => void;
    s.client.join.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const p = s.store.join();
    await Promise.resolve();
    expect(s.client.join).toHaveBeenCalledWith(ID);
    expect(s.client.token).not.toHaveBeenCalled();
    release();
    await p;
    expect(s.client.token).toHaveBeenCalledTimes(1);
    expect(await s.store.getToken()).toBe("tok1");
    expect(s.client.token).toHaveBeenCalledTimes(1);
  });

  it("join rejection (join_closed) does not call /token; session_invalid clears the id", async () => {
    const s = setup();
    s.client.join.mockRejectedValueOnce(fail("join_closed"));
    await expect(s.store.join()).rejects.toMatchObject({ code: "join_closed" });
    expect(s.client.token).not.toHaveBeenCalled();
    expect(s.store.accountId()).toBe(ID);
    s.client.join.mockRejectedValueOnce(fail("session_invalid"));
    await expect(s.store.join()).rejects.toMatchObject({ code: "session_invalid" });
    expect(s.client.token).not.toHaveBeenCalled();
    expect(s.store.accountId()).toBeNull();
    expect(s.stored()).toBeNull();
  });

  it("join without an id makes no call", async () => {
    const s = setup({ id: null });
    await s.store.join();
    expect(s.client.join).not.toHaveBeenCalled();
    expect(s.client.token).not.toHaveBeenCalled();
  });

  it("a forget() during join discards the late token", async () => {
    const s = setup();
    let release!: () => void;
    s.client.join.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    const p = s.store.join();
    await Promise.resolve();
    s.store.forget();
    release();
    await p;
    expect(s.client.token).not.toHaveBeenCalled();
    expect(await s.store.getToken()).toBeNull();
  });

  it("accountEmail: login email kept in memory, no accounts call; after restore it reads accounts and matches the id; no match -> null; forget clears it", async () => {
    const a = setup({ id: null });
    await a.store.signIn({ email: "x", password: "pw" });
    expect(await a.store.accountEmail()).toBe("a@b.co");
    expect(a.client.accounts).not.toHaveBeenCalled();
    a.store.forget();
    expect(await a.store.accountEmail()).toBeNull();

    const b = setup();
    expect(await b.store.accountEmail()).toBe("me@b.co");
    expect(await b.store.accountEmail()).toBe("me@b.co");
    expect(b.client.accounts).toHaveBeenCalledTimes(1);

    const c = setup();
    c.client.accounts.mockResolvedValueOnce([{ accountId: ID2, email: "other@b.co" }]);
    expect(await c.store.accountEmail()).toBeNull();
  });
});

describe("BUG-007: clear only the departing account", () => {
  it.each([
    ["signOut", async (s: ReturnType<typeof setup>) => void (await s.store.signOut())],
    ["forget", async (s: ReturnType<typeof setup>) => s.store.forget()],
    [
      "getToken session_invalid",
      async (s: ReturnType<typeof setup>) => {
        s.client.token.mockRejectedValueOnce(fail("session_invalid"));
        await expect(s.store.getToken()).rejects.toMatchObject({ code: "session_invalid" });
      },
    ],
    [
      "join session_invalid",
      async (s: ReturnType<typeof setup>) => {
        s.client.join.mockRejectedValueOnce(fail("session_invalid"));
        await expect(s.store.join()).rejects.toMatchObject({ code: "session_invalid" });
      },
    ],
  ])("BUG-007: %s keeps another account's stored id", async (_name, act) => {
    const s = setup();
    s.setStored(ID2); // another tab adopted Y
    await act(s);
    expect(s.stored()).toBe(ID2);
    expect(s.storage.clear).not.toHaveBeenCalled();
    expect(s.store.accountId()).toBeNull();
  });

  it("BUG-007: a stored id differing only in case is still cleared", async () => {
    const s = setup();
    s.setStored(ID.toUpperCase());
    await s.store.signOut();
    expect(s.stored()).toBeNull();
  });
});

describe("unconfirmed signOut: retry", () => {
  const unconfirmed = async (s: ReturnType<typeof setup>) => {
    s.client.logout.mockRejectedValueOnce(fail("network"));
    const r = await s.store.signOut();
    if (r.confirmed) throw new Error("expected an unconfirmed sign-out");
    return r.retry;
  };
  const withChannel = (s: ReturnType<typeof setup>) => {
    const posts: unknown[] = [];
    const store = createTokenStore({
      client: s.client as unknown as IdentityClient,
      storage: s.storage,
      now: () => 1_000_000,
      channel: () => ({ post: (m) => posts.push(m), subscribe: () => () => {}, close: () => {} }),
    });
    store.start();
    return { store, posts };
  };

  it("retry calls logout once, posts signedOut and clears storage only while it holds the id", async () => {
    for (const [held, cleared] of [
      [ID, true],
      [ID2, false],
    ] as const) {
      const s = setup();
      const { store, posts } = withChannel(s);
      s.client.logout.mockRejectedValueOnce(fail("network"));
      const r = await store.signOut();
      if (r.confirmed) throw new Error("expected unconfirmed");
      posts.length = 0;
      s.setStored(held);
      s.client.logout.mockClear();
      const [x, y] = await Promise.all([r.retry(), r.retry()]); // single-flight
      expect(x).toEqual({ confirmed: true });
      expect(y).toEqual({ confirmed: true });
      expect(s.client.logout).toHaveBeenCalledTimes(1);
      expect(s.client.logout).toHaveBeenCalledWith(ID);
      expect(s.stored()).toBe(cleared ? null : ID2);
      expect(posts).toEqual([{ v: 1, type: "signedOut", accountId: ID, at: 1_000_000 }]);
    }
  });

  it("network failure -> confirmed false and no post; session_invalid -> confirmed true", async () => {
    const s = setup();
    const { store, posts } = withChannel(s);
    s.client.logout.mockRejectedValueOnce(fail("network"));
    const r = await store.signOut();
    if (r.confirmed) throw new Error("expected unconfirmed");
    posts.length = 0;
    s.client.logout.mockRejectedValueOnce(fail("network"));
    expect(await r.retry()).toEqual({ confirmed: false });
    expect(posts).toHaveLength(0);
    s.client.logout.mockRejectedValueOnce(fail("session_invalid"));
    expect(await r.retry()).toEqual({ confirmed: true });
    expect(posts).toHaveLength(1);
  });

  it("is a no-op once the store has a session again", async () => {
    const s = setup();
    const retry = await unconfirmed(s);
    await s.store.continueAs(ID2, "a@b.co");
    s.client.logout.mockClear();
    expect(await retry()).toEqual({ confirmed: false });
    expect(s.client.logout).not.toHaveBeenCalled();
  });
});

describe("session_invalid ends the epoch", () => {
  it("renew's session_invalid clears id and storage and leaves no token; later calls make no request", async () => {
    const s = setup();
    s.client.token.mockRejectedValueOnce(fail("session_invalid"));
    await expect(s.store.getToken()).rejects.toMatchObject({ code: "session_invalid" });
    expect(s.store.accountId()).toBeNull();
    expect(s.stored()).toBeNull();
    s.client.token.mockClear();
    expect(await s.store.getToken()).toBeNull();
    expect(s.client.token).not.toHaveBeenCalled();
  });
});
