// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { SPA_CSP } from "./http.js";
import { createIdentityAuth, createIdentityVerifier } from "./identity.js";
import { fixedAuth, OWNER_A } from "./test/auth.js";
import { fakePool } from "./test/fake-pool.js";

let dir: string;
const logs: Record<string, unknown>[] = [];
const servers: http.Server[] = [];

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tudo-app-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<html>INDEX</html>");
});
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function start(opts: {
  pool?: { query(sql: string): Promise<unknown>; connect?(): Promise<unknown> } | null;
  allow?: boolean | null;
}) {
  const auth = {
    authenticate: async () =>
      opts.allow === false
        ? { ok: false as const, code: "ERR_X" }
        : { ok: true as const, userId: OWNER_A },
  };
  const server = http.createServer(
    createApp({ pool: opts.pool ?? null, distDir: dir, auth, log: (e) => logs.push(e) }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("app", () => {
  it('/healthz -> 200 {status:"ok",auth} without a DB, no-store', async () => {
    const base = await start({});
    const res = await fetch(base + "/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", auth: "identity" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it('/readyz -> 503 {status:"unavailable"} with no pool and with a rejecting pool; no detail in body', async () => {
    const a = await fetch((await start({})) + "/readyz");
    expect(a.status).toBe(503);
    expect(await a.json()).toEqual({ status: "unavailable" });
    const pool = {
      query: async () =>
        Promise.reject(Object.assign(new Error("password=hunter2"), { code: "ECONNREFUSED" })),
    };
    const b = await fetch((await start({ pool })) + "/readyz");
    expect(b.status).toBe(503);
    expect(await b.text()).not.toContain("hunter2");
  });

  it("/readyz -> 200 with a pool whose query succeeds", async () => {
    const res = await fetch((await start({ pool: { query: async () => ({}) } })) + "/readyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("/api without a valid JWT -> 401 JSON `unauthorized`; static and health stay open", async () => {
    const base = await start({ allow: false });
    const api = await fetch(base + "/api/items");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: { code: "unauthorized" } });
    expect((await fetch(base + "/")).status).toBe(200);
    expect((await fetch(base + "/healthz")).status).toBe(200);
  });

  it("/api/anything (valid JWT) -> 404 JSON `not_found`, never index.html", async () => {
    const res = await fetch((await start({ allow: true })) + "/api/anything");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
    expect((await fetch((await start({ allow: true })) + "/api")).status).toBe(404);
  });

  it("access off (dev) -> /api reaches the router (404 JSON)", async () => {
    const res = await fetch((await start({ allow: null })) + "/api/nope");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("POST / -> 405 with `Allow: GET, HEAD`; HEAD / -> 200 with no body", async () => {
    const base = await start({});
    const post = await fetch(base + "/", { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    const head = await fetch(base + "/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await fetch(base + "/healthz", { method: "POST" })).status).toBe(405);
  });

  it("non-origin-form request targets (absolute-form, *) -> 400 bad_request, not served", async () => {
    const base = await start({ allow: false });
    const port = Number(new URL(base).port);
    for (const target of ["http://evil.example/api/x", "*"]) {
      const raw = await new Promise<string>((resolve, reject) => {
        const sock = net.connect(port, "127.0.0.1", () =>
          sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`),
        );
        let out = "";
        sock.on("data", (d) => (out += d));
        sock.on("end", () => resolve(out));
        sock.on("error", reject);
      });
      expect(raw.split("\r\n")[0]).toBe("HTTP/1.1 400 Bad Request");
      expect(raw).toContain("bad_request");
    }
  });

  it("every response has nosniff, Referrer-Policy, X-Frame-Options DENY, HSTS and an X-Request-Id", async () => {
    const base = await start({ allow: false });
    for (const p of ["/", "/healthz", "/readyz", "/api/x", "/assets/nope.js"]) {
      const res = await fetch(base + p);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("strict-transport-security")).toBe(
        "max-age=31536000; includeSubDomains",
      );
      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      await res.text();
    }
  });

  it("SPA CSP only on static responses", async () => {
    const base = await start({ allow: false });
    const spa = await fetch(base + "/");
    expect(spa.headers.get("content-security-policy")).toBe(SPA_CSP);
    await spa.text();
    for (const p of ["/healthz", "/api/x"]) {
      const res = await fetch(base + p);
      expect(res.headers.get("content-security-policy")).toBeNull();
      await res.text();
    }
  });

  it("`/verify-email` through the app -> `no-referrer`; `/` -> `strict-origin-when-cross-origin`", async () => {
    const base = await start({ allow: false });
    const v = await fetch(base + "/verify-email");
    expect(v.headers.get("referrer-policy")).toBe("no-referrer");
    await v.text();
    const root = await fetch(base + "/");
    expect(root.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    await root.text();
  });

  it("log: route template; never the raw URL, id, query, headers or token", async () => {
    logs.length = 0;
    const base = await start({ allow: true });
    const uuid = "11111111-1111-4111-8111-111111111111";
    const res = await fetch(`${base}/api/items/${uuid}?secret=qq`, {
      headers: { "Cf-Access-Jwt-Assertion": "tok-abc" },
    });
    await res.text();
    await new Promise((r) => setTimeout(r, 20));
    const entry = logs.find((l) => l.route === "/api/items/:id");
    expect(entry).toMatchObject({ method: "GET", route: "/api/items/:id", status: 405 });
    expect(typeof entry?.ms).toBe("number");
    expect(typeof entry?.id).toBe("string");
    const all = JSON.stringify(logs);
    expect(all).not.toContain("secret=qq");
    expect(all).not.toContain("tok-abc");
    expect(all).not.toContain(uuid);
  });

  it("/api routes are unreachable without a valid JWT: 401 before any handler or body read", async () => {
    const calls: string[] = [];
    const pool = {
      query: async () => calls.push("query"),
      connect: async () => calls.push("connect"),
    };
    const base = await start({ pool, allow: false });
    const res = await fetch(`${base}/api/items/11111111-1111-4111-8111-111111111111`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("GET /api/photos/:id without a valid JWT -> 401, no DB query, no Drive call", async () => {
    const calls: string[] = [];
    const pool = { query: async () => calls.push("query") };
    const drive = { getMedia: async () => calls.push("drive") };
    const server = http.createServer(
      createApp({
        pool,
        drive: drive as never,
        distDir: dir,
        auth: { authenticate: async () => ({ ok: false as const, code: "ERR_X" }) },
        log: () => {},
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    servers.push(server);
    const res = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/photos/11111111-1111-4111-8111-111111111111`,
    );
    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("a successful authenticate passes userId to the API; the body and query cannot override it", async () => {
    const queries: unknown[][] = [];
    const pool = fakePool({
      query: async (_sql: string, values?: unknown[]) => {
        queries.push(values ?? []);
        return { rows: [] };
      },
    });
    const base = await start({ pool, allow: true });
    const res = await fetch(`${base}/api/items?user_id=22222222-2222-4222-8222-222222222222`, {
      headers: { "x-user-id": "22222222-2222-4222-8222-222222222222" },
    });
    expect(res.status).toBe(200);
    expect(queries).toEqual([[OWNER_A]]);
  });

  it("unexpected errors -> 500 `internal` with requestId only", async () => {
    const server = http.createServer(
      createApp({
        pool: null,
        distDir: dir,
        auth: {
          authenticate: async () => {
            throw new Error("boom password=hunter2");
          },
        },
        log: (e) => logs.push(e),
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    servers.push(server);
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/x`);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain("internal");
    expect(body).not.toContain("hunter2");
  });
});

describe("identity auth", () => {
  const ISS = "https://api.mmlabs.online";
  const SUB = "44444444-4444-4444-8444-444444444444";

  async function startIdentity(pool: Parameters<typeof createApp>[0]["pool"] = null) {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
    const verifier = createIdentityVerifier({
      issuer: ISS,
      jwks: createLocalJWKSet({ keys: [jwk] }),
    });
    const server = http.createServer(
      createApp({
        pool,
        distDir: dir,
        auth: createIdentityAuth({ verifier }),
        authMode: "identity",
        log: (e) => logs.push(e),
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    servers.push(server);
    const token = (claims: Record<string, unknown> = {}) =>
      new SignJWT({
        iss: ISS,
        aud: "tudocuatui",
        sub: SUB,
        jti: "jti-xyz-123",
        email: "me@example.com",
        email_verified: true,
        roles: ["tudocuatui:member"],
        ...claims,
      })
        .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "at+jwt" })
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(privateKey);
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token };
  }

  it('/healthz -> {status:"ok",auth:"identity"}', async () => {
    const { base } = await startIdentity();
    expect(await (await fetch(base + "/healthz")).json()).toEqual({
      status: "ok",
      auth: "identity",
    });
  });

  it("JWKS unavailable -> 503 auth_unavailable with Retry-After 30, no pool call", async () => {
    logs.length = 0;
    const calls: string[] = [];
    const pool = {
      query: async () => calls.push("query"),
      connect: async () => calls.push("connect"),
    };
    const { privateKey } = await generateKeyPair("ES256");
    const verifier = createIdentityVerifier({
      issuer: ISS,
      jwks: async () => {
        throw new Error("down");
      },
    });
    const server = http.createServer(
      createApp({
        pool,
        distDir: dir,
        auth: createIdentityAuth({ verifier }),
        authMode: "identity",
        log: (e) => logs.push(e),
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    servers.push(server);
    const tok = await new SignJWT({
      iss: ISS,
      aud: "tudocuatui",
      sub: SUB,
      jti: "jti-xyz-123",
      email_verified: true,
      roles: ["tudocuatui:member"],
    })
      .setProtectedHeader({ alg: "ES256", kid: "k1", typ: "at+jwt" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(base + "/api/items", { headers: { Authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toMatchObject({ error: { code: "auth_unavailable" } });
    expect(calls).toEqual([]);
    expect(logs).toContainEqual({ event: "auth_unavailable", code: "jwks_unavailable" });
    expect(logs.some((e) => (e as { event?: string }).event === "auth_denied")).toBe(false);
  });

  it("a token with jku -> 401 unauthorized, logged auth_denied key_in_header", async () => {
    logs.length = 0;
    const { base } = await startIdentity();
    const { privateKey } = await generateKeyPair("ES256");
    const tok = await new SignJWT({ iss: ISS, aud: "tudocuatui", sub: SUB })
      .setProtectedHeader({
        alg: "ES256",
        kid: "k1",
        typ: "at+jwt",
        jku: "https://evil.example/jwks.json",
      })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
    const res = await fetch(base + "/api/items", { headers: { Authorization: `Bearer ${tok}` } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(logs).toContainEqual({ event: "auth_denied", code: "key_in_header" });
  });

  it("every /api route without a bearer, or with a bogus one -> 401, no pool call", async () => {
    const calls: string[] = [];
    const pool = {
      query: async () => calls.push("query"),
      connect: async () => calls.push("connect"),
    };
    const { base } = await startIdentity(pool);
    const id = "11111111-1111-4111-8111-111111111111";
    const routes: Array<[string, string]> = [
      ["GET", "/api/items"],
      ["GET", "/api/locations"],
      ["PUT", `/api/items/${id}`],
      ["DELETE", `/api/items/${id}`],
      ["POST", `/api/items/${id}/wear`],
      ["PUT", `/api/items/${id}/photo`],
      ["DELETE", `/api/items/${id}/photo`],
      ["GET", `/api/photos/${id}`],
      ["GET", "/api/ai-settings"],
      ["PUT", "/api/ai-settings"],
      ["POST", "/api/ai/tag-photo"],
    ];
    for (const [method, p] of routes) {
      for (const headers of [{} as Record<string, string>, { Authorization: "Bearer x.y.z" }]) {
        const res = await fetch(base + p, { method, headers });
        expect(res.status, `${method} ${p}`).toBe(401);
        expect(await res.json()).toEqual({ error: { code: "unauthorized" } });
      }
    }
    expect(calls).toEqual([]);
  });

  it("a valid token reaches the API as the canonical sub; logs hold no token, sub, email or jti", async () => {
    const users: unknown[] = [];
    const pool = fakePool({
      query: async (sql: string, params?: unknown[]) => {
        users.push(params);
        return { rows: [], rowCount: 0 };
      },
    });
    const { base, token } = await startIdentity(pool);
    logs.length = 0;
    const t = await token();
    const res = await fetch(base + "/api/locations", { headers: { Authorization: `Bearer ${t}` } });
    expect(res.status).toBe(200);
    expect(JSON.stringify(users)).toContain(SUB);
    await new Promise((r) => setTimeout(r, 20));
    for (const bad of [await token({ aud: "other" }), "a.b.c"]) {
      await fetch(base + "/api/items", { headers: { Authorization: `Bearer ${bad}` } });
    }
    await new Promise((r) => setTimeout(r, 20));
    const denied = logs.filter((l) => l.event === "auth_denied");
    expect(denied).toEqual([
      { event: "auth_denied", code: "claim_aud" },
      { event: "auth_denied", code: "malformed" },
    ]);
    const all = JSON.stringify(logs);
    for (const secret of [t, SUB, "me@example.com", "jti-xyz-123"])
      expect(all).not.toContain(secret);
  });
});
