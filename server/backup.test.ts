// @vitest-environment node
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { derivedId, RESTORE_MAX_BYTES, uuidv5 } from "./backup.js";
import { fixedAuth, OWNER_A, OWNER_B } from "./test/auth.js";

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => {
      s.closeAllConnections();
      return new Promise((r) => s.close(r));
    }),
  );
});

const JSON_H = { "Content-Type": "application/json" };
const TS = "2026-03-04T05:00:00.000Z";
const empty = { version: 1, exportedAt: TS, locations: [], items: [], wearLogs: [] };

async function start(over: Partial<Parameters<typeof createApp>[0]> = {}) {
  const logs: Record<string, unknown>[] = [];
  const server = http.createServer(
    createApp({
      pool: null,
      distDir: "/nonexistent",
      auth: fixedAuth(OWNER_A),
      log: (e) => logs.push(e),
      ...over,
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  const port = (server.address() as AddressInfo).port;
  return { port, base: `http://127.0.0.1:${port}`, logs };
}

/** Opens a restore request and sends only the head plus a bit of the body. Resolves with the response head. */
function stalled(port: number) {
  const s = net.connect(port, "127.0.0.1");
  const answer = new Promise<string>((resolve) => {
    let out = "";
    s.on("data", (d) => {
      out += d;
      if (out.includes("\r\n\r\n")) resolve(out);
    });
    s.on("close", () => resolve(out));
  });
  s.write(
    'POST /api/restore HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 20\r\n\r\n{"a":',
  );
  return { socket: s, answer };
}

describe("uuidv5", () => {
  it("matches the RFC 4122 vector (www.example.com in the DNS namespace)", () => {
    expect(uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });
});

describe("derivedId", () => {
  const old = "00000000-0000-4000-8000-000000000001";
  it("is deterministic, version 5, RFC variant", () => {
    const id = derivedId(OWNER_B, old, 0);
    expect(derivedId(OWNER_B, old, 0)).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it("differs by user, by old id and by attempt", () => {
    const id = derivedId(OWNER_B, old, 0);
    expect(derivedId(OWNER_A, old, 0)).not.toBe(id);
    expect(derivedId(OWNER_B, "00000000-0000-4000-8000-000000000002", 0)).not.toBe(id);
    expect(derivedId(OWNER_B, old, 1)).not.toBe(id);
  });
});

describe("backup routes without a database", () => {
  it("GET /api/backup -> 503 db_unavailable", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/backup`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "db_unavailable" } });
  });

  it("PUT /api/backup -> 405 with Allow", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/backup`, { method: "PUT" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
  });

  it("POST /api/restore from a cross-site page -> 403 forbidden_origin", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: { ...JSON_H, "Sec-Fetch-Site": "cross-site" },
      body: JSON.stringify(empty),
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe("forbidden_origin");
  });

  it("wrong content type -> 415", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/restore`, { method: "POST", body: "x" });
    expect(res.status).toBe(415);
  });

  it("declared length over the cap -> 413 with Connection: close", async () => {
    const { port } = await start();
    const head = await new Promise<string>((resolve) => {
      const s = net.connect(port, "127.0.0.1", () => {
        s.write(
          `POST /api/restore HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${RESTORE_MAX_BYTES + 1}\r\n\r\n`,
        );
      });
      let out = "";
      s.on("data", (d) => (out += d));
      s.on("close", () => resolve(out));
    });
    expect(head.startsWith("HTTP/1.1 413")).toBe(true);
    expect(head.toLowerCase()).toContain("connection: close");
  });

  it("an invalid file -> 400 invalid_input with field and reason, before the database is needed", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ ...empty, version: 2 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "invalid_input", field: "version", reason: "versionUnsupported" },
    });
  });

  it("invalid JSON -> 400 invalid_json", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/restore`, { method: "POST", headers: JSON_H, body: "{" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("invalid_json");
  });

  it("a valid file with no pool -> 503 after validation", async () => {
    const { base } = await start();
    const res = await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify(empty),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error.code).toBe("db_unavailable");
  });

  it("a second concurrent restore by the same user -> 503 restore_busy with Retry-After", async () => {
    const { base, port } = await start({ restoreBodyTimeouts: { totalMs: 5000, idleMs: 5000 } });
    const first = stalled(port);
    await new Promise((r) => setTimeout(r, 100));
    const res = await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify(empty),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error.code).toBe("restore_busy");
    expect(res.headers.get("retry-after")).toBe("5");
    first.socket.destroy();
  });

  it("limiter exhausted -> 429 rate_limited, and the slot is released", async () => {
    const { base } = await start();
    const send = () =>
      fetch(`${base}/api/restore`, {
        method: "POST",
        headers: JSON_H,
        body: JSON.stringify({ ...empty, version: 2 }),
      });
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(400);
    const res = await send();
    expect(res.status).toBe(429);
    expect(((await res.json()) as any).error.code).toBe("rate_limited");
    // A leaked slot would answer 503 restore_busy here.
    expect((await send()).status).toBe(429);
  });

  it("a slow body with small timeouts -> 408 request_timeout and the slot is released", async () => {
    const { port, base } = await start({ restoreBodyTimeouts: { totalMs: 5000, idleMs: 60 } });
    const first = stalled(port);
    expect((await first.answer).startsWith("HTTP/1.1 408")).toBe(true);
    first.socket.destroy();
    const res = await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify(empty),
    });
    expect(res.status).toBe(503); // db_unavailable, not restore_busy
    expect(((await res.json()) as any).error.code).toBe("db_unavailable");
  });

  it("logs counts and codes only", async () => {
    const { base, logs } = await start();
    await fetch(`${base}/api/restore`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ ...empty, version: 2 }),
    });
    const entry = logs.find((l) => l.event === "restore");
    expect(entry).toMatchObject({ event: "restore", code: "invalid_input" });
    expect(Object.keys(entry ?? {}).sort()).toEqual(["code", "event", "id", "ms"]);
  });
});
