// @vitest-environment node
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-03-04T05:00:00Z");
const servers: http.Server[] = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
});

type Stub = { query: (...a: unknown[]) => Promise<unknown>; connect?: () => Promise<unknown> };
const logs: Record<string, unknown>[] = [];

async function start(pool: Stub | null, drive: object | null = null) {
  const server = http.createServer(
    createApp({
      pool,
      drive: drive as never,
      distDir: "/nonexistent",
      access: null,
      log: (e) => logs.push(e),
      now: () => NOW,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function spyPool() {
  const calls: string[] = [];
  const pool: Stub = {
    query: async () => {
      calls.push("query");
      return { rows: [], rowCount: 0 };
    },
    connect: async () => {
      calls.push("connect");
      throw new Error("no");
    },
  };
  return { pool, calls };
}

const JSON_H = { "Content-Type": "application/json" };
const put = (base: string, id: string, body: unknown, headers: Record<string, string> = JSON_H) =>
  fetch(`${base}/api/items/${id}`, { method: "PUT", headers, body: JSON.stringify(body) });
const err = async (res: Response) =>
  ((await res.json()) as { error: Record<string, unknown> }).error;

function raw(base: string, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(Number(new URL(base).port), "127.0.0.1", () => sock.write(request));
    let out = "";
    sock.on("data", (d) => (out += d));
    sock.on("end", () => resolve(out));
    sock.on("error", reject);
  });
}

describe("routing", () => {
  it("unknown /api paths -> 404 not_found; wrong method -> 405 with Allow", async () => {
    const base = await start(spyPool().pool);
    expect((await fetch(base + "/api/nope")).status).toBe(404);
    const cases: [string, string, string][] = [
      ["POST", "/api/items", "GET"],
      ["DELETE", "/api/locations", "GET"],
      ["GET", `/api/items/${ID}`, "PUT, DELETE"],
      ["GET", `/api/items/${ID}/wear`, "POST"],
    ];
    for (const [method, p, allow] of cases) {
      const res = await fetch(base + p, { method });
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe(allow);
    }
  });

  it("routing uses the raw pathname: encoded or odd paths never reach the DB", async () => {
    const { pool, calls } = spyPool();
    const base = await start(pool);
    const paths = [
      "/api/items/%2e%2e",
      `/api/items/${ID}%2Fwear`,
      "/api/%69tems",
      "/api/items/",
      "/api/items//wear",
      `/api/items/${ID}/wear/`,
    ];
    for (const p of paths) {
      const res = await fetch(base + p, { method: "PUT", headers: JSON_H, body: "{}" });
      expect([400, 404]).toContain(res.status);
    }
    expect(calls).toEqual([]);
  });

  it("bad id on PUT/DELETE/POST wear -> 400 invalid_input field id reason idInvalid", async () => {
    const base = await start(spyPool().pool);
    for (const id of ["not-a-uuid", ID.replace(/-/g, "%2D")]) {
      for (const [method, suffix] of [
        ["PUT", ""],
        ["DELETE", ""],
        ["POST", "/wear"],
      ]) {
        const res = await fetch(`${base}/api/items/${id}${suffix}`, {
          method,
          headers: JSON_H,
          body: "{}",
        });
        expect(res.status).toBe(400);
        expect(await err(res)).toEqual({ code: "invalid_input", field: "id", reason: "idInvalid" });
      }
    }
  });
});

describe("CSRF and content type", () => {
  it("cross-site / same-site writes -> 403 forbidden_origin; same-origin, none, absent pass", async () => {
    const { pool } = spyPool();
    const base = await start(pool);
    for (const site of ["cross-site", "same-site"]) {
      for (const method of ["PUT", "POST", "DELETE"]) {
        const suffix = method === "POST" ? "/wear" : "";
        const res = await fetch(`${base}/api/items/${ID}${suffix}`, {
          method,
          headers: { ...JSON_H, "Sec-Fetch-Site": site },
          body: "{}",
        });
        expect(res.status).toBe(403);
        expect((await err(res)).code).toBe("forbidden_origin");
      }
    }
    for (const site of ["same-origin", "none", undefined]) {
      const res = await put(
        base,
        ID,
        { name: "" },
        site ? { ...JSON_H, "Sec-Fetch-Site": site } : JSON_H,
      );
      expect(res.status).toBe(400); // passed CSRF, failed validation
    }
  });

  it("PUT/POST with no or wrong Content-Type -> 415; charset and case variants accepted", async () => {
    const base = await start(null);
    for (const ct of [undefined, "text/plain", "application/x-www-form-urlencoded"]) {
      const res = await put(base, ID, { name: "a" }, ct ? { "Content-Type": ct } : {});
      expect(res.status).toBe(415);
    }
    for (const ct of ["application/json; charset=utf-8", "Application/JSON"]) {
      const res = await put(base, ID, { name: "a" }, { "Content-Type": ct });
      expect(res.status).toBe(503); // body accepted, no DB
    }
  });

  it("every /api response: no-store, JSON (except 204), no Access-Control-* header", async () => {
    const base = await start(null);
    const responses = [
      await fetch(base + "/api/items"),
      await fetch(base + "/api/nope"),
      await fetch(base + `/api/items/${ID}`),
      await put(base, ID, { name: "" }),
    ];
    for (const res of responses) {
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("content-type")).toContain("application/json");
      expect([...res.headers.keys()].filter((k) => k.startsWith("access-control"))).toEqual([]);
      await res.text();
    }
  });
});

describe("body handling", () => {
  it("body > 256 KB -> 413 (Content-Length and chunked); exactly 256 KB is read", async () => {
    const base = await start(null);
    const big = JSON.stringify({ name: "a", notes: "n".repeat(262144) });
    const declared = await put(base, ID, JSON.parse(big));
    expect(declared.status).toBe(413);
    expect((await err(declared)).code).toBe("payload_too_large");

    const chunked = await raw(
      base,
      `PUT /api/items/${ID} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n` +
        `${(262145).toString(16)}\r\n${"a".repeat(262145)}\r\n0\r\n\r\n`,
    );
    expect(chunked.split("\r\n")[0]).toBe("HTTP/1.1 413 Payload Too Large");

    // Several delayed writes: the 413 must still arrive as JSON even though the upload is not finished.
    const slow = await new Promise<string>((resolve) => {
      const sock = net.connect(Number(new URL(base).port), "127.0.0.1");
      let out = "";
      sock.on("data", (d) => (out += d));
      sock.on("error", () => {});
      sock.on("close", () => resolve(out));
      sock.write(
        `PUT /api/items/${ID} HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`,
      );
      let n = 0;
      const timer = setInterval(() => {
        if (sock.destroyed || ++n > 20) return clearInterval(timer);
        sock.write(`${(65536).toString(16)}\r\n${"a".repeat(65536)}\r\n`);
      }, 20);
    });
    expect(slow.split("\r\n")[0]).toBe("HTTP/1.1 413 Payload Too Large");
    expect(slow).toContain("payload_too_large");

    const pad = 262144 - JSON.stringify({ name: "a", notes: "" }).length;
    const exact = JSON.stringify({ name: "a", notes: "n".repeat(pad) });
    expect(Buffer.byteLength(exact)).toBe(262144);
    const res = await fetch(`${base}/api/items/${ID}`, {
      method: "PUT",
      headers: JSON_H,
      body: exact,
    });
    expect(res.status).toBe(400); // read fine; notes > 2000 fails validation
    expect((await err(res)).reason).toBe("tooLong");
  });

  it("malformed JSON, empty body and invalid UTF-8 -> 400 invalid_json", async () => {
    const base = await start(null);
    for (const body of ["{nope", "", Buffer.from([0x7b, 0xff, 0x7d])]) {
      const res = await fetch(`${base}/api/items/${ID}`, { method: "PUT", headers: JSON_H, body });
      expect(res.status).toBe(400);
      expect((await err(res)).code).toBe("invalid_json");
    }
  });

  it("invalid bodies -> 400 invalid_input with field and reason", async () => {
    const base = await start(null);
    const a = await put(base, ID, { name: "a", price: -5 });
    expect(await err(a)).toEqual({
      code: "invalid_input",
      field: "price",
      reason: "priceNegative",
    });
    const b = await put(base, ID, []);
    expect(await err(b)).toEqual({ code: "invalid_input", field: null, reason: "notObject" });
    const c = await fetch(`${base}/api/items/${ID}/wear`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ delta: 2, today: "2026-03-04" }),
    });
    expect(await err(c)).toEqual({ code: "invalid_input", field: "delta", reason: "invalidValue" });
  });

  it("today outside +-1 day of the injected clock -> 400 field today reason todayOutOfRange", async () => {
    const base = await start(null);
    const res = await fetch(`${base}/api/items/${ID}/wear`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ delta: 1, today: "2026-03-07" }),
    });
    expect(await err(res)).toEqual({
      code: "invalid_input",
      field: "today",
      reason: "todayOutOfRange",
    });
  });
});

describe("no DB and DB errors", () => {
  it("pool null -> 503 db_unavailable on every endpoint with valid input", async () => {
    const base = await start(null);
    const wear = JSON.stringify({ delta: 1, today: "2026-03-04" });
    const results = await Promise.all([
      fetch(base + "/api/items"),
      fetch(base + "/api/locations"),
      put(base, ID, { name: "a" }),
      fetch(`${base}/api/items/${ID}`, { method: "DELETE" }),
      fetch(`${base}/api/items/${ID}/wear`, { method: "POST", headers: JSON_H, body: wear }),
    ]);
    for (const res of results) {
      expect(res.status).toBe(503);
      expect((await err(res)).code).toBe("db_unavailable");
    }
  });

  it("photo PUT / DELETE without a pool -> 503 db_unavailable after the header checks", async () => {
    const base = await start(null, {});
    const url = `${base}/api/items/${ID}/photo`;
    const png = await fetch(url, { method: "PUT", headers: { "Content-Type": "image/png" } });
    expect(png.status).toBe(415);
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: "x",
    });
    expect(put.status).toBe(503);
    expect((await err(put)).code).toBe("db_unavailable");
    expect((await fetch(url, { method: "DELETE" })).status).toBe(503);
  });

  it("a pg-like error -> 500 {code internal, requestId}; body and logs contain none of it", async () => {
    logs.length = 0;
    const secret = Object.assign(new Error("select * from items password=hunter2"), {
      code: "XX000",
      detail: "Key (name)=(hunter2)",
      query: "select hunter2",
    });
    const base = await start({ query: async () => Promise.reject(secret) });
    const res = await fetch(base + "/api/items");
    const text = await res.text();
    expect(res.status).toBe(500);
    const body = JSON.parse(text);
    expect(body).toEqual({
      error: { code: "internal", requestId: res.headers.get("x-request-id") },
    });
    const all = text + JSON.stringify(logs);
    for (const s of ["hunter2", "select", "Key (name)"]) expect(all).not.toContain(s);
    expect(logs.find((l) => l.event === "db_error")).toMatchObject({ code: "XX000" });
  });

  it("23503 on wear -> 404; ECONNREFUSED on list -> 503; 23505 -> 409", async () => {
    const mk = (code: string) => ({
      query: async () => Promise.reject(Object.assign(new Error("x"), { code })),
    });
    const wearBody = JSON.stringify({ delta: 1, today: "2026-03-04" });
    const wear = await fetch(`${await start(mk("23503"))}/api/items/${ID}/wear`, {
      method: "POST",
      headers: JSON_H,
      body: wearBody,
    });
    expect(wear.status).toBe(404);
    expect((await fetch((await start(mk("ECONNREFUSED"))) + "/api/locations")).status).toBe(503);
    expect((await fetch((await start(mk("23505"))) + "/api/items")).status).toBe(409);
  });

  it("save: a client error after begin -> rollback is issued and the client released with the error", async () => {
    const seen: string[] = [];
    let released: unknown = "not called";
    const client = {
      query: async (sql: string) => {
        seen.push(sql);
        if (sql.startsWith("insert into items"))
          throw Object.assign(new Error("x"), { code: "23514" });
        return { rows: [{ id: ID }] };
      },
      release: (e?: unknown) => {
        released = e;
      },
    };
    const base = await start({ query: async () => ({ rows: [] }), connect: async () => client });
    const res = await put(base, ID, { name: "a", location_name: "Tủ" });
    expect(res.status).toBe(400);
    expect(seen[0]).toBe("begin");
    expect(seen).toContain("rollback");
    expect(seen).not.toContain("commit");
    expect(released).toBeInstanceOf(Error);
  });

  it("save: a pool without connect() reaches the 500 path", async () => {
    const base = await start({ query: async () => ({ rows: [] }) });
    expect((await put(base, ID, { name: "a" })).status).toBe(500);
  });

  it("log route templates: /api/items, /api/items/:id, /api/items/:id/wear, /api/locations, /api", async () => {
    logs.length = 0;
    const base = await start(null);
    await (await fetch(base + "/api/items")).text();
    await (await fetch(base + "/api/locations")).text();
    await (await fetch(`${base}/api/items/${ID}`, { method: "DELETE" })).text();
    await (await fetch(`${base}/api/items/${ID}/wear`, { method: "GET" })).text();
    await (await fetch(base + "/api/zzz")).text();
    await new Promise((r) => setTimeout(r, 20));
    const routes = logs.filter((l) => l.route).map((l) => l.route);
    expect(routes).toEqual([
      "/api/items",
      "/api/locations",
      "/api/items/:id",
      "/api/items/:id/wear",
      "/api",
    ]);
    expect(JSON.stringify(logs)).not.toContain(ID);
  });
});
