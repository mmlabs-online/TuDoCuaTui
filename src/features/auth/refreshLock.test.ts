import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeLockManager } from "./fakeTabs";
import { createRefreshLock, type LockManagerLike } from "./refreshLock";

afterEach(() => vi.useRealTimers());

describe("createRefreshLock", () => {
  it('runs fn under the lock "tudocuatui-auth-refresh" with locked=true', async () => {
    const request = vi.fn(
      async (
        _n: string,
        _o: { mode: "exclusive"; signal: AbortSignal },
        cb: () => Promise<unknown>,
      ) => cb(),
    );
    const lock = createRefreshLock({ locks: { request } as unknown as LockManagerLike });
    const seen = await lock.run(async (locked) => locked, { waitMs: 1000 });
    expect(seen).toBe(true);
    expect(request.mock.calls[0][0]).toBe("tudocuatui-auth-refresh");
    expect(request.mock.calls[0][1].mode).toBe("exclusive");
  });

  it("two runs on a shared fake manager are serialised", async () => {
    const lock = createRefreshLock({ locks: createFakeLockManager() });
    const order: string[] = [];
    let release!: () => void;
    const first = lock.run(
      async () => {
        order.push("a-start");
        await new Promise<void>((r) => (release = r));
        order.push("a-end");
      },
      { waitMs: 1000 },
    );
    const second = lock.run(async () => void order.push("b-start"), { waitMs: 1000 });
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["a-start"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["a-start", "a-end", "b-start"]);
  });

  it("locks undefined -> fn runs at once with locked=false", async () => {
    const lock = createRefreshLock({ locks: undefined });
    expect(await lock.run(async (l) => l, { waitMs: 1000 })).toBe(false);
  });

  it("request throwing (SecurityError) -> fn runs with locked=false", async () => {
    const locks = {
      request: () => {
        throw new DOMException("denied", "SecurityError");
      },
    } as unknown as LockManagerLike;
    expect(await createRefreshLock({ locks }).run(async (l) => l, { waitMs: 1000 })).toBe(false);
  });

  it("wait longer than waitMs -> wait aborted, fn runs with locked=false", async () => {
    vi.useFakeTimers();
    const locks = createFakeLockManager();
    const lock = createRefreshLock({ locks });
    void lock.run(() => new Promise<void>(() => {}), { waitMs: 1000 }); // a hung holder
    await vi.advanceTimersByTimeAsync(0);
    const waiter = lock.run(async (l) => l, { waitMs: 20_000 });
    await vi.advanceTimersByTimeAsync(19_999);
    let done = false;
    void waiter.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await waiter).toBe(false);
  });

  it("fn's rejection propagates and the lock is released", async () => {
    const locks = createFakeLockManager();
    const lock = createRefreshLock({ locks });
    await expect(
      lock.run(async () => Promise.reject(new Error("boom")), { waitMs: 1000 }),
    ).rejects.toThrow("boom");
    expect(await lock.run(async (l) => l, { waitMs: 1000 })).toBe(true);
    expect(locks.held()).toBe(false);
  });
});
