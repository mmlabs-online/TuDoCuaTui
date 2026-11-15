import { describe, expect, it, vi } from "vitest";
import { createIdentityClient } from "./identityClient";
import type { AuthError } from "./types";

const ID = "11111111-1111-4111-8111-111111111111";
const BASE = "https://api.test/api/v1";
const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const setup = (res: () => Response | Promise<Response>) => {
  const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => res());
  const client = createIdentityClient({
    baseUrl: BASE,
    app: "tudocuatui",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  const req = () => {
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    return {
      url,
      init,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    };
  };
  return { client, fetchFn, req };
};
const tokenBody = {
  access_token: "tok-secret",
  token_type: "Bearer",
  expires_in: 900,
  audience: "tudocuatui",
};
const reject = async (p: Promise<unknown>) =>
  (await p.then(
    () => null,
    (e: unknown) => e,
  )) as AuthError;

describe("request shapes", () => {
  it("login", async () => {
    const { client, req } = setup(() =>
      json({ account_id: ID, user: { id: ID, email: "a@b.co" } }),
    );
    expect(await client.login({ email: "a@b.co", password: "pw" })).toEqual({
      accountId: ID,
      email: "a@b.co",
    });
    expect(req().url).toBe(`${BASE}/auth/login`);
    expect(req().init.method).toBe("POST");
    expect(req().init.credentials).toBe("include");
    expect(req().headers).toEqual({ "Content-Type": "application/json", "X-MM-App": "tudocuatui" });
    expect(req().body).toEqual({ email: "a@b.co", password: "pw" });
  });

  it("login sends turnstile_token only when given", async () => {
    const { client, req } = setup(() => json({ account_id: ID, user: { email: "a@b.co" } }));
    await client.login({ email: "a@b.co", password: "pw", turnstileToken: "ts" });
    expect(req().body).toEqual({ email: "a@b.co", password: "pw", turnstile_token: "ts" });
  });

  it("token", async () => {
    const { client, req } = setup(() => json(tokenBody));
    expect(await client.token(ID)).toEqual({ accessToken: "tok-secret", expiresIn: 900 });
    expect(req().url).toBe(`${BASE}/auth/token`);
    expect(req().body).toEqual({ audience: "tudocuatui", account_id: ID });
    expect(req().init.credentials).toBe("include");
    expect(req().headers["X-MM-App"]).toBe("tudocuatui");
  });

  it("logout and resend", async () => {
    const a = setup(() => new Response(null, { status: 204 }));
    await a.client.logout(ID);
    expect(a.req().url).toBe(`${BASE}/auth/logout`);
    expect(a.req().body).toEqual({ account_id: ID });
    expect(a.req().init.credentials).toBe("include");
    const b = setup(() => json({}, 202));
    await b.client.resendVerification(ID);
    expect(b.req().url).toBe(`${BASE}/auth/verify-email/resend`);
    expect(b.req().body).toEqual({ account_id: ID });
    expect(b.req().headers["X-MM-App"]).toBe("tudocuatui");
  });

  it("signup", async () => {
    const { client, req } = setup(() => json({ id: ID, email: "a@b.co" }, 201));
    expect(await client.signup({ email: "a@b.co", password: "pw", turnstileToken: "ts" })).toEqual({
      email: "a@b.co",
    });
    expect(req().url).toBe(`${BASE}/auth/signup`);
    expect(req().init.credentials).toBe("include");
    expect(req().headers["X-MM-App"]).toBe("tudocuatui");
    expect(req().body).toEqual({ email: "a@b.co", password: "pw", turnstile_token: "ts" });
  });

  it("verifyEmail is the public call: omit credentials, no app header, body only", async () => {
    const { client, req } = setup(() => new Response(null, { status: 204 }));
    await client.verifyEmail("tok-in-body");
    expect(req().url).toBe(`${BASE}/auth/verify-email`);
    expect(req().url).not.toContain("?");
    expect(req().init.credentials).toBe("omit");
    expect(req().headers).toEqual({ "Content-Type": "application/json" });
    expect(req().body).toEqual({ token: "tok-in-body" });
  });
});

describe("response validation", () => {
  const bad: [string, unknown][] = [
    ["non-UUID account", null],
    ["token_type", { ...tokenBody, token_type: "Basic" }],
    ["missing expires_in", { ...tokenBody, expires_in: undefined }],
    ["zero expires_in", { ...tokenBody, expires_in: 0 }],
    ["NaN expires_in", { ...tokenBody, expires_in: "NaN" }],
    ["huge expires_in", { ...tokenBody, expires_in: 10 ** 9 }],
    ["wrong audience", { ...tokenBody, audience: "other" }],
    ["empty token", { ...tokenBody, access_token: "" }],
  ];
  it.each(bad.slice(1))("token: %s -> unknown", async (_n, b) => {
    const { client } = setup(() => json(b));
    expect((await reject(client.token(ID))).code).toBe("unknown");
  });

  it("login: non-UUID account_id -> unknown", async () => {
    const { client } = setup(() => json({ account_id: "nope", user: { email: "a@b.co" } }));
    expect((await reject(client.login({ email: "a@b.co", password: "p" }))).code).toBe("unknown");
  });
});

describe("errors", () => {
  it("maps server errors and network failures", async () => {
    const a = setup(() => json({ error: { code: "not_member" } }, 403));
    expect((await reject(a.client.token(ID))).code).toBe("not_member");
    const b = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    expect((await reject(b.client.token(ID))).code).toBe("network");
    const c = setup(() => json({ error: { code: "rate_limited" } }, 429, { "Retry-After": "30" }));
    expect(await reject(c.client.logout(ID))).toEqual({
      code: "rate_limited",
      retryAfterSeconds: 30,
    });
  });

  it("error objects never contain the token or password", async () => {
    const a = setup(() =>
      json({ error: { code: "invalid_credentials", message: "tok-in-body hunter2" } }, 401),
    );
    const e1 = await reject(a.client.verifyEmail("tok-in-body"));
    const b = setup(() => {
      throw new TypeError("hunter2 failed");
    });
    const e2 = await reject(b.client.login({ email: "a@b.co", password: "hunter2" }));
    for (const e of [e1, e2]) {
      expect(JSON.stringify(e)).not.toMatch(/tok-in-body|hunter2/);
      expect(String(e)).not.toMatch(/tok-in-body|hunter2/);
    }
  });
});
