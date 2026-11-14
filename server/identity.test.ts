// @vitest-environment node
import type { IncomingMessage } from "node:http";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
  type CryptoKey,
  type JWK,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdentityVerifier, loadIdentityConfig } from "./identity.js";

const ISS = "https://api.mmlabs.online";
const SUB = "11111111-1111-4111-8111-111111111111";
const ENUM = new Set([
  "missing",
  "too_large",
  "malformed",
  "alg",
  "signature",
  "expired",
  "unknown_kid",
  "jwks_unavailable",
  "email_unverified",
  "sub_invalid",
  "no_role",
  "invalid",
  ...["iss", "aud", "typ", "iat", "nbf", "exp", "sub", "jti"].map((c) => `claim_${c}`),
]);

const now = () => Math.floor(Date.now() / 1000);
const req = (authorization?: string, extra: Record<string, string> = {}) =>
  ({
    headers: { ...(authorization ? { authorization } : {}), ...extra },
    url: "/api/items",
  }) as unknown as IncomingMessage;

async function keyPair(kid: string) {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
  return { privateKey, jwk };
}

type Claims = Record<string, unknown>;
function goodClaims(): Claims {
  return {
    iss: ISS,
    aud: "tudocuatui",
    sub: SUB,
    jti: "jti-secret-1",
    email: "someone@example.com",
    email_verified: true,
    roles: ["tudocuatui:member"],
    iat: now(),
    exp: now() + 600,
  };
}

async function sign(
  privateKey: CryptoKey,
  claims: Claims,
  header: Record<string, unknown> = {},
  drop: string[] = [],
) {
  const c = { ...claims };
  for (const k of drop) delete c[k];
  return new SignJWT(c as never)
    .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "at+jwt", ...header } as never)
    .sign(privateKey);
}

async function setup() {
  const k = await keyPair("k1");
  const other = await keyPair("k1");
  const getKey = createLocalJWKSet({ keys: [k.jwk] });
  let calls = 0;
  const jwks = ((h: never, t: never) => {
    calls++;
    return getKey(h, t);
  }) as typeof getKey;
  const verifier = createIdentityVerifier({ issuer: ISS, jwks });
  const check = async (token: string) => verifier.verify(req(`Bearer ${token}`));
  return { k, other, verifier, check, calls: () => calls };
}

const spies = () =>
  (["log", "error", "warn", "info", "debug"] as const).map((m) => vi.spyOn(console, m));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("verifier", () => {
  it("happy path returns the canonical sub", async () => {
    const { k, check } = await setup();
    expect(await check(await sign(k.privateKey, goodClaims()))).toEqual({ ok: true, userId: SUB });
  });

  it("alg HS256 and RS256 -> alg; an unsecured token -> malformed; key getter never called", async () => {
    const { check, calls } = await setup();
    const hs = await new SignJWT(goodClaims() as never)
      .setProtectedHeader({ alg: "HS256", kid: "k1", typ: "at+jwt" })
      .sign(new TextEncoder().encode("x".repeat(32)));
    const none = new UnsecuredJWT(goodClaims() as never).encode();
    const rs = (await generateKeyPair("RS256", { modulusLength: 2048 })).privateKey;
    const rsTok = await new SignJWT(goodClaims() as never)
      .setProtectedHeader({ alg: "RS256", kid: "k1", typ: "at+jwt" })
      .sign(rs);
    for (const t of [hs, rsTok]) expect(await check(t)).toEqual({ ok: false, code: "alg" });
    expect(await check(none)).toEqual({ ok: false, code: "malformed" });
    expect(calls()).toBe(0);
  });

  it("wrong aud and array aud -> claim_aud", async () => {
    const { k, check } = await setup();
    for (const aud of ["ricotdin", ["tudocuatui", "x"]]) {
      expect(await check(await sign(k.privateKey, { ...goodClaims(), aud }))).toEqual({
        ok: false,
        code: "claim_aud",
      });
    }
  });

  it("iss variants -> claim_iss", async () => {
    const { k, check } = await setup();
    for (const iss of [
      "https://api.mmlabs.online.evil.com",
      "https://evil.com/https://api.mmlabs.online",
      "https://api.mmlabs.online/",
      "http://api.mmlabs.online",
    ]) {
      expect(await check(await sign(k.privateKey, { ...goodClaims(), iss }))).toEqual({
        ok: false,
        code: "claim_iss",
      });
    }
  });

  it("typ missing or JWT -> claim_typ", async () => {
    const { k, check } = await setup();
    expect(await check(await sign(k.privateKey, goodClaims(), { typ: "JWT" }))).toEqual({
      ok: false,
      code: "claim_typ",
    });
    expect(await check(await sign(k.privateKey, goodClaims(), { typ: undefined }))).toEqual({
      ok: false,
      code: "claim_typ",
    });
  });

  it("time claims", async () => {
    const { k, check } = await setup();
    const t = (c: Claims) => sign(k.privateKey, { ...goodClaims(), ...c });
    expect(await check(await t({ exp: now() - 31 }))).toEqual({ ok: false, code: "expired" });
    expect((await check(await t({ exp: now() - 29, iat: now() - 100 }))).ok).toBe(true);
    expect(await check(await t({ iat: now() + 31 }))).toEqual({ ok: false, code: "claim_iat" });
    expect(await check(await t({ iat: now() - 931 }))).toEqual({ ok: false, code: "expired" });
    expect(await check(await t({ nbf: now() + 31 }))).toEqual({ ok: false, code: "claim_nbf" });
  });

  it("missing required claims and a numeric jti", async () => {
    const { k, check } = await setup();
    for (const name of ["exp", "iat", "sub", "jti"]) {
      expect(await check(await sign(k.privateKey, goodClaims(), {}, [name]))).toEqual({
        ok: false,
        code: `claim_${name}`,
      });
    }
    expect(await check(await sign(k.privateKey, { ...goodClaims(), jti: 5 }))).toEqual({
      ok: false,
      code: "claim_jti",
    });
  });

  it("email_verified must be exactly true", async () => {
    const { k, check } = await setup();
    for (const v of [false, "true", undefined]) {
      expect(await check(await sign(k.privateKey, { ...goodClaims(), email_verified: v }))).toEqual(
        {
          ok: false,
          code: "email_unverified",
        },
      );
    }
  });

  it("sub must already be a canonical UUID", async () => {
    const { k, check } = await setup();
    for (const sub of [
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      ` ${SUB} `,
      "00000000-0000-0000-0000-000000000000",
      "nope",
      7,
    ]) {
      expect(await check(await sign(k.privateKey, { ...goodClaims(), sub }))).toEqual({
        ok: false,
        code: "sub_invalid",
      });
    }
  });

  it("roles need a tudocuatui: entry", async () => {
    const { k, check } = await setup();
    for (const roles of [
      undefined,
      [],
      ["ricotdin:member"],
      ["tudocuatui:"],
      "tudocuatui:member",
      [1],
    ]) {
      expect(await check(await sign(k.privateKey, { ...goodClaims(), roles }))).toEqual({
        ok: false,
        code: "no_role",
      });
    }
    const ok = await sign(k.privateKey, {
      ...goodClaims(),
      roles: ["ricotdin:x", "tudocuatui:member"],
    });
    expect((await check(ok)).ok).toBe(true);
  });

  it("another key with the same kid -> signature", async () => {
    const { other, check } = await setup();
    expect(await check(await sign(other.privateKey, goodClaims()))).toEqual({
      ok: false,
      code: "signature",
    });
  });

  it("embedded jwk/jku with an unknown kid -> unknown_kid, the embedded key is not used", async () => {
    const { other, check } = await setup();
    const tok = await sign(other.privateKey, goodClaims(), {
      kid: "evil",
      jwk: other.jwk,
      jku: "https://evil.example/jwks.json",
    });
    expect(await check(tok)).toEqual({ ok: false, code: "unknown_kid" });
  });

  it("Authorization header shapes", async () => {
    const { k, verifier } = await setup();
    const tok = await sign(k.privateKey, goodClaims());
    expect(await verifier.verify(req())).toEqual({ ok: false, code: "missing" });
    expect(await verifier.verify(req("Basic abc"))).toEqual({ ok: false, code: "missing" });
    expect(await verifier.verify(req("Bearer x"))).toEqual({ ok: false, code: "malformed" });
    expect(await verifier.verify(req(`Bearer  ${tok}`))).toEqual({ ok: false, code: "malformed" });
    expect((await verifier.verify(req(`bearer ${tok}`))).ok).toBe(true);
  });

  it("oversized header -> too_large before the key getter", async () => {
    const { verifier, calls } = await setup();
    const r = await verifier.verify(req(`Bearer ${"a".repeat(4097)}`));
    expect(r).toEqual({ ok: false, code: "too_large" });
    expect(calls()).toBe(0);
  });

  it("a token outside the Authorization header is ignored", async () => {
    const { k, verifier } = await setup();
    const tok = await sign(k.privateKey, goodClaims());
    const r = {
      headers: { cookie: `a=${tok}`, "cf-access-jwt-assertion": tok },
      url: `/api/items?access_token=${tok}`,
    } as unknown as IncomingMessage;
    expect(await verifier.verify(r)).toEqual({ ok: false, code: "missing" });
  });

  it("failures are fixed codes only and never log", async () => {
    const logs = spies();
    const { k, check } = await setup();
    const results = [
      await check("a.b.c"),
      await check(await sign(k.privateKey, { ...goodClaims(), aud: "x" })),
      await check(
        await sign(k.privateKey, { ...goodClaims(), email: "leak@example.com" }, {}, ["sub"]),
      ),
    ];
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(["code", "ok"]);
      expect(ENUM.has((r as { code: string }).code)).toBe(true);
    }
    for (const l of logs) expect(l).not.toHaveBeenCalled();
    expect(JSON.stringify(results)).not.toContain("leak@example.com");
  });
});

describe("remote JWKS", () => {
  function jwksServer(initial: JWK[]) {
    const state = { keys: initial, fetches: [] as Array<{ url: string; ua: string | null }> };
    const fetchFn = (async (url: string | URL, init?: RequestInit) => {
      state.fetches.push({ url: String(url), ua: new Headers(init?.headers).get("user-agent") });
      return new Response(JSON.stringify({ keys: state.keys }), { status: 200 });
    }) as typeof fetch;
    return { state, fetchFn };
  }

  it("fetches lazily, honours the 60 s cooldown, picks up a rotated key", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2030-01-01T00:00:00Z") });
    const k1 = await keyPair("k1");
    const k2 = await keyPair("k2");
    const { state, fetchFn } = jwksServer([k1.jwk]);
    const v = createIdentityVerifier({ issuer: ISS, fetch: fetchFn });
    expect(state.fetches).toHaveLength(0);
    const t1 = await sign(k1.privateKey, goodClaims());
    const t2 = async () => sign(k2.privateKey, goodClaims(), { kid: "k2" });
    expect((await v.verify(req(`Bearer ${t1}`))).ok).toBe(true);
    expect(state.fetches).toHaveLength(1);
    expect(state.fetches[0]).toEqual({
      url: `${ISS}/.well-known/jwks.json`,
      ua: "tudocuatui-server",
    });
    vi.setSystemTime(Date.now() + 1000);
    expect(await v.verify(req(`Bearer ${await t2()}`))).toEqual({ ok: false, code: "unknown_kid" });
    expect(state.fetches).toHaveLength(1);
    vi.setSystemTime(Date.now() + 60_000);
    expect(await v.verify(req(`Bearer ${await t2()}`))).toEqual({ ok: false, code: "unknown_kid" });
    expect(state.fetches).toHaveLength(2);
    vi.setSystemTime(Date.now() + 1000);
    await v.verify(req(`Bearer ${await t2()}`));
    expect(state.fetches).toHaveLength(2);
    state.keys = [k1.jwk, k2.jwk];
    vi.setSystemTime(Date.now() + 60_000);
    expect((await v.verify(req(`Bearer ${await t2()}`))).ok).toBe(true);
    expect(state.fetches).toHaveLength(3);
  });

  it("JWKS failures fail closed with jwks_unavailable", async () => {
    const k1 = await keyPair("k1");
    const tok = await sign(k1.privateKey, goodClaims());
    const responses: Array<() => Promise<Response>> = [
      () => Promise.reject(new TypeError("fetch failed")),
      async () => new Response("{}", { status: 500 }),
      async () => new Response("", { status: 301, headers: { location: "https://evil.example/" } }),
      async () => new Response("not json", { status: 200 }),
      async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 }),
      (): Promise<Response> => new Promise(() => {}),
    ];
    for (const r of responses) {
      const fetchFn = ((_u: unknown, init?: RequestInit) =>
        init?.signal
          ? Promise.race([
              r(),
              new Promise<Response>((_, rej) =>
                init.signal!.addEventListener("abort", () =>
                  rej(Object.assign(new Error("t"), { name: "TimeoutError" })),
                ),
              ),
            ])
          : r()) as typeof fetch;
      const v = createIdentityVerifier({ issuer: ISS, fetch: fetchFn, timeoutMs: 50 });
      expect(await v.verify(req(`Bearer ${tok}`))).toEqual({ ok: false, code: "jwks_unavailable" });
    }
  });
});

describe("loadIdentityConfig", () => {
  const prod = { NODE_ENV: "production" };
  it("missing issuer throws, naming the variable", () => {
    expect(() => loadIdentityConfig({})).toThrow(/MM_IDENTITY_ISSUER/);
  });
  it("accepts the production issuer", () => {
    expect(loadIdentityConfig({ ...prod, MM_IDENTITY_ISSUER: ISS })).toEqual({
      issuer: ISS,
      jwksUrl: `${ISS}/.well-known/jwks.json`,
    });
  });
  it("rejects userinfo, port, path, query, fragment, trailing slash; never prints the value", () => {
    for (const v of [
      "https://u:p@api.mmlabs.online",
      "https://api.mmlabs.online:8443",
      "https://api.mmlabs.online/x",
      "https://api.mmlabs.online?a=1",
      "https://api.mmlabs.online#f",
      "https://api.mmlabs.online/",
      "not a url",
    ]) {
      expect(() => loadIdentityConfig({ MM_IDENTITY_ISSUER: v })).toThrow(/MM_IDENTITY_ISSUER/);
      try {
        loadIdentityConfig({ MM_IDENTITY_ISSUER: v });
      } catch (e) {
        expect((e as Error).message).not.toContain("mmlabs.online:8443");
        expect((e as Error).message).not.toContain("u:p");
      }
    }
  });
  it("production allows only the production issuer", () => {
    for (const v of ["https://evil.example", "http://localhost:8000", "http://api.mmlabs.online"]) {
      expect(() => loadIdentityConfig({ ...prod, MM_IDENTITY_ISSUER: v })).toThrow(
        /MM_IDENTITY_ISSUER/,
      );
    }
  });
  it("outside production: https hosts and http://localhost:<port> only", () => {
    expect(loadIdentityConfig({ MM_IDENTITY_ISSUER: "http://localhost:8000" }).issuer).toBe(
      "http://localhost:8000",
    );
    expect(loadIdentityConfig({ MM_IDENTITY_ISSUER: "https://staging.example" }).issuer).toBe(
      "https://staging.example",
    );
    for (const v of ["http://127.0.0.1:8000", "http://example.com", "http://localhost"]) {
      expect(() => loadIdentityConfig({ MM_IDENTITY_ISSUER: v })).toThrow(/MM_IDENTITY_ISSUER/);
    }
  });
});
