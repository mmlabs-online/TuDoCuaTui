import { afterEach, describe, expect, test, vi } from "vitest";
import { probeServer } from "./serverProbe";

afterEach(() => vi.useRealTimers());

const res = (body: string, type = "application/json", status = 200) =>
  new Response(body, { status, headers: { "Content-Type": type } });
const okRes = () => res('{"status":"ok"}');
// what fetch returns for a 3xx with redirect: "manual"
const redirectRes = () =>
  ({ type: "opaqueredirect", ok: false, status: 0, headers: new Headers() }) as unknown as Response;
const mk = (...impl: Array<() => Response | Promise<Response>>) => {
  const fn = vi.fn();
  impl.forEach((i) => fn.mockImplementationOnce(async () => i()));
  return fn;
};
const probe = (fn: ReturnType<typeof vi.fn>) =>
  probeServer({ fetchFn: fn as unknown as typeof fetch });

describe("probeServer", () => {
  test("ok on 200 application/json {status:'ok'}", async () => {
    const fn = mk(okRes);
    expect(await probe(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("ok ignores the auth field (missing, 'identity', other)", async () => {
    for (const auth of ["", ',"auth":"identity"', ',"auth":"bogus"', ',"auth":1']) {
      expect(await probe(mk(() => res(`{"status":"ok"${auth}}`)))).toBe("ok");
    }
  });

  test("unreachable on 200 text/html (SPA host answer)", async () => {
    expect(await probe(mk(() => res("<html>", "text/html")))).toBe("unreachable");
  });

  test("unreachable on a manual redirect (opaqueredirect / 3xx)", async () => {
    const fn = mk(redirectRes);
    expect(await probe(fn)).toBe("unreachable");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await probe(mk(() => res("", "text/html", 302)))).toBe("unreachable");
  });

  test("unreachable on 500 / 404 JSON", async () => {
    expect(await probe(mk(() => res('{"status":"ok"}', "application/json", 500)))).toBe(
      "unreachable",
    );
    expect(await probe(mk(() => res('{"status":"ok"}', "application/json", 404)))).toBe(
      "unreachable",
    );
  });

  test("unreachable on JSON content-type with an invalid body (SyntaxError), no retry", async () => {
    const fn = mk(() => res("nope"));
    expect(await probe(fn)).toBe("unreachable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("unreachable on {status:'down'} and on a null body", async () => {
    expect(await probe(mk(() => res('{"status":"down"}')))).toBe("unreachable");
    expect(await probe(mk(() => res("null")))).toBe("unreachable");
  });

  test("network error -> one retry -> unreachable (fetch called twice)", async () => {
    const boom = () => {
      throw new TypeError("x");
    };
    const fn = mk(boom, boom);
    expect(await probe(fn)).toBe("unreachable");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("network error then ok -> ok", async () => {
    const fn = mk(() => {
      throw new TypeError("x");
    }, okRes);
    expect(await probe(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("timeout aborts the request, retries once, then unreachable", async () => {
    vi.useFakeTimers();
    const fn = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_r, rej) =>
          init.signal!.addEventListener("abort", () => rej(new DOMException("a", "AbortError"))),
        ),
    );
    const p = probeServer({ fetchFn: fn as unknown as typeof fetch });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe("unreachable");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("requests /healthz with cache:no-store and redirect:manual", async () => {
    const fn = mk(okRes);
    await probe(fn);
    expect(fn.mock.calls[0][0]).toBe("/healthz");
    expect(fn.mock.calls[0][1].cache).toBe("no-store");
    expect(fn.mock.calls[0][1].redirect).toBe("manual");
  });
});
