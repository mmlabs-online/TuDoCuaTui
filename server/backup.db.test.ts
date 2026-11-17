// @vitest-environment node
// F-602.1: export and restore against a real Postgres, as the NOSUPERUSER owner role so RLS applies.
import { randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { derivedId, RESTORE_MAX_BYTES } from "./backup.js";
import { createPool } from "./db.js";
import { runMigrations } from "./migrator.js";
import { headerAuth, OWNER_A, OWNER_B } from "./test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
const JSON_H = { "Content-Type": "application/json" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
type As = "a" | "b";
const USER = { a: OWNER_A, b: OWNER_B };

describe.skipIf(!dbAvailable)("backup and restore (real Postgres)", () => {
  let db: TestDb;
  /** The app pool: NOSUPERUSER owner role, RLS applies. */
  let appPool: ReturnType<typeof createPool>;
  /** Admin pool: fixtures, truncate and direct reads. */
  let pool: ReturnType<typeof createPool>;
  let server: http.Server;
  let base: string;

  const call = (as: As, p: string, init: RequestInit = {}) =>
    fetch(`${base}${p}`, { ...init, headers: { "x-test-user": as, ...init.headers } });
  const put = (as: As, id: string, body: Record<string, unknown>) =>
    call(as, `/api/items/${id}`, { method: "PUT", headers: JSON_H, body: JSON.stringify(body) });
  const exportAs = async (as: As): Promise<any> => (await call(as, "/api/backup")).json();
  const restore = (as: As, body: unknown) =>
    call(as, "/api/restore", {
      method: "POST",
      headers: JSON_H,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const restoreOk = async (as: As, body: unknown) => {
    const res = await restore(as, body);
    const json = (await res.json()) as any;
    expect(res.status, JSON.stringify(json)).toBe(200);
    return json.summary;
  };
  /** Everything a user owns, as raw rows (admin pool bypasses RLS). */
  async function snap(as: As) {
    const u = USER[as];
    const q = async (t: string) =>
      (await pool.query(`select * from ${t} where user_id = $1 order by id`, [u])).rows;
    return {
      locations: await q("locations"),
      items: await q("items"),
      wear_logs: await q("wear_logs"),
      item_photos: await q("item_photos"),
    };
  }
  const counts = async (as: As) => {
    const s = await snap(as);
    return [s.locations.length, s.items.length, s.wear_logs.length];
  };
  const comparable = (e: any) => ({
    ...e,
    exportedAt: undefined,
    items: e.items.map((i: any) => ({ ...i, photo_id: undefined })),
  });
  const stats = async (as: As) =>
    (
      await pool.query(
        "select name, wear_count, last_worn from items_with_stats where user_id = $1 order by name",
        [USER[as]],
      )
    ).rows;

  /** User A: 2 locations, 3 items, wear logs on several days, one photo row on item 1. */
  async function seedA() {
    await put("a", uuid(1), {
      name: "Áo dài lụa",
      category: "ao_dai",
      price: 1500000,
      purchase_date: "2026-01-02",
      location_name: "Tủ chính",
      colors: ["do", "vang"],
      seasons: ["summer"],
      tags: ["tết"],
      notes: "ghi chú",
      brand: "Việt",
    });
    await put("a", uuid(2), { name: "Quần jean", location_name: "Ngăn 1" });
    await put("a", uuid(3), { name: "Giày" });
    for (const [item, day] of [
      [1, "2026-03-01"],
      [1, "2026-03-02"],
      [1, "2026-03-03"],
      [2, "2026-03-02"],
    ] as const) {
      await pool.query("insert into wear_logs (user_id, item_id, worn_on) values ($1, $2, $3)", [
        OWNER_A,
        uuid(item),
        day,
      ]);
    }
    await pool.query(
      "insert into item_photos (user_id, item_id, storage_path) values ($1, $2, 'a/b.jpg')",
      [OWNER_A, uuid(1)],
    );
  }

  beforeAll(async () => {
    db = await createTestDb({ owner: true });
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.adminUrl);
    appPool = createPool(db.url);
  });
  afterAll(async () => {
    await appPool?.end();
    await pool?.end();
    await db?.drop();
  });
  // A fresh app per test: the restore rate limit lives in the app instance.
  beforeEach(async () => {
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
    server = http.createServer(
      createApp({
        pool: appPool,
        distDir: "/nonexistent",
        auth: headerAuth(),
        log: () => {},
        now: () => Date.parse("2026-03-04T05:00:00Z"),
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it("export: caller's rows only, exact keys, no derived or private fields, deterministic order", async () => {
    await seedA();
    await put("b", uuid(50), { name: "Của B", location_name: "Kho B" });
    const e = await exportAs("a");
    expect(e.version).toBe(1);
    expect(e.exportedAt).toBe("2026-03-04T05:00:00.000Z");
    expect(Object.keys(e)).toEqual(["version", "exportedAt", "locations", "items", "wearLogs"]);
    expect(e.locations.map((l: any) => l.name).sort()).toEqual(["Ngăn 1", "Tủ chính"]);
    expect(e.items.map((i: any) => i.name)).toEqual(["Áo dài lụa", "Quần jean", "Giày"]);
    expect(Object.keys(e.locations[0]).sort()).toEqual(
      ["created_at", "id", "name", "parent_id", "sort_order"].sort(),
    );
    expect(Object.keys(e.items[0]).sort()).toEqual(
      [
        "id",
        "name",
        "category",
        "status",
        "brand",
        "size",
        "material",
        "price",
        "purchase_date",
        "location_id",
        "colors",
        "seasons",
        "tags",
        "notes",
        "created_at",
        "updated_at",
        "photo_id",
      ].sort(),
    );
    expect(Object.keys(e.wearLogs[0]).sort()).toEqual(["id", "item_id", "worn_on"]);
    expect(e.wearLogs).toHaveLength(4);
    expect(e.items[0].price).toBe(1500000);
    expect(e.items[0].photo_id).toMatch(/^[0-9a-f-]{36}$/);
    const text = JSON.stringify(e);
    for (const bad of [
      "user_id",
      "wear_count",
      "last_worn",
      "location_name",
      "/api/photos",
      "http",
      "Của B",
    ]) {
      expect(text).not.toContain(bad);
    }
    expect(JSON.stringify(await exportAs("a"))).toBe(text);
  });

  it("AC1: export, delete items, restore, export is identical except exportedAt and photo_id", async () => {
    await seedA();
    const before = await exportAs("a");
    const statsBefore = await stats("a");
    for (const i of before.items) {
      expect((await call("a", `/api/items/${i.id}`, { method: "DELETE" })).status).toBe(204);
    }
    expect((await exportAs("a")).items).toEqual([]);
    const s = await restoreOk("a", before);
    expect(s.items).toEqual({ inserted: 3, updated: 0, unchanged: 0, remapped: 0 });
    expect(s.wearLogs).toEqual({ inserted: 4, unchanged: 0 });
    expect(s.photosMissing).toBe(1);
    const after = await exportAs("a");
    expect(comparable(after)).toEqual(comparable(before));
    expect(after.items.every((i: any) => i.photo_id === null)).toBe(true);
    expect(await stats("a")).toEqual(statsBefore);
  });

  it("AC1: full wipe including locations round-trips", async () => {
    await seedA();
    const before = await exportAs("a");
    await pool.query("delete from wear_logs; delete from items; delete from locations");
    const s = await restoreOk("a", before);
    expect(s.locations).toMatchObject({ inserted: 2, remapped: 0 });
    expect(comparable(await exportAs("a"))).toEqual(comparable(before));
  });

  it("AC2 same account: second restore leaves every row (incl. updated_at) identical", async () => {
    await seedA();
    const file = await exportAs("a");
    await pool.query("delete from items where user_id = $1", [OWNER_A]);
    await restoreOk("a", file);
    const one = await snap("a");
    await new Promise((r) => setTimeout(r, 20));
    const s2 = await restoreOk("a", file);
    expect(await snap("a")).toEqual(one);
    expect(s2.items).toMatchObject({ inserted: 0, updated: 0, unchanged: 3 });
    expect(s2.locations).toMatchObject({ inserted: 0, updated: 0, merged: 0, unchanged: 2 });
    expect(s2.wearLogs).toEqual({ inserted: 0, unchanged: 4 });
  });

  it("overwrite: file values come back, photos stay, later wear logs are kept", async () => {
    await seedA();
    const file = await exportAs("a");
    await put("a", uuid(1), { name: "Đã sửa", location_name: "Ngăn 1" });
    await pool.query("insert into wear_logs (user_id, item_id, worn_on) values ($1, $2, $3)", [
      OWNER_A,
      uuid(3),
      "2026-03-04",
    ]);
    const photosBefore = (await snap("a")).item_photos;
    const s = await restoreOk("a", file);
    expect(s.items).toMatchObject({ inserted: 0, updated: 1, unchanged: 2 });
    expect(s.photosMissing).toBe(0);
    const e = await exportAs("a");
    expect(e.items.find((i: any) => i.id === uuid(1)).name).toBe("Áo dài lụa");
    expect(e.wearLogs).toHaveLength(5);
    expect((await snap("a")).item_photos).toEqual(photosBefore);
    expect(e.items.find((i: any) => i.id === uuid(1)).photo_id).toBe(file.items[0].photo_id);
  });

  it("AC3: B restores A's file: new ids, refs remapped, A untouched, photos skipped and counted", async () => {
    await seedA();
    const file = await exportAs("a");
    const aBefore = await snap("a");
    const s = await restoreOk("b", file);
    expect(await snap("a")).toEqual(aBefore);
    expect(s.items).toEqual({ inserted: 3, updated: 0, unchanged: 0, remapped: 3 });
    expect(s.locations).toMatchObject({ inserted: 2, remapped: 2 });
    expect(s.wearLogs).toEqual({ inserted: 4, unchanged: 0 });
    expect(s.photosMissing).toBe(1);
    const bs = await snap("b");
    const aIds = new Set(aBefore.items.map((i: any) => i.id));
    expect(bs.items).toHaveLength(3);
    for (const i of bs.items) expect(aIds.has(i.id)).toBe(false);
    const bLocs = new Map(bs.locations.map((l: any) => [l.id, l.name]));
    const jean = bs.items.find((i: any) => i.name === "Quần jean");
    expect(bLocs.get(jean.location_id)).toBe("Ngăn 1");
    const bItemIds = new Set(bs.items.map((i: any) => i.id));
    expect(bs.wear_logs).toHaveLength(4);
    for (const w of bs.wear_logs) expect(bItemIds.has(w.item_id)).toBe(true);
    expect(bs.item_photos).toEqual([]);
    expect(await stats("b")).toEqual(await stats("a"));

    // AC2 cross account
    const bOnce = await snap("b");
    const again = await restoreOk("b", file);
    expect(await snap("b")).toEqual(bOnce);
    expect(again.items).toMatchObject({ inserted: 0, updated: 0, unchanged: 3, remapped: 3 });
    expect(again.locations).toMatchObject({ inserted: 0, updated: 0 });
    expect(again.wearLogs).toEqual({ inserted: 0, unchanged: 4 });
    expect(await snap("a")).toEqual(aBefore);
  });

  it("location merge by name: B's existing location is reused and not modified", async () => {
    await seedA();
    await put("b", uuid(50), { name: "Của B", location_name: "Tủ chính" });
    const bLoc = (await snap("b")).locations[0];
    const s = await restoreOk("b", await exportAs("a"));
    expect(s.locations).toMatchObject({ inserted: 1, merged: 1 });
    const bs = await snap("b");
    expect(bs.locations).toHaveLength(2);
    expect(bs.locations.find((l: any) => l.id === bLoc.id)).toEqual(bLoc);
    const ao = bs.items.find((i: any) => i.name === "Áo dài lụa");
    expect(ao.location_id).toBe(bLoc.id);
  });

  it("an owned location rename that clashes with another owned name is skipped, no error", async () => {
    await seedA();
    const file = await exportAs("a");
    const [l1, l2] = file.locations;
    await pool.query("update locations set name = 'tạm' where id = $1", [l1.id]);
    await pool.query("update locations set name = $2 where id = $1", [l2.id, l1.name]);
    await restoreOk("a", file);
    const names = (await snap("a")).locations.map((l: any) => l.name).sort();
    expect(new Set(names).size).toBe(2);
    await restoreOk("a", file);
    expect((await snap("a")).locations.map((l: any) => l.name).sort()).toEqual(
      file.locations.map((l: any) => l.name).sort(),
    );
  });

  it("parent_id is restored through the id map", async () => {
    await seedA();
    const file = await exportAs("a");
    file.locations[1].parent_id = file.locations[0].id;
    await restoreOk("b", file);
    const bs = await snap("b");
    const child = bs.locations.find((l: any) => l.name === file.locations[1].name);
    const parent = bs.locations.find((l: any) => l.name === file.locations[0].name);
    expect(child.parent_id).toBe(parent.id);
    expect(parent.id).not.toBe(file.locations[0].id);
  });

  it("a wear-log id that belongs to someone else gets a new id", async () => {
    await seedA();
    const file = await exportAs("a");
    await restoreOk("b", file);
    const aLogIds = new Set(file.wearLogs.map((w: any) => w.id));
    for (const w of (await snap("b")).wear_logs) expect(aLogIds.has(w.id)).toBe(false);
  });

  it("upper-case ids in the file restore to one of each, ids kept lower case, rerun changes nothing", async () => {
    const TS = "2026-03-04T05:00:00.000Z";
    const L = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const I = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";
    const file = {
      version: 1,
      exportedAt: TS,
      locations: [{ id: L, name: "Tủ", parent_id: null, sort_order: 0, created_at: TS }],
      items: [
        {
          id: I,
          name: "Áo",
          category: "top",
          status: "active",
          location_id: L,
          created_at: TS,
          updated_at: TS,
        },
      ],
      wearLogs: [{ id: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC", item_id: I, worn_on: "2026-03-01" }],
    };
    const s = await restoreOk("a", file);
    expect(s.items).toMatchObject({ inserted: 1, remapped: 0 });
    expect(await counts("a")).toEqual([1, 1, 1]);
    const once = await snap("a");
    expect(once.items[0].id).toBe(I.toLowerCase());
    expect(once.wear_logs[0].item_id).toBe(I.toLowerCase());
    const again = await restoreOk("a", file);
    expect(again.items).toMatchObject({ inserted: 0, updated: 0, remapped: 0 });
    expect(await snap("a")).toEqual(once);
  });

  it("a squatted derived id makes the restore use the next attempt; the rerun is idempotent", async () => {
    await seedA();
    const file = await exportAs("a");
    await pool.query("insert into items (id, user_id, name) values ($1, $2, 'squat')", [
      derivedId(OWNER_B, uuid(1), 0),
      OWNER_A,
    ]);
    const s = await restoreOk("b", file);
    expect(s.items.inserted).toBe(3);
    const bs = await snap("b");
    expect(bs.items.map((i: any) => i.id)).toContain(derivedId(OWNER_B, uuid(1), 1));
    const once = bs;
    const again = await restoreOk("b", file);
    expect(again.items).toMatchObject({ inserted: 0, updated: 0 });
    expect(await snap("b")).toEqual(once);
  });

  it("AC4: every derived id squatted -> 409 restore_conflict and nothing is written", async () => {
    await seedA();
    const file = await exportAs("a");
    for (let a = 0; a < 5; a++) {
      await pool.query("insert into items (id, user_id, name) values ($1, $2, 'squat')", [
        derivedId(OWNER_B, uuid(3), a),
        OWNER_A,
      ]);
    }
    const res = await restore("b", file);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error.code).toBe("restore_conflict");
    expect(await counts("b")).toEqual([0, 0, 0]);
  });

  it("AC4: an invalid file -> 400 with field and reason, zero rows written", async () => {
    await seedA();
    const file = await exportAs("a");
    file.wearLogs[file.wearLogs.length - 1].item_id = uuid(999);
    const res = await restore("b", file);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "invalid_input", field: "wearLogs[3].item_id", reason: "danglingRef" },
    });
    expect(await counts("b")).toEqual([0, 0, 0]);
  });

  it("AC4: a body over the cap -> 413, zero rows written", async () => {
    const res = await restore("b", "x".repeat(RESTORE_MAX_BYTES + 1));
    expect(res.status).toBe(413);
    expect(await counts("b")).toEqual([0, 0, 0]);
  });

  it("near the caps: 3000 items and 50000 wear logs restore in time without a statement timeout", async () => {
    const day = (n: number) => new Date(Date.UTC(2000, 0, 1 + n)).toISOString().slice(0, 10);
    const ts = "2026-03-04T05:00:00.000Z";
    const items = Array.from({ length: 3000 }, (_, i) => ({
      id: randomUUID(),
      name: `Món ${i}`,
      category: "top",
      status: "active",
      colors: ["den"],
      created_at: ts,
      updated_at: ts,
    }));
    const wearLogs = Array.from({ length: 50000 }, (_, i) => ({
      id: randomUUID(),
      item_id: items[i % 3000].id,
      worn_on: day(Math.floor(i / 3000)),
    }));
    const file = { version: 1, exportedAt: ts, locations: [], items, wearLogs };
    expect(Buffer.byteLength(JSON.stringify(file))).toBeLessThan(RESTORE_MAX_BYTES);
    const started = Date.now();
    const s = await restoreOk("a", file);
    expect(Date.now() - started).toBeLessThan(30_000);
    expect(s.items.inserted).toBe(3000);
    expect(s.wearLogs.inserted).toBe(50000);
    expect(await counts("a")).toEqual([0, 3000, 50000]);
  }, 60_000);
});
