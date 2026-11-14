// @vitest-environment node
import type { IncomingMessage } from "node:http";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  createLocalJWKSet,
  type CryptoKey,
  type JWTVerifyGetKey,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  AccessConfigError,
  createAccessAuth,
  createAccessVerifier,
  createFixedAuth,
  loadAccessConfig,
} from "./access.js";
import { OWNER_A, OWNER_B } from "./test/auth.js";

const issuer = "https://team.cloudflareaccess.com";
const aud = "aud-tag-123";
let priv: CryptoKey;
let other: CryptoKey;
let jwks: JWTVerifyGetKey;

beforeAll(async () => {
  const a = await generateKeyPair("RS256");
  const b = await generateKeyPair("RS256");
  priv = a.privateKey;
  other = b.privateKey;
  const jwk = { ...(await exportJWK(a.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

const sign = (
  opts: { key?: CryptoKey; aud?: string; iss?: string; exp?: string | number; nbf?: number } = {},
) => {
  let j = new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? issuer)
    .setAudience(opts.aud ?? aud)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m");
  if (opts.nbf !== undefined) j = j.setNotBefore(opts.nbf);
  return j.sign(opts.key ?? priv);
};

const OWNER_RAW = OWNER_A.toUpperCase();
const req = (headers: Record<string, string>) => ({ headers }) as unknown as IncomingMessage;
const verifier = () => createAccessVerifier({ issuer, aud, jwks });

describe("verifier", () => {
  it("valid RS256 token with right aud/iss passes", async () => {
    const r = await verifier().verify(req({ "cf-access-jwt-assertion": await sign() }));
    expect(r.ok).toBe(true);
  });

  it("missing header -> reject", async () => {
    expect((await verifier().verify(req({}))).ok).toBe(false);
  });

  it("bad signature (other key) -> reject", async () => {
    const r = await verifier().verify(
      req({ "cf-access-jwt-assertion": await sign({ key: other }) }),
    );
    expect(r.ok).toBe(false);
  });

  it("wrong aud -> reject / wrong iss -> reject", async () => {
    expect(
      (await verifier().verify(req({ "cf-access-jwt-assertion": await sign({ aud: "nope" }) }))).ok,
    ).toBe(false);
    expect(
      (
        await verifier().verify(
          req({
            "cf-access-jwt-assertion": await sign({ iss: "https://evil.cloudflareaccess.com" }),
          }),
        )
      ).ok,
    ).toBe(false);
  });

  it("expired -> reject; nbf in the future beyond tolerance -> reject", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      (await verifier().verify(req({ "cf-access-jwt-assertion": await sign({ exp: now - 600 }) })))
        .ok,
    ).toBe(false);
    expect(
      (await verifier().verify(req({ "cf-access-jwt-assertion": await sign({ nbf: now + 600 }) })))
        .ok,
    ).toBe(false);
  });

  it("`alg: none` and HS256 tokens -> reject", async () => {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const payload = { iss: issuer, aud, exp: Math.floor(Date.now() / 1000) + 300 };
    const none = `${b64({ alg: "none", kid: "k1" })}.${b64(payload)}.`;
    expect((await verifier().verify(req({ "cf-access-jwt-assertion": none }))).ok).toBe(false);
    const hs = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", kid: "k1" })
      .sign(new TextEncoder().encode("secret-secret-secret-secret-secret"));
    expect((await verifier().verify(req({ "cf-access-jwt-assertion": hs }))).ok).toBe(false);
  });

  it("JWKS fetch failure -> reject (fail closed)", async () => {
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as JWTVerifyGetKey;
    const v = createAccessVerifier({ issuer, aud, jwks: failing });
    expect((await v.verify(req({ "cf-access-jwt-assertion": await sign() }))).ok).toBe(false);
  });

  it("never reads the `CF_Authorization` cookie", async () => {
    const r = await verifier().verify(req({ cookie: `CF_Authorization=${await sign()}` }));
    expect(r.ok).toBe(false);
  });

  it("builds a remote JWKS from certsUrl when none is injected", () => {
    expect(
      createAccessVerifier({ issuer, aud, certsUrl: `${issuer}/cdn-cgi/access/certs` }).verify,
    ).toBeTypeOf("function");
  });
});

describe("loadAccessConfig", () => {
  it("both set -> on; issuer and certs URL derived", () => {
    expect(
      loadAccessConfig({
        CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
        CF_ACCESS_AUD: "abc",
        TUDO_OWNER_SUB: OWNER_RAW,
      }),
    ).toEqual({
      mode: "on",
      issuer,
      certsUrl: `${issuer}/cdn-cgi/access/certs`,
      aud: "abc",
      ownerSub: OWNER_A,
    });
  });

  it("missing -> config error, unless TUDO_ACCESS_DISABLED=1 outside production -> off", () => {
    expect(() => loadAccessConfig({})).toThrow(AccessConfigError);
    expect(() => loadAccessConfig({ CF_ACCESS_AUD: "x" })).toThrow(AccessConfigError);
    expect(() => loadAccessConfig({ CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" })).toThrow(
      AccessConfigError,
    );
    expect(loadAccessConfig({ TUDO_ACCESS_DISABLED: "1", TUDO_OWNER_SUB: OWNER_A })).toEqual({
      mode: "off",
      ownerSub: OWNER_A,
    });
  });

  it("TUDO_OWNER_SUB: missing -> must be set; malformed or nil -> must be a valid UUID; never echoed", () => {
    const on = { CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", CF_ACCESS_AUD: "abc" };
    const off = { TUDO_ACCESS_DISABLED: "1" };
    for (const base of [on, off]) {
      expect(() => loadAccessConfig(base)).toThrow("TUDO_OWNER_SUB must be set");
      expect(() => loadAccessConfig({ ...base, TUDO_OWNER_SUB: "  " })).toThrow(
        "TUDO_OWNER_SUB must be set",
      );
      for (const bad of ["SECRETISH", "00000000-0000-0000-0000-000000000000"]) {
        const err = (() => {
          try {
            loadAccessConfig({ ...base, TUDO_OWNER_SUB: bad });
          } catch (e) {
            return e as Error;
          }
        })();
        expect(err?.message).toBe("TUDO_OWNER_SUB must be a valid UUID");
      }
    }
  });

  it("TUDO_ACCESS_DISABLED=1 with NODE_ENV=production -> config error", () => {
    expect(() => loadAccessConfig({ TUDO_ACCESS_DISABLED: "1", NODE_ENV: "production" })).toThrow(
      AccessConfigError,
    );
  });

  it("team domain not `*.cloudflareaccess.com` -> config error; AUD with whitespace -> config error", () => {
    expect(() =>
      loadAccessConfig({ CF_ACCESS_TEAM_DOMAIN: "evil.example.com", CF_ACCESS_AUD: "x" }),
    ).toThrow(AccessConfigError);
    expect(() =>
      loadAccessConfig({
        CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
        CF_ACCESS_AUD: "a b",
      }),
    ).toThrow(AccessConfigError);
  });

  it("error messages never contain values", () => {
    try {
      loadAccessConfig({ CF_ACCESS_TEAM_DOMAIN: "evil.example.com", CF_ACCESS_AUD: "secretaud" });
    } catch (e) {
      expect((e as Error).message).not.toContain("secretaud");
    }
  });
});

describe("auth objects", () => {
  it("createAccessAuth returns the owner and ignores x-user-id / query / body", async () => {
    const auth = createAccessAuth({ verifier: verifier(), ownerSub: OWNER_A });
    const r = await auth.authenticate({
      headers: {
        "cf-access-jwt-assertion": await sign(),
        "x-user-id": OWNER_B,
      },
      url: `/api/items?user_id=${OWNER_B}`,
      body: { user_id: OWNER_B },
    } as unknown as IncomingMessage);
    expect(r).toEqual({ ok: true, userId: OWNER_A });
  });

  it("createAccessAuth: a failing verifier gives { ok: false, code } and no userId", async () => {
    const auth = createAccessAuth({ verifier: verifier(), ownerSub: OWNER_A });
    expect(await auth.authenticate(req({}))).toEqual({ ok: false, code: "missing" });
  });

  it("createFixedAuth always returns the owner", async () => {
    expect(await createFixedAuth(OWNER_B).authenticate(req({}))).toEqual({
      ok: true,
      userId: OWNER_B,
    });
  });
});
