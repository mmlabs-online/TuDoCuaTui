// @vitest-environment node
// Per-user photo quotas (T-019.14) over HTTP on real Postgres (RLS app pool) with a fake Drive.
import http from "node:http";
import net from "node:net";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createDriveClient } from "./drive.js";
import { runMigrations } from "./migrator.js";
import { headerAuth, OWNER_A } from "./test/auth.js";
import { fakeConfig, startFakeDrive } from "./test/fake-drive.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
const JSON_H = { "Content-Type": "application/json" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const WINDOW = 24 * 60 * 60 * 1000;
type As = "a" | "b";

describe.skipIf(!dbAvailable)("photo quotas (real Postgres)", () => {
  let db: TestDb;
  let appPool: ReturnType<typeof createPool>;
  let pool: ReturnType<typeof createPool>;
  let fake: Awaited<ReturnType<typeof startFakeDrive>>;
  let drive: ReturnType<typeof createDriveClient>;
  let servers: http.Server[] = [];
  let statements: string[] = [];

  /** Starts an app with the given limits and returns its base URL. */
  async function start(
    photoLimits: { storedMax: number; dailyMax: number; windowMs: number },
    extra: { ownerSub?: string; drive?: unknown; record?: boolean } = {},
  ) {
    const pl: any = extra.record ? recording(appPool) : appPool;
    const server = http.createServer(
      createApp({
        pool: pl,
        drive: (extra.drive ?? drive) as any,
        distDir: "/nonexistent",
        auth: headerAuth(),
        log: () => {},
        photoLimits,
        ownerSub: extra.ownerSub ?? null,
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    servers.push(server);
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
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
  const mkItem = (base: string, as: As, n: number) =>
    fetch(`${base}/api/items/${uuid(n)}`, {
      method: "PUT",
      headers: { ...JSON_H, "x-test-user": as },
      body: JSON.stringify({ name: `item ${n}` }),
    });
  const putPhoto = (base: string, as: As, n: number) =>
    fetch(`${base}/api/items/${uuid(n)}/photo`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", "x-test-user": as },
      body: JPEG,
    });
  const code = async (r: Response) => ((await r.json()) as any).error?.code;
  const rows = async (as?: As) =>
    (
      await pool.query(
        "select * from item_photos" + (as ? " where user_id = $1" : ""),
        as ? [as === "a" ? OWNER_A : "22222222-2222-4222-8222-222222222222"] : [],
      )
    ).rows as any[];
  const creates = () =>
    fake.requests.filter((r) => r.method === "POST" && r.url.includes("/upload/"));
  const deletes = () => fake.requests.filter((r) => r.method === "DELETE");

  beforeAll(async () => {
    db = await createTestDb({ owner: true });
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.adminUrl);
    appPool = createPool(db.url);
    fake = await startFakeDrive();
    drive = createDriveClient({ config: fakeConfig, ...fake.urls, sleep: async () => {} });
  });
  afterAll(async () => {
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
  afterEach(async () => {
    for (const s of servers) {
      s.closeAllConnections();
      await new Promise((r) => s.close(r));
    }
    servers = [];
  });

  it("at the stored cap a PUT to another item -> 409 photo_quota_exceeded, no Drive POST, no new row", async () => {
    const base = await start({ storedMax: 2, dailyMax: 100, windowMs: WINDOW });
    for (const n of [1, 2, 3]) await mkItem(base, "a", n);
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    expect((await putPhoto(base, "a", 2)).status).toBe(200);
    fake.requests.length = 0;
    const r = await putPhoto(base, "a", 3);
    expect([r.status, await code(r)]).toEqual([409, "photo_quota_exceeded"]);
    expect(creates()).toEqual([]);
    expect(await rows("a")).toHaveLength(2);
  });

  it("at the stored cap a replace on an item that has a photo -> 200, count unchanged, old Drive file deleted", async () => {
    const base = await start({ storedMax: 1, dailyMax: 100, windowMs: WINDOW });
    await mkItem(base, "a", 1);
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    const [before] = await rows("a");
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    const after = await rows("a");
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(before.id);
    expect(fake.files.size).toBe(1);
    expect(deletes()).toHaveLength(1);
  });

  it("two parallel PUTs to different items at cap-1 -> exactly one 200 and one 409; rows = cap; loser's file deleted", async () => {
    let pending = 0;
    let gate = false;
    let release: () => void = () => {};
    const barrier = new Promise<void>((r) => (release = r));
    const gated = {
      ...drive,
      createFile: async (a: Parameters<typeof drive.createFile>[0]) => {
        if (gate) {
          if (++pending === 2) release();
          await barrier;
        }
        return drive.createFile(a);
      },
    };
    const base = await start({ storedMax: 2, dailyMax: 100, windowMs: WINDOW }, { drive: gated });
    for (const n of [1, 2, 3]) await mkItem(base, "a", n);
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    fake.requests.length = 0;
    gate = true;
    const [x, y] = await Promise.all([putPhoto(base, "a", 2), putPhoto(base, "a", 3)]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const loser = x.status === 409 ? x : y;
    expect(await code(loser)).toBe("photo_quota_exceeded");
    expect(await rows("a")).toHaveLength(2);
    expect(creates()).toHaveLength(2);
    expect(deletes()).toHaveLength(1);
    const kept = new Set((await rows("a")).map((r) => r.drive_file_id));
    expect([...fake.files.keys()].every((id) => kept.has(id))).toBe(true);
    expect(fake.files.size).toBe(2);
  });

  it("statements in the putPhoto transaction: items for update -> advisory lock -> quota count -> delete -> insert", async () => {
    const base = await start({ storedMax: 5, dailyMax: 100, windowMs: WINDOW }, { record: true });
    await mkItem(base, "a", 1);
    statements = [];
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    const at = (re: RegExp, from = 0) => {
      const i = statements.findIndex((s, k) => k >= from && re.test(s));
      expect(i).toBeGreaterThanOrEqual(from);
      return i;
    };
    const lock = at(/from items where id = \$1 and user_id = \$2 for update/);
    const adv = at(/pg_advisory_xact_lock/, lock);
    const count = at(/count\(\*\)::int from item_photos/, adv);
    const del = at(/^delete from item_photos/, count);
    at(/^insert into item_photos/, del);
  });

  it("over the daily count: a headers-only PUT gets 429 rate_limited with Retry-After and Connection: close; no Drive request", async () => {
    const base = await start({ storedMax: 100, dailyMax: 1, windowMs: WINDOW });
    await mkItem(base, "a", 1);
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    fake.requests.length = 0;
    const out = await new Promise<string>((resolve) => {
      const sock = net.connect(Number(new URL(base).port), "127.0.0.1", () => {
        sock.write(
          `PUT /api/items/${uuid(1)}/photo HTTP/1.1\r\nHost: x\r\nx-test-user: a\r\nContent-Type: image/jpeg\r\nContent-Length: 1000\r\n\r\n`,
        );
      });
      let o = "";
      sock.on("data", (d) => (o += d.toString()));
      sock.on("close", () => resolve(o));
    });
    expect(out).toMatch(/^HTTP\/1.1 429/);
    expect(out).toMatch(/retry-after: \d+/i);
    expect(out).toMatch(/connection: close/i);
    expect(out).toContain("rate_limited");
    expect(fake.requests).toEqual([]);
  });

  it("a refused upload is refunded: dailyMax 1, at the stored cap -> 409; delete a photo; next PUT -> 200 (not 429)", async () => {
    const base = await start({ storedMax: 1, dailyMax: 1, windowMs: WINDOW });
    await mkItem(base, "a", 1);
    await mkItem(base, "a", 2);
    // Fill the cap with an admin-inserted photo so the one daily reservation is still unused.
    await pool.query(
      "insert into item_photos (user_id, item_id, drive_file_id, is_primary) values ($1, $2, 'seedfile0123456789', true)",
      [OWNER_A, uuid(1)],
    );
    const refused = await putPhoto(base, "a", 2);
    expect([refused.status, await code(refused)]).toEqual([409, "photo_quota_exceeded"]);
    await pool.query("delete from item_photos");
    expect((await putPhoto(base, "a", 2)).status).toBe(200);
    expect((await putPhoto(base, "a", 2)).status).toBe(429);
  });

  it("A at the stored cap and over the daily count; B's PUT on its own item -> 200", async () => {
    const base = await start({ storedMax: 1, dailyMax: 1, windowMs: WINDOW });
    await mkItem(base, "a", 1);
    await mkItem(base, "a", 2);
    await mkItem(base, "b", 3);
    expect((await putPhoto(base, "a", 1)).status).toBe(200);
    expect((await putPhoto(base, "a", 2)).status).toBe(429);
    expect((await putPhoto(base, "b", 3)).status).toBe(200);
    expect(await rows("a")).toHaveLength(1);
    expect(await rows("b")).toHaveLength(1);
  });

  it("owner app (storedMax 1, dailyMax 1): A uploads to 3 items -> all 200; B first 200, second item 409", async () => {
    const base = await start(
      { storedMax: 1, dailyMax: 1, windowMs: WINDOW },
      { ownerSub: OWNER_A },
    );
    for (const n of [1, 2, 3]) await mkItem(base, "a", n);
    for (const n of [1, 2, 3]) expect((await putPhoto(base, "a", n)).status).toBe(200);
    await mkItem(base, "b", 4);
    await mkItem(base, "b", 5);
    expect((await putPhoto(base, "b", 4)).status).toBe(200);
    // The daily count is checked first, so a non-owner's second upload is 429 here ...
    expect((await putPhoto(base, "b", 5)).status).toBe(429);
    // ... and on an app with a fresh daily budget the stored cap gives 409.
    const base2 = await start(
      { storedMax: 1, dailyMax: 100, windowMs: WINDOW },
      { ownerSub: OWNER_A },
    );
    const r = await putPhoto(base2, "b", 5);
    expect([r.status, await code(r)]).toEqual([409, "photo_quota_exceeded"]);
  });
});
