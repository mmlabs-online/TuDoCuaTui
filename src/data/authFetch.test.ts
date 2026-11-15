import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiErrors";
import { createAuthedFetch } from "./authFetch";

const status = (s: number) => new Response("", { status: s });
const setup = (
  statuses: number[],
  getToken?: (r?: string) => Promise<string | null>,
  extra: { onAuthLost?: () => void } = {},
) => {
  const q = [...statuses];
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => status(q.shift() ?? 200));
  const f = createAuthedFetch({ fetchFn: fetchFn as unknown as typeof fetch, getToken, ...extra });
  const hdr = (n: number) =>
    ((fetchFn.mock.calls[n] as [string, RequestInit])[1].headers ?? {}) as Record<string, string>;
  return { f, fetchFn, hdr };
};
const init = (): RequestInit => ({
  method: "PUT",
  headers: { Accept: "application/json" },
  credentials: "same-origin",
  redirect: "manual",
});

describe("createAuthedFetch", () => {
  it("without getToken the request is passed through unchanged", async () => {
    const { f, fetchFn } = setup([200]);
    const i = init();
    await f("/api/x", i);
    expect(fetchFn).toHaveBeenCalledWith("/api/x", i);
  });

  it("adds the bearer to same-origin paths and keeps credentials/redirect", async () => {
    const { f, fetchFn, hdr } = setup([200], async () => "t");
    await f("/api/x", init());
    expect(hdr(0)).toEqual({ Accept: "application/json", Authorization: "Bearer t" });
    const sent = (fetchFn.mock.calls[0] as [string, RequestInit])[1];
    expect(sent.credentials).toBe("same-origin");
    expect(sent.redirect).toBe("manual");
  });

  it("no header for absolute or protocol-relative URLs", async () => {
    const getToken = vi.fn(async () => "t");
    const { f, hdr } = setup([200, 200], getToken);
    await f("https://evil.test/api/x", init());
    await f("//evil.test/api/x", init());
    expect(hdr(0).Authorization).toBeUndefined();
    expect(hdr(1).Authorization).toBeUndefined();
    expect(getToken).not.toHaveBeenCalled();
  });

  it("401 -> one retry with getToken(stale) and the new token", async () => {
    const tokens = ["t", "t2"];
    const getToken = vi.fn(async (_r?: string) => tokens.shift() ?? null);
    const { f, fetchFn, hdr } = setup([401, 200], getToken);
    const res = await f("/api/x", init());
    expect(res.status).toBe(200);
    expect(getToken.mock.calls).toEqual([[undefined], ["t"]]);
    expect(hdr(1).Authorization).toBe("Bearer t2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("second 401 -> onAuthLost once, ApiError(401), no third request", async () => {
    const onAuthLost = vi.fn();
    const { f, fetchFn } = setup([401, 401, 200], async () => "t", { onAuthLost });
    await expect(f("/api/x", init())).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("getToken null -> ApiError(401) without fetch and without onAuthLost", async () => {
    const onAuthLost = vi.fn();
    const { f, fetchFn } = setup([200], async () => null, { onAuthLost });
    await expect(f("/api/x", init())).rejects.toMatchObject({ status: 401 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("getToken rejecting -> ApiError(0, network) with no token in the message", async () => {
    const { f } = setup([200], async () => {
      throw new Error("secret-token-value");
    });
    const e = await f("/api/x", init()).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 0, code: "network" });
    expect((e as Error).message).not.toContain("secret-token-value");
  });

  it("re-sends a Blob body on the retry", async () => {
    const blob = new Blob(["jpeg"]);
    const { f, fetchFn } = setup([401, 200], async () => "t");
    await f("/api/x", { ...init(), body: blob });
    const bodies = fetchFn.mock.calls.map((c) => (c[1] as RequestInit).body);
    expect(bodies).toEqual([blob, blob]);
  });
});
