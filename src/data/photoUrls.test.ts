import { describe, expect, test, vi } from "vitest";
import { createPhotoLoader } from "./photoUrls";

const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const src = (n: number) => `/api/photos/${id(n)}`;

const imageRes = () =>
  new Response(new Blob(["x"]), { status: 200, headers: { "Content-Type": "image/jpeg" } });

function setup(opts: Partial<Parameters<typeof createPhotoLoader>[0]> = {}) {
  const created: string[] = [];
  const revoked: string[] = [];
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => imageRes());
  const loader = createPhotoLoader({
    getToken: async () => "tok",
    fetchFn: fetchFn as unknown as typeof fetch,
    createUrl: () => {
      const u = `blob:test/${created.length}`;
      created.push(u);
      return u;
    },
    revokeUrl: (u) => revoked.push(u),
    ...opts,
  });
  return { loader, fetchFn, created, revoked };
}

/** A fetch that stays pending until `settle(i)` is called. */
function deferredFetch() {
  const pending: { signal?: AbortSignal | null; res: (r: Response) => void }[] = [];
  const fetchFn = vi.fn(
    (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((res, rej) => {
        pending.push({ signal: init?.signal, res });
        init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
      }),
  );
  return { fetchFn: fetchFn as unknown as typeof fetch, calls: fetchFn, pending };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createPhotoLoader", () => {
  test("the blob handed to createUrl is pinned to image/jpeg", async () => {
    const seen: Blob[] = [];
    const { loader } = setup({
      fetchFn: (async () =>
        new Response(new Blob(["x"], { type: "image/svg+xml" }), {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        })) as unknown as typeof fetch,
      createUrl: (b) => (seen.push(b), "blob:t/1"),
    });
    await loader.acquire(src(1)).promise;
    expect(seen[0].type).toBe("image/jpeg");
  });

  test("handles only API photo URLs", () => {
    const { loader, fetchFn } = setup();
    expect(loader.handles(src(1))).toBe(true);
    for (const s of ["", "https://x.test/a.jpg", "data:image/jpeg;base64,AA", `blob:x/${id(1)}`]) {
      expect(loader.handles(s)).toBe(false);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("fetches the exact URL with the bearer, same-origin credentials, manual redirect", async () => {
    const { loader, fetchFn } = setup();
    const url = await loader.acquire(src(1)).promise;
    expect(url).toBe("blob:test/0");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [u, init] = fetchFn.mock.calls[0];
    expect(u).toBe(src(1));
    expect(String(u)).not.toContain("?");
    expect(init?.headers).toEqual({ Authorization: "Bearer tok" });
    expect(init?.credentials).toBe("same-origin");
    expect(init?.redirect).toBe("manual");
  });

  test("two acquires of the same src make one fetch and share the URL", async () => {
    const { loader, fetchFn } = setup();
    const [a, b] = await Promise.all([
      loader.acquire(src(1)).promise,
      loader.acquire(src(1)).promise,
    ]);
    expect(a).toBe(b);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("at most maxConcurrent fetches at once, FIFO", async () => {
    const d = deferredFetch();
    const { loader } = setup({ fetchFn: d.fetchFn, maxConcurrent: 4 });
    for (let n = 1; n <= 10; n++) loader.acquire(src(n));
    await tick();
    expect(d.pending).toHaveLength(4);
    d.pending[0].res(imageRes());
    await tick();
    expect(d.pending).toHaveLength(5);
    expect(d.calls.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5].map(src));
  });

  test("a release before the fetch starts removes it from the queue", async () => {
    const d = deferredFetch();
    const { loader } = setup({ fetchFn: d.fetchFn, maxConcurrent: 1 });
    loader.acquire(src(1));
    const second = loader.acquire(src(2));
    second.release();
    await tick();
    d.pending[0].res(imageRes());
    await tick();
    expect(d.calls).toHaveBeenCalledTimes(1);
  });

  test("released entries stay cached; keepUnused evicts and revokes the oldest, never referenced ones", async () => {
    const { loader, fetchFn, created, revoked } = setup({ keepUnused: 2 });
    const held = loader.acquire(src(0));
    await held.promise;
    const hs = [1, 2, 3].map((n) => loader.acquire(src(n)));
    await Promise.all(hs.map((h) => h.promise));
    hs[0].release();
    expect(revoked).toEqual([]);
    const again = loader.acquire(src(1));
    await again.promise;
    expect(fetchFn).toHaveBeenCalledTimes(4);
    again.release();
    hs[1].release();
    hs[2].release();
    expect(revoked).toEqual([created[1]]);
    expect(revoked).not.toContain(created[0]);
  });

  test.each([
    ["404", async () => new Response("", { status: 404 })],
    ["500", async () => new Response("", { status: 500 })],
    [
      "network",
      async () => {
        throw new TypeError("net");
      },
    ],
    [
      "opaqueredirect",
      async () => Object.defineProperty(new Response(""), "type", { value: "opaqueredirect" }),
    ],
    [
      "non-image",
      async () => new Response("x", { status: 200, headers: { "Content-Type": "text/html" } }),
    ],
  ])("%s rejects, caches nothing, retries on the next acquire", async (_n, first) => {
    const { loader, fetchFn, created } = setup();
    fetchFn.mockImplementationOnce(first as never);
    await expect(loader.acquire(src(1)).promise).rejects.toBeTruthy();
    expect(created).toEqual([]);
    await expect(loader.acquire(src(1)).promise).resolves.toBe("blob:test/0");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  test("getToken null: rejects without a request; getToken rejecting: rejects", async () => {
    const a = setup({ getToken: async () => null });
    await expect(a.loader.acquire(src(1)).promise).rejects.toBeTruthy();
    expect(a.fetchFn).not.toHaveBeenCalled();
    const b = setup({
      getToken: async () => {
        throw new Error("no token");
      },
    });
    await expect(b.loader.acquire(src(1)).promise).rejects.toMatchObject({
      status: 0,
      code: "network",
    });
    expect(b.fetchFn).not.toHaveBeenCalled();
  });

  test("401 -> one retry with getToken(stale); the fresh token is used", async () => {
    const tokens = ["old", "new"];
    const getToken = vi.fn(async (_r?: string) => tokens.shift() ?? null);
    const { loader, fetchFn } = setup({ getToken });
    fetchFn.mockImplementationOnce(async () => new Response("", { status: 401 }));
    await expect(loader.acquire(src(1)).promise).resolves.toBe("blob:test/0");
    expect(getToken.mock.calls).toEqual([[undefined], ["old"]]);
    const auth = (n: number) =>
      ((fetchFn.mock.calls[n] as [string, RequestInit])[1].headers as Record<string, string>)
        .Authorization;
    expect(auth(0)).toBe("Bearer old");
    expect(auth(1)).toBe("Bearer new");
  });

  test("second 401 -> onAuthLost once, entry rejected, no third fetch", async () => {
    const onAuthLost = vi.fn();
    const { loader, fetchFn } = setup({ onAuthLost });
    fetchFn.mockImplementation(async () => new Response("", { status: 401 }));
    await expect(loader.acquire(src(1)).promise).rejects.toMatchObject({ status: 401 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
  });

  test("clear revokes every URL, aborts in-flight and rejects queued; late responses leave no URL; usable again", async () => {
    const d = deferredFetch();
    const { loader, created, revoked } = setup({ fetchFn: d.fetchFn, maxConcurrent: 1 });
    const a = loader.acquire(src(1));
    const b = loader.acquire(src(2));
    const caught = [a.promise, b.promise].map((p) => p.catch((e) => e));
    await tick();
    d.pending[0].res(imageRes());
    await a.promise;
    await tick();
    expect(created).toHaveLength(1);
    const c = loader.acquire(src(3));
    const cCaught = c.promise.catch((e) => e);
    await tick();
    loader.clear();
    expect(revoked).toEqual([created[0]]);
    expect(d.pending[1].signal?.aborted).toBe(true);
    expect(await cCaught).toBeInstanceOf(Error);
    await Promise.all(caught);
    expect(created).toHaveLength(1);
  });

  test("a response that resolves after clear creates no unrevoked URL", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const fetchFn = vi.fn(async () => {
      await gate;
      return imageRes();
    });
    const { loader, created, revoked } = setup({ fetchFn: fetchFn as never });
    const p = loader.acquire(src(1)).promise.catch(() => {});
    await tick();
    loader.clear();
    finish();
    await p;
    await tick();
    expect(created.filter((u) => !revoked.includes(u))).toEqual([]);
  });

  test("the loader works again after clear", async () => {
    const { loader, revoked } = setup();
    await loader.acquire(src(1)).promise;
    loader.clear();
    expect(revoked).toHaveLength(1);
    await expect(loader.acquire(src(1)).promise).resolves.toBe("blob:test/1");
  });

  test("the token never reaches console or error messages", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { loader, fetchFn } = setup();
    fetchFn.mockImplementationOnce(async () => new Response("", { status: 500 }));
    const err = await loader.acquire(src(1)).promise.catch((e) => e);
    expect(String(err.message)).not.toContain("tok");
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
