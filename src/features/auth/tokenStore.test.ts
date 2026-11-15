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
    } as unknown as IdentityClient;
    const store = createTokenStore({ client });
    await store.signIn({ email: "a@b.co", password: "pw" });
    await store.getToken();
    await store.signOut();
    expect(setItem.mock.calls).toEqual([["mm_account_id", ID]]);
    expect(localStorage.getItem("mm_account_id")).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });
});

describe("signOut / forget", () => {
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
    await expect(s.store.signOut()).resolves.toBeUndefined();
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
    await s.store.signOut();
    release();
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
