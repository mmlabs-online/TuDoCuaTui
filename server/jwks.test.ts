// @vitest-environment node
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createJwksResolver, JwksUnavailable } from "./jwks.js";

const URL_ = "https://api.mmlabs.online/.well-known/jwks.json";
const MIN = 60_000;
const HOUR = 3_600_000;

async function keyPair(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  return { privateKey, jwk };
}
const headerOf = (kid: string) => ({ alg: "ES256", kid });
const tok = "a.b.c";
const ok = (keys: JWK[]) => new Response(JSON.stringify({ keys }), { status: 200 });

function setup(opts: { timeoutMs?: number } = {}) {
  const state = { t: 1_000_000, now: () => state.t };
  const logs: Array<Record<string, unknown>> = [];
  const fetchFn = vi.fn<(...a: Parameters<typeof fetch>) => Promise<Response>>();
  const getKey = createJwksResolver({
    url: URL_,
    fetch: fetchFn as unknown as typeof fetch,
    now: state.now,
    log: (e) => logs.push(e),
    ...opts,
  });
  return { state, logs, fetchFn, getKey };
}

describe("createJwksResolver", () => {
  it("lazy: no fetch until the first key lookup", async () => {
    const k = await keyPair("k1");
    const { fetchFn, getKey } = setup();
    fetchFn.mockResolvedValue(ok([k.jwk]));
    expect(fetchFn).not.toHaveBeenCalled();
    await getKey(headerOf("k1"), tok as never);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('fetch init: redirect "error", User-Agent tudocuatui-server, a timeout signal, the JWKS URL', async () => {
    const k = await keyPair("k1");
    const { fetchFn, getKey } = setup();
    fetchFn.mockResolvedValue(ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe(URL_);
    expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("user-agent")).toBe("tudocuatui-server");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fresh for 300 s: no fetch at +299 s, a refetch at +301 s", async () => {
    const k = await keyPair("k1");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockImplementation(async () => ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    state.t += 299_000;
    await getKey(headerOf("k1"), tok as never);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    state.t += 2_000;
    await getKey(headerOf("k1"), tok as never);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("concurrent stale requests share one fetch (single-flight)", async () => {
    const k = await keyPair("k1");
    const { fetchFn, getKey } = setup();
    let release!: (r: Response) => void;
    fetchFn.mockReturnValue(new Promise<Response>((r) => (release = r)));
    const a = getKey(headerOf("k1"), tok as never);
    const b = getKey(headerOf("k1"), tok as never);
    release(ok([k.jwk]));
    await Promise.all([a, b]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stale set is served up to 24 h while refetch fails", async () => {
    const k = await keyPair("k1");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockResolvedValueOnce(ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    fetchFn.mockRejectedValue(new TypeError("fetch failed"));
    for (const dt of [301_000, 12 * HOUR, 24 * HOUR]) {
      state.t = 1_000_000 + dt;
      await expect(getKey(headerOf("k1"), tok as never)).resolves.toBeTruthy();
    }
  });

  it("past 24 h without a successful fetch -> JwksUnavailable", async () => {
    const k = await keyPair("k1");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockResolvedValueOnce(ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    fetchFn.mockRejectedValue(new TypeError("fetch failed"));
    state.t = 1_000_000 + 24 * HOUR + 1;
    await expect(getKey(headerOf("k1"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
  });

  it("failed attempt -> no new fetch for 60 s, then one retry", async () => {
    const k = await keyPair("k1");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockResolvedValueOnce(ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    state.t += 301_000;
    fetchFn.mockRejectedValue(new TypeError("fetch failed"));
    await getKey(headerOf("k1"), tok as never);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    state.t += 59_000;
    await getKey(headerOf("k1"), tok as never);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    state.t += 1_000;
    await getKey(headerOf("k1"), tok as never);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("no keys ever -> JwksUnavailable; a second lookup within 60 s does not fetch", async () => {
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockRejectedValue(new TypeError("fetch failed"));
    await expect(getKey(headerOf("k1"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
    state.t += 30_000;
    await expect(getKey(headerOf("k1"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("recovery: a later successful fetch replaces the set and clears the failure state", async () => {
    const k1 = await keyPair("k1");
    const k2 = await keyPair("k2");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(getKey(headerOf("k1"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
    state.t += MIN;
    fetchFn.mockResolvedValueOnce(ok([k1.jwk]));
    await expect(getKey(headerOf("k1"), tok as never)).resolves.toBeTruthy();
    state.t += 301_000;
    fetchFn.mockResolvedValueOnce(ok([k2.jwk]));
    await expect(getKey(headerOf("k2"), tok as never)).resolves.toBeTruthy();
    // failure state cleared: an unknown kid is a plain unknown kid again, not "unavailable"
    state.t += MIN;
    fetchFn.mockResolvedValueOnce(ok([k2.jwk]));
    await expect(getKey(headerOf("zzz"), tok as never)).rejects.toMatchObject({
      code: "ERR_JWKS_NO_MATCHING_KEY",
    });
  });

  it("unknown kid refetches at most once per 60 s", async () => {
    const k = await keyPair("k1");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockImplementation(async () => ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    state.t += 1_000;
    await expect(getKey(headerOf("nope"), tok as never)).rejects.toMatchObject({
      code: "ERR_JWKS_NO_MATCHING_KEY",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    state.t += MIN;
    await expect(getKey(headerOf("nope"), tok as never)).rejects.toMatchObject({
      code: "ERR_JWKS_NO_MATCHING_KEY",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    state.t += 1_000;
    await expect(getKey(headerOf("nope"), tok as never)).rejects.toMatchObject({
      code: "ERR_JWKS_NO_MATCHING_KEY",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("unknown kid during an outage -> JwksUnavailable", async () => {
    const k = await keyPair("k1");
    const { state, fetchFn, getKey } = setup();
    fetchFn.mockResolvedValueOnce(ok([k.jwk]));
    await getKey(headerOf("k1"), tok as never);
    fetchFn.mockRejectedValue(new TypeError("fetch failed"));
    state.t += MIN; // refetch allowed, fails
    await expect(getKey(headerOf("rotated"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
    state.t += 1_000; // cooling down after the failure
    await expect(getKey(headerOf("rotated"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  describe("bad responses keep the last good set", () => {
    const big = "x".repeat(65_537);
    const cases: Array<[string, string, () => Response | Promise<Response>]> = [
      ["network", "network", () => Promise.reject(new TypeError("fetch failed"))],
      [
        "timeout",
        "timeout",
        () => Promise.reject(Object.assign(new Error("t"), { name: "TimeoutError" })),
      ],
      ["status 500", "status", () => new Response("{}", { status: 500 })],
      ["status 301", "status", () => new Response("", { status: 301 })],
      ["body over the cap", "size", () => new Response(big, { status: 200 })],
      [
        "Content-Length over the cap",
        "size",
        () => new Response("{}", { status: 200, headers: { "content-length": "70000" } }),
      ],
      ["not json", "parse", () => new Response("not json", { status: 200 })],
      [
        "invalid utf-8",
        "parse",
        () => new Response(new Uint8Array([0xff, 0xfe, 0xfd]), { status: 200 }),
      ],
      ["empty keys", "parse", () => new Response('{"keys":[]}', { status: 200 })],
      ["keys not an array", "parse", () => new Response('{"keys":"x"}', { status: 200 })],
      ["invalid key", "parse", () => new Response('{"keys":[{"kty":"nope"}]}', { status: 200 })],
      ["no keys member", "parse", () => new Response("{}", { status: 200 })],
    ];
    for (const [name, reason, respond] of cases) {
      it(`${name} -> reason ${reason}`, async () => {
        const k = await keyPair("k1");
        const { state, logs, fetchFn, getKey } = setup();
        fetchFn.mockResolvedValueOnce(ok([k.jwk]));
        await getKey(headerOf("k1"), tok as never);
        state.t += 301_000;
        fetchFn.mockImplementationOnce(async () => respond());
        await expect(getKey(headerOf("k1"), tok as never)).resolves.toBeTruthy();
        expect(logs).toEqual([{ event: "jwks_refresh_failed", reason }]);
        expect(JSON.stringify(logs)).not.toContain("mmlabs");
      });
    }
  });

  it("jwks_refresh_failed log has only {event, reason}", async () => {
    const { fetchFn, logs, getKey } = setup();
    fetchFn.mockResolvedValue(new Response('{"secret":"body"}', { status: 200 }));
    await expect(getKey(headerOf("k1"), tok as never)).rejects.toBeInstanceOf(JwksUnavailable);
    expect(logs).toHaveLength(1);
    expect(Object.keys(logs[0]).sort()).toEqual(["event", "reason"]);
    expect(["timeout", "network", "status", "size", "parse"]).toContain(logs[0].reason);
    expect(JSON.stringify(logs)).not.toMatch(/secret|body|https/);
  });

  it("a verified signature path works end to end with a real token", async () => {
    const k = await keyPair("k1");
    const { fetchFn, getKey } = setup();
    fetchFn.mockResolvedValue(ok([k.jwk]));
    const jws = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .sign(k.privateKey);
    await expect(
      getKey(headerOf("k1"), { payload: "", signature: "", protected: "" } as never),
    ).resolves.toBeTruthy();
    expect(jws.split(".")).toHaveLength(3);
  });
});
