// @vitest-environment node
// Two users on one database (T-019.2): everything one user does is invisible to, and cannot change, the other's.
import { randomBytes } from "node:crypto";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { importKek } from "./ai/crypto.js";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createDriveClient } from "./drive.js";
import { runMigrations } from "./migrator.js";
import { headerAuth, OWNER_A, OWNER_B } from "./test/auth.js";
import { fakeConfig, startFakeDrive } from "./test/fake-drive.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
const JSON_H = { "Content-Type": "application/json" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
type As = "a" | "b";

describe.skipIf(!dbAvailable)("isolation between two users (real Postgres)", () => {
  let db: TestDb;
  /** The app pool: the NOSUPERUSER owner role, so RLS applies (T-019.4). */
  let appPool: ReturnType<typeof createPool>;
  /** Admin pool: fixtures, truncate and direct reads. */
  let pool: ReturnType<typeof createPool>;
  let fake: Awaited<ReturnType<typeof startFakeDrive>>;
  let server: http.Server;
  let base: string;
  let statements: string[] = [];

  const call = (as: As, p: string, init: RequestInit = {}) =>
    fetch(`${base}${p}`, { ...init, headers: { "x-test-user": as, ...init.headers } });
  const put = (as: As, id: string, body: Record<string, unknown>) =>
    call(as, `/api/items/${id}`, { method: "PUT", headers: JSON_H, body: JSON.stringify(body) });
  const wear = (as: As, id: string, delta: number) =>
    call(as, `/api/items/${id}/wear`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ delta, today: "2026-03-04" }),
    });
  const putPhoto = (as: As, id: string) =>
    call(as, `/api/items/${id}/photo`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: JPEG,
    });
  const delPhoto = (as: As, id: string, photo: string) =>
    call(as, `/api/items/${id}/photo?photo=${photo}`, { method: "DELETE" });
  const items = async (as: As) =>
    ((await (await call(as, "/api/items")).json()) as { items: any[] }).items;
  const photoRows = async () => (await pool.query("select * from item_photos")).rows as any[];

  /** A pool for the app that records every statement sent through it or through a checked-out client. */
  function recording(p: ReturnType<typeof createPool>) {
    const text = (a: unknown) =>
      typeof a === "string" ? a : ((a as { text?: string })?.text ?? "");
    return {
      query: (...args: [string, unknown[]?]) => {
        statements.push(text(args[0]));
        return p.query(...args);
      },
      connect: async () => {
        const c: any = await p.connect();
        return new Proxy(c, {
          get(target, key) {
            if (key === "query") {
              return (...args: unknown[]) => {
                statements.push(text(args[0]));
                return target.query(...args);
              };
            }
            const v = target[key];
            return typeof v === "function" ? v.bind(target) : v;
          },
        });
      },
    };
  }

  beforeAll(async () => {
    db = await createTestDb({ owner: true });
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.adminUrl);
    appPool = createPool(db.url);
    fake = await startFakeDrive();
    const drive = createDriveClient({ config: fakeConfig, ...fake.urls, sleep: async () => {} });
    server = http.createServer(
      createApp({
        pool: recording(appPool),
        drive,
        distDir: "/nonexistent",
        auth: headerAuth(),
        log: () => {},
        now: () => Date.parse("2026-03-04T05:00:00Z"),
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await fake?.close();
    await appPool?.end();
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
    fake.files.clear();
    fake.requests.length = 0;
    statements = [];
  });

  it("guard: the app pool is not a superuser and does not bypass RLS", async () => {
    const r = await appPool.query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(r.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it("lists: A and B each see only their items and locations", async () => {
    await put("a", uuid(1), { name: "của A", location_name: "Tủ A" });
    await put("b", uuid(2), { name: "của B", location_name: "Tủ B" });
    expect((await items("a")).map((i) => i.name)).toEqual(["của A"]);
    expect((await items("b")).map((i) => i.name)).toEqual(["của B"]);
    const locs = async (as: As) =>
      ((await (await call(as, "/api/locations")).json()) as { locations: string[] }).locations;
    expect(await locs("a")).toEqual(["Tủ A"]);
    expect(await locs("b")).toEqual(["Tủ B"]);
  });

  it("B PUT on A's item -> 404; A's row (incl. updated_at) and locations unchanged; no location for B", async () => {
    await put("a", uuid(1), { name: "của A", location_name: "Tủ A" });
    const before = (await pool.query("select * from items")).rows;
    const locsBefore = (await pool.query("select * from locations order by name")).rows;
    const res = await put("b", uuid(1), { name: "bị đổi", location_name: "Tủ của B" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
    expect((await pool.query("select * from items")).rows).toEqual(before);
    expect((await pool.query("select * from locations order by name")).rows).toEqual(locsBefore);
  });

  it("body user_id is ignored: an item B sends with A's user_id is owned by B", async () => {
    const res = await put("b", uuid(1), { name: "x", user_id: OWNER_A });
    expect(res.status).toBe(200);
    expect((await pool.query("select user_id from items")).rows).toEqual([{ user_id: OWNER_B }]);
  });

  it("same location name for A and B -> two rows, each item points at its owner's; NFC/NFD forms collapse for one user", async () => {
    await put("a", uuid(1), { name: "a", location_name: "Tủ 1" });
    await put("b", uuid(2), { name: "b", location_name: "Tủ 1" });
    const r = await pool.query(
      "select i.user_id as iu, l.user_id as lu from items i join locations l on l.id = i.location_id",
    );
    expect(r.rowCount).toBe(2);
    expect(r.rows.every((x) => x.iu === x.lu)).toBe(true);
    expect((await pool.query("select 1 from locations")).rowCount).toBe(2);
    const nfc = "Tủ".normalize("NFC");
    const nfd = "Tủ".normalize("NFD");
    await put("a", uuid(3), { name: "c", location_name: nfc });
    await put("a", uuid(4), { name: "d", location_name: nfd });
    expect(
      (await pool.query("select 1 from locations where user_id = $1", [OWNER_A])).rowCount,
    ).toBe(2); // "Tủ 1" and one "Tủ"
  });

  it("B DELETE on A's item -> 204 like a missing id; A's item, photos and wear logs remain; no Drive delete", async () => {
    await put("a", uuid(1), { name: "a" });
    await wear("a", uuid(1), 1);
    await putPhoto("a", uuid(1));
    fake.requests.length = 0;
    expect((await call("b", `/api/items/${uuid(1)}`, { method: "DELETE" })).status).toBe(204);
    expect((await items("a")).length).toBe(1);
    expect((await pool.query("select 1 from wear_logs")).rowCount).toBe(1);
    expect(await photoRows()).toHaveLength(1);
    expect(fake.requests.filter((r) => r.method === "DELETE")).toEqual([]);
  });

  it("B wear +1 and -1 on A's item -> 404; A's wear logs unchanged", async () => {
    await put("a", uuid(1), { name: "a" });
    await wear("a", uuid(1), 1);
    expect((await wear("b", uuid(1), 1)).status).toBe(404);
    expect((await wear("b", uuid(1), -1)).status).toBe(404);
    expect((await pool.query("select user_id from wear_logs")).rows).toEqual([
      { user_id: OWNER_A },
    ]);
  });

  it("B photo PUT on A's item -> 404, no Drive create; B photo DELETE of A's photo -> 404, row and file kept; A's stale id on own item -> 204", async () => {
    await put("a", uuid(1), { name: "a" });
    await putPhoto("a", uuid(1));
    const [row] = await photoRows();
    fake.requests.length = 0;
    expect((await putPhoto("b", uuid(1))).status).toBe(404);
    expect(fake.requests.filter((r) => r.method === "POST")).toEqual([]);
    expect((await delPhoto("b", uuid(1), row.id)).status).toBe(404);
    expect(await photoRows()).toHaveLength(1);
    expect(fake.files.size).toBe(1);
    expect((await delPhoto("a", uuid(1), uuid(77))).status).toBe(204);
    expect(await photoRows()).toHaveLength(1);
  });

  it("B GET of A's photo -> 404, also with If-None-Match (never 304); no Drive media request", async () => {
    await put("a", uuid(1), { name: "a" });
    await putPhoto("a", uuid(1));
    const [row] = await photoRows();
    fake.requests.length = 0;
    expect((await call("b", `/api/photos/${row.id}`)).status).toBe(404);
    const inm = await call("b", `/api/photos/${row.id}`, {
      headers: { "If-None-Match": `"${row.id}"` },
    });
    expect(inm.status).toBe(404);
    expect(fake.requests).toEqual([]);
    expect((await call("a", `/api/photos/${row.id}`)).status).toBe(200);
  });

  it("per-user photo cap over HTTP: A's 3rd held upload -> 503 + Retry-After; B's first is accepted", async () => {
    await put("a", uuid(1), { name: "a" });
    await put("b", uuid(2), { name: "b" });
    const sockets: net.Socket[] = [];
    const hold = (as: As, id: string) =>
      new Promise<string>((resolve) => {
        const sock = net.connect(Number(new URL(base).port), "127.0.0.1", () => {
          // Declares 1000 bytes, sends 10: the slot stays held until the socket closes.
          sock.write(
            `PUT /api/items/${id}/photo HTTP/1.1\r\nHost: x\r\nx-test-user: ${as}\r\nContent-Type: image/jpeg\r\nContent-Length: 1000\r\n\r\n`,
          );
          sock.write(Buffer.alloc(10, 1));
          setTimeout(() => resolve(""), 150);
        });
        sock.on("data", () => {});
        sockets.push(sock);
      });
    try {
      await hold("a", uuid(1));
      await hold("a", uuid(1));
      const third = await putPhoto("a", uuid(1));
      expect(third.status).toBe(503);
      expect(third.headers.get("retry-after")).toBe("5");
      expect(((await third.json()) as any).error.code).toBe("photos_unavailable");
      const b = await new Promise<string>((resolve) => {
        const sock = net.connect(Number(new URL(base).port), "127.0.0.1", () => {
          sock.write(
            `PUT /api/items/${uuid(2)}/photo HTTP/1.1\r\nHost: x\r\nx-test-user: b\r\nContent-Type: image/jpeg\r\nContent-Length: ${JPEG.length}\r\nConnection: close\r\n\r\n`,
          );
          sock.write(JPEG);
        });
        let out = "";
        sock.on("data", (d) => (out += d.toString()));
        sock.on("close", () => resolve(out));
      });
      expect(b).toMatch(/^HTTP\/1.1 200/);
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  it("every statement sent by the item and photo routes mentions user_id", async () => {
    // The recorder ran during every test above; start clean and exercise each route once.
    statements = [];
    await put("a", uuid(1), { name: "a", location_name: "Tủ" });
    await items("a");
    await call("a", "/api/locations");
    await wear("a", uuid(1), 1);
    await wear("a", uuid(1), -1);
    await putPhoto("a", uuid(1));
    const [row] = await photoRows();
    await call("a", `/api/photos/${row.id}`);
    await delPhoto("a", uuid(1), row.id);
    await call("a", `/api/items/${uuid(1)}`, { method: "DELETE" });
    const control =
      /^\s*(begin( read only)?|commit|rollback|select pg_advisory_xact_lock\(hashtextextended\('photo-quota:' \|\| \$1::text, 0\)\))\s*$/i;
    const bad = statements.filter((s) => !control.test(s) && !s.includes("user_id"));
    expect(statements.length).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });

  it("owner photo PUT succeeds while B and C hold every non-owner slot", async () => {
    await put("a", uuid(1), { name: "a" });
    const sockets: net.Socket[] = [];
    const ownerServer = http.createServer(
      createApp({
        pool: recording(appPool),
        drive: createDriveClient({ config: fakeConfig, ...fake.urls, sleep: async () => {} }),
        distDir: "/nonexistent",
        auth: headerAuth(),
        log: () => {},
        ownerSub: OWNER_A,
      }),
    );
    await new Promise<void>((r) => ownerServer.listen(0, "127.0.0.1", r));
    const oport = (ownerServer.address() as AddressInfo).port;
    try {
      const hold = (user: string, id: string) => {
        const sock = net.connect(oport, "127.0.0.1", () => {
          sock.write(
            `PUT /api/items/${id}/photo HTTP/1.1\r\nHost: x\r\nx-test-user: ${user}\r\nContent-Type: image/jpeg\r\nContent-Length: 1000\r\n\r\n`,
          );
          sock.write(Buffer.alloc(10, 1));
        });
        sock.on("data", () => {});
        sock.on("error", () => {});
        sockets.push(sock);
      };
      hold("b", uuid(2));
      hold("b", uuid(2));
      hold("c", uuid(3));
      await new Promise((r) => setTimeout(r, 150));
      const ownerPut = await fetch(`http://127.0.0.1:${oport}/api/items/${uuid(1)}/photo`, {
        method: "PUT",
        headers: { "x-test-user": "a", "Content-Type": "image/jpeg" },
        body: JPEG,
      });
      expect(ownerPut.status).toBe(200);
      const b3 = await fetch(`http://127.0.0.1:${oport}/api/items/${uuid(2)}/photo`, {
        method: "PUT",
        headers: { "x-test-user": "b", "Content-Type": "image/jpeg" },
        body: JPEG,
      });
      expect(b3.status).toBe(503);
      expect(((await b3.json()) as any).error.code).toBe("photos_unavailable");
    } finally {
      for (const s of sockets) s.destroy();
      await new Promise((r) => ownerServer.close(r));
    }
  });

  describe("ai_settings", () => {
    const KEY_A = "sk-ant-KEYOFA-0123456789abcdef";
    const fetched: { url: string; key: string }[] = [];
    let aiServer: http.Server;
    let aiBase: string;
    const aiCall = (as: As, p: string, init: RequestInit = {}) =>
      fetch(`${aiBase}${p}`, { ...init, headers: { "x-test-user": as, ...init.headers } });
    const view = async (as: As) =>
      ((await (await aiCall(as, "/api/ai-settings")).json()) as { settings: any }).settings;
    const save = (as: As, body: Record<string, unknown>) =>
      aiCall(as, "/api/ai-settings", {
        method: "PUT",
        headers: JSON_H,
        body: JSON.stringify(body),
      });
    const test = (as: As) =>
      aiCall(as, "/api/ai-settings/test", { method: "POST", headers: JSON_H, body: "{}" });
    const tag = (as: As) =>
      aiCall(as, "/api/ai/tag-photo", {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: JPEG,
      });
    const codeOf = async (r: Response) => ((await r.json()) as any).error.code;
    const base_ = { provider: "claude", model: "claude-haiku-5-5" };

    beforeAll(async () => {
      const kek = await importKek(randomBytes(32).toString("base64"));
      const fakeFetch = (async (url: string, init: RequestInit) => {
        fetched.push({ url, key: (init.headers as Record<string, string>)["x-api-key"] });
        return url.endsWith("/messages")
          ? new Response(
              JSON.stringify({
                stop_reason: "tool_use",
                content: [{ type: "tool_use", name: "tag_item", input: { name: "x" } }],
              }),
            )
          : new Response("{}");
      }) as unknown as typeof globalThis.fetch;
      aiServer = http.createServer(
        createApp({
          pool: recording(pool),
          ai: { kek, fetch: fakeFetch },
          distDir: "/nonexistent",
          auth: headerAuth(),
          log: () => {},
        }),
      );
      await new Promise<void>((r) => aiServer.listen(0, "127.0.0.1", r));
      aiBase = `http://127.0.0.1:${(aiServer.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      await new Promise((r) => aiServer?.close(r));
    });
    beforeEach(async () => {
      await pool.query("truncate ai_settings");
      fetched.length = 0;
      statements = [];
    });

    it("get, put and delete are independent per user", async () => {
      expect((await save("a", { ...base_, apiKey: KEY_A })).status).toBe(200);
      expect(await view("b")).toBeNull();
      expect((await save("b", base_)).status).toBe(200);
      expect(await view("b")).toMatchObject({ hasKey: false });
      expect(await view("a")).toMatchObject({ hasKey: true });
      expect((await aiCall("b", "/api/ai-settings/key", { method: "DELETE" })).status).toBe(200);
      expect(await view("a")).toMatchObject({ hasKey: true });
      expect((await aiCall("a", "/api/ai-settings/key", { method: "DELETE" })).status).toBe(200);
      expect(await view("a")).toMatchObject({ hasKey: false });
      expect(await view("b")).toMatchObject({ provider: "claude", hasKey: false });
    });

    it("B's /test and tag-photo never use A's key: 409 not_configured, no fetch", async () => {
      await save("a", { ...base_, apiKey: KEY_A });
      const bt = await test("b");
      expect([bt.status, await codeOf(bt)]).toEqual([409, "not_configured"]);
      const bg = await tag("b");
      expect([bg.status, await codeOf(bg)]).toEqual([409, "not_configured"]);
      expect(fetched).toEqual([]);
      expect((await test("a")).status).toBe(200);
      expect(fetched).toHaveLength(1);
      expect(fetched[0].key).toBe(KEY_A);
    });

    it("row copy: A's ciphertext in B's row -> 409 key_unreadable, no fetch", async () => {
      await save("a", { ...base_, apiKey: KEY_A });
      await save("b", base_);
      await pool.query(
        `update ai_settings b set key_ciphertext = a.key_ciphertext, key_hint = a.key_hint
         from ai_settings a where a.user_id = $1 and b.user_id = $2`,
        [OWNER_A, OWNER_B],
      );
      const bt = await test("b");
      expect([bt.status, await codeOf(bt)]).toEqual([409, "key_unreadable"]);
      const bg = await tag("b");
      expect([bg.status, await codeOf(bg)]).toEqual([409, "key_unreadable"]);
      expect(fetched).toEqual([]);
    });

    it("every statement of the AI routes mentions user_id", async () => {
      await save("a", { ...base_, apiKey: KEY_A });
      await view("a");
      await test("a");
      await tag("a");
      await aiCall("a", "/api/ai-settings/key", { method: "DELETE" });
      const control = /^\s*(begin( read only)?|commit|rollback)\s*$/i;
      const bad = statements.filter((q) => !control.test(q) && !q.includes("user_id"));
      expect(statements.length).toBeGreaterThan(4);
      expect(bad).toEqual([]);
    });
  });
});
