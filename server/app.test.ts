// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

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
  pool?: { query(sql: string): Promise<unknown> } | null;
  allow?: boolean | null;
}) {
  const access =
    opts.allow === null || opts.allow === undefined
      ? null
      : { verify: async () => (opts.allow ? { ok: true } : { ok: false, code: "ERR_X" }) };
  const server = http.createServer(
    createApp({ pool: opts.pool ?? null, distDir: dir, access, log: (e) => logs.push(e) }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("app", () => {
  it('/healthz -> 200 {status:"ok"} without a DB, no-store', async () => {
    const base = await start({});
    const res = await fetch(base + "/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
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
    const res = await fetch((await start({ allow: null })) + "/api/items");
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

  it("every response has nosniff, Referrer-Policy, X-Frame-Options DENY and an X-Request-Id", async () => {
    const base = await start({ allow: false });
    for (const p of ["/", "/healthz", "/readyz", "/api/x", "/assets/nope.js"]) {
      const res = await fetch(base + p);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      await res.text();
    }
  });

  it("log: one JSON line per request with method, route template, status, ms, id; never the URL, query, headers or token", async () => {
    logs.length = 0;
    const base = await start({ allow: true });
    const res = await fetch(base + "/api/items?secret=qq", {
      headers: { "Cf-Access-Jwt-Assertion": "tok-abc" },
    });
    await res.text();
    await new Promise((r) => setTimeout(r, 20));
    const entry = logs.find((l) => l.route === "/api");
    expect(entry).toMatchObject({ method: "GET", route: "/api", status: 404 });
    expect(typeof entry?.ms).toBe("number");
    expect(typeof entry?.id).toBe("string");
    const all = JSON.stringify(logs);
    expect(all).not.toContain("secret=qq");
    expect(all).not.toContain("tok-abc");
    expect(all).not.toContain("/api/items");
  });

  it("unexpected errors -> 500 `internal` with requestId only", async () => {
    const server = http.createServer(
      createApp({
        pool: null,
        distDir: dir,
        access: {
          verify: async () => {
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
