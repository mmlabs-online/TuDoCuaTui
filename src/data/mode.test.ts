import { afterEach, describe, expect, test, vi } from "vitest";
import { detectMode, pickMode } from "./mode";

afterEach(() => vi.useRealTimers());

const res = (body: string, type = "application/json", status = 200) =>
  new Response(body, { status, headers: { "Content-Type": type } });
const okRes = () => res('{"status":"ok"}');
const mk = (...impl: Array<() => Response | Promise<Response>>) => {
  const fn = vi.fn();
  impl.forEach((i) => fn.mockImplementationOnce(async () => i()));
  return fn;
};
const detect = (fn: ReturnType<typeof vi.fn>) =>
  detectMode({ fetchFn: fn as unknown as typeof fetch, dev: false });

describe("pickMode", () => {
  test("true -> api, false -> local", () => {
    expect(pickMode(true)).toBe("api");
    expect(pickMode(false)).toBe("local");
  });
});

describe("detectMode", () => {
  test("dev never calls fetch", async () => {
    const fn = vi.fn();
    expect(await detectMode({ fetchFn: fn, dev: true })).toBe("local");
    expect(fn).not.toHaveBeenCalled();
  });

  test("api only for 200 + JSON + status ok; GETs /healthz no-store", async () => {
    const fn = mk(okRes);
    expect(await detect(fn)).toBe("api");
    expect(fn.mock.calls[0][0]).toBe("/healthz");
    expect(fn.mock.calls[0][1].cache).toBe("no-store");
    expect(fn.mock.calls[0][1].redirect).toBe("manual");
  });

  test("opaqueredirect (expired Access session) -> api", async () => {
    const fn = mk(() => ({ type: "opaqueredirect", ok: false, status: 0 }) as unknown as Response);
    expect(await detect(fn)).toBe("api");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["html 200", () => res("<html>", "text/html")],
    ["404", () => res('{"status":"ok"}', "application/json", 404)],
    ["json without ok", () => res('{"status":"no"}')],
    ["invalid json", () => res("nope")],
  ])("no false positive: %s", async (_n, r) => {
    const fn = mk(r);
    expect(await detect(fn)).toBe("local");
    expect(fn).toHaveBeenCalledTimes(1); // definite answer: no retry
  });

  test("retries once after a network error", async () => {
    const fn = mk(() => {
      throw new TypeError("x");
    }, okRes);
    expect(await detect(fn)).toBe("api");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("falls back to local after two network errors", async () => {
    const boom = () => {
      throw new TypeError("x");
    };
    const fn = mk(boom, boom);
    expect(await detect(fn)).toBe("local");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("aborts after the timeout and resolves", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init.signal!.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))),
        ),
    );
    const p = detectMode({ fetchFn: fn as unknown as typeof fetch, dev: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe("local");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
