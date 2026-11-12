// @vitest-environment node
import http from "node:http";
import net from "node:net";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createDriveClient, DriveError } from "./drive.js";
import { saveItem } from "./items.js";
import { runMigrations } from "./migrator.js";
import { fakeConfig, startFakeDrive } from "./test/fake-drive.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";
import { CATEGORIES, DEPRECATED_CATEGORIES, SEASONS, STATUSES } from "./validate.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
type Res = Omit<Response, "json"> & { json(): Promise<any> };
const JSON_H = { "Content-Type": "application/json" };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe.skipIf(!dbAvailable)("/api with real Postgres", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let server: http.Server;
  let base: string;
  let now = Date.parse("2026-03-04T05:00:00Z");

  const put = (id: string, body: unknown): Promise<Res> =>
    fetch(`${base}/api/items/${id}`, {
      method: "PUT",
      headers: JSON_H,
      body: JSON.stringify(body),
    });
  const wear = (id: string, delta: number, today = "2026-03-04"): Promise<Res> =>
    fetch(`${base}/api/items/${id}/wear`, {
      method: "POST",
      headers: JSON_H,
      body: JSON.stringify({ delta, today }),
    });
  const list = async () =>
    ((await (await fetch(`${base}/api/items`)).json()) as { items: any[] }).items;

  beforeAll(async () => {
    db = await createTestDb();
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.url);
    server = http.createServer(
      createApp({ pool, distDir: "/nonexistent", access: null, log: () => {}, now: () => now }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
    now = Date.parse("2026-03-04T05:00:00Z");
  });

  it("empty DB -> items [] and locations []", async () => {
    expect(await (await fetch(`${base}/api/items`)).json()).toEqual({ items: [] });
    expect(await (await fetch(`${base}/api/locations`)).json()).toEqual({ locations: [] });
  });

  it("GET /api/items -> newest first, ItemRow shape, primary_photo_path null even with a photo row", async () => {
    await put(uuid(1), { name: "older", price: 150000, purchase_date: "2026-01-02" });
    await new Promise((r) => setTimeout(r, 15));
    await put(uuid(2), { name: "newer" });
    await pool.query("insert into item_photos (item_id, storage_path) values ($1, 'a/b.jpg')", [
      uuid(1),
    ]);
    await wear(uuid(1), 1);
    const items = await list();
    expect(items.map((i: { name: string }) => i.name)).toEqual(["newer", "older"]);
    const older = items[1];
    expect(older).toMatchObject({
      id: uuid(1),
      price: 150000,
      purchase_date: "2026-01-02",
      last_worn: "2026-03-04",
      wear_count: 1,
      location_name: null,
      primary_photo_path: null,
      primary_photo_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(items[0].primary_photo_id).toBeNull();
    expect(items[0].price).toBeNull();
    expect(items[0].purchase_date).toBeNull();
    expect(new Date(older.created_at).toISOString()).toBe(older.created_at);
    expect(new Date(older.updated_at).toISOString()).toBe(older.updated_at);
  });

  it("GET /api/locations -> names ordered by sort_order, name", async () => {
    await pool.query(
      "insert into locations (name, sort_order) values ('b', 0), ('a', 0), ('z', -1), ('c', 5)",
    );
    expect(await (await fetch(`${base}/api/locations`)).json()).toEqual({
      locations: ["z", "a", "b", "c"],
    });
  });

  it("PUT creates with the client UUID, then updates; created_at unchanged, updated_at bumped", async () => {
    const a = await put(uuid(1), { name: "one" });
    expect(a.status).toBe(200);
    const first = (await a.json()).item;
    expect(first).toMatchObject({ id: uuid(1), name: "one", category: "other", status: "active" });
    await new Promise((r) => setTimeout(r, 15));
    const second = (await (await put(uuid(1), { name: "two", status: "stored" })).json()).item;
    expect(second).toMatchObject({ id: uuid(1), name: "two", status: "stored" });
    expect(second.created_at).toBe(first.created_at);
    expect(second.updated_at > first.updated_at).toBe(true);
  });

  it("PUT twice with the same body is idempotent (one row)", async () => {
    const body = { name: "same", location_name: "Tủ" };
    expect((await put(uuid(1), body)).status).toBe(200);
    expect((await put(uuid(1), body)).status).toBe(200);
    expect(await list()).toHaveLength(1);
    expect((await pool.query("select count(*)::int as n from locations")).rows[0].n).toBe(1);
  });

  it("full round-trip of every field", async () => {
    const body = {
      name: "Áo dài 😀",
      category: "dress",
      status: "lent",
      brand: "Thái Tuấn",
      size: "M",
      material: "lụa",
      price: 1250000,
      purchase_date: "2025-12-31",
      location_name: "Tủ phòng ngủ",
      colors: ["đỏ", "vàng"],
      seasons: ["spring", "winter"],
      tags: ["tết", "😀"],
      notes: "Giặt khô",
    };
    const item = (await (await put(uuid(1), body)).json()).item;
    const { location_name, ...rest } = body;
    expect(item).toMatchObject({ ...rest, location_name, wear_count: 0, last_worn: null });
    expect(item.location_id).toBeTruthy();
    const empty = (
      await (await put(uuid(2), { name: "x", price: null, purchase_date: null })).json()
    ).item;
    expect(empty).toMatchObject({
      price: null,
      purchase_date: null,
      colors: [],
      seasons: [],
      tags: [],
    });
  });

  it("location NFC race: 8 concurrent PUTs with NFC/NFD forms -> one location row", async () => {
    const nfc = "Tủ phòng ngủ";
    const forms = [nfc, nfc.normalize("NFD"), `  ${nfc}  `, `${nfc.normalize("NFD")} `];
    const res = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        put(uuid(i + 1), { name: `i${i}`, location_name: forms[i % 4] }),
      ),
    );
    expect(res.map((r) => r.status)).toEqual(Array(8).fill(200));
    const locs = await pool.query("select name from locations");
    expect(locs.rows).toEqual([{ name: nfc }]);
    expect(new Set((await list()).map((i: { location_id: string }) => i.location_id)).size).toBe(1);
  });

  it("location_name null or '' -> location_id null; an existing location is reused", async () => {
    const a = (await (await put(uuid(1), { name: "a", location_name: "" })).json()).item;
    expect(a.location_id).toBeNull();
    const b = (await (await put(uuid(2), { name: "b", location_name: "Hộp" })).json()).item;
    const c = (await (await put(uuid(3), { name: "c", location_name: "Hộp" })).json()).item;
    expect(c.location_id).toBe(b.location_id);
    const d = (await (await put(uuid(2), { name: "b", location_name: null })).json()).item;
    expect(d.location_id).toBeNull();
  });

  it("a failing item insert rolls back a newly created location", async () => {
    const values = {
      name: "x",
      category: "not-a-category",
      status: "active",
      brand: null,
      size: null,
      material: null,
      price: null,
      purchase_date: null,
      location_name: "Mới",
      colors: [],
      seasons: [],
      tags: [],
      notes: null,
    };
    await expect(saveItem(pool, uuid(1), values)).rejects.toMatchObject({ code: "22P02" });
    expect((await pool.query("select count(*)::int as n from locations")).rows[0].n).toBe(0);
  });

  it("DELETE -> 204, item and wear logs gone; again and for a never-existing id -> 204", async () => {
    await put(uuid(1), { name: "a" });
    await wear(uuid(1), 1);
    const del = () => fetch(`${base}/api/items/${uuid(1)}`, { method: "DELETE" });
    expect((await del()).status).toBe(204);
    expect((await del()).status).toBe(204);
    expect((await fetch(`${base}/api/items/${uuid(9)}`, { method: "DELETE" })).status).toBe(204);
    expect(await list()).toEqual([]);
    expect((await pool.query("select count(*)::int as n from wear_logs")).rows[0].n).toBe(0);
  });

  it("wear +1 -> count 1, last_worn today, already false; +1 again -> already true, count 1", async () => {
    await put(uuid(1), { name: "a" });
    expect(await (await wear(uuid(1), 1)).json()).toEqual({
      wear_count: 1,
      last_worn: "2026-03-04",
      already: false,
    });
    expect(await (await wear(uuid(1), 1)).json()).toEqual({
      wear_count: 1,
      last_worn: "2026-03-04",
      already: true,
    });
  });

  it("wear -1 removes the latest day; to zero -> last_worn null; at zero -> unchanged", async () => {
    await put(uuid(1), { name: "a" });
    await wear(uuid(1), 1, "2026-03-03");
    await wear(uuid(1), 1, "2026-03-04");
    expect(await (await wear(uuid(1), -1)).json()).toEqual({
      wear_count: 1,
      last_worn: "2026-03-03",
      already: false,
    });
    expect(await (await wear(uuid(1), -1)).json()).toEqual({
      wear_count: 0,
      last_worn: null,
      already: false,
    });
    const again = await wear(uuid(1), -1);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ wear_count: 0, last_worn: null, already: false });
  });

  it("wear on an unknown id: +1 -> 404 (FK), -1 -> 404", async () => {
    for (const delta of [1, -1]) {
      const res = await wear(uuid(9), delta);
      expect(res.status).toBe(404);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_found");
    }
  });

  it("server enum constants match pg_enum (item_category as a set)", async () => {
    const q = async (t: string) =>
      (
        await pool.query(
          "select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = $1 order by e.enumsortorder",
          [t],
        )
      ).rows.map((r) => r.enumlabel);
    const cats = await q("item_category");
    expect([...cats].sort()).toEqual([...CATEGORIES, ...DEPRECATED_CATEGORIES].sort());
    for (const c of CATEGORIES) expect(cats).toContain(c);
    expect(await q("item_status")).toEqual(STATUSES);
  });

  it("PUT each of the 10 categories round-trips", async () => {
    for (const [i, category] of CATEGORIES.entries()) {
      const res = await put(uuid(i + 1), { name: "a", category });
      expect(res.status).toBe(200);
      expect((await list()).find((x) => x.id === uuid(i + 1))?.category).toBe(category);
    }
  });

  it("PUT with category bag -> 400 invalid_input, field category, reason invalidValue", async () => {
    const res = await put(uuid(1), { name: "a", category: "bag" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toMatchObject({
      code: "invalid_input",
      field: "category",
      reason: "invalidValue",
    });
  });

  it("every SEASONS value passes the items.seasons check", async () => {
    for (const s of SEASONS) {
      const res = await put(uuid(1), { name: "a", seasons: [s] });
      expect(res.status).toBe(200);
    }
  });
});

describe.skipIf(!dbAvailable)("/api photos with real Postgres and a fake Drive", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let fake: Awaited<ReturnType<typeof startFakeDrive>>;
  let server: http.Server;
  let noDriveServer: http.Server;
  let base: string;
  let noDriveBase: string;
  let logs: Record<string, unknown>[] = [];
  let beforeCreate: (() => Promise<void>) | null = null;
  let beforeMedia: (() => Promise<void>) | null = null;

  const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("fake-jpeg-bytes"),
  ]);
  const putPhoto = (
    id: string,
    body: Buffer = JPEG,
    headers: Record<string, string> = {},
  ): Promise<Res> =>
    fetch(`${base}/api/items/${id}/photo`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", ...headers },
      body,
    });
  const delPhoto = (id: string, b = base, photo?: string) =>
    fetch(`${b}/api/items/${id}/photo${photo ? `?photo=${photo}` : ""}`, { method: "DELETE" });
  const primaryId = async () => (await rows())[0]?.id as string;
  const mkItem = (id: string) =>
    fetch(`${base}/api/items/${id}`, {
      method: "PUT",
      headers: JSON_H,
      body: JSON.stringify({ name: "a" }),
    });
  const rows = async () =>
    (await pool.query("select * from item_photos order by created_at")).rows as any[];
  const listen = async (srv: http.Server) => {
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  };
  /** Sends raw bytes so Content-Length and the body can disagree. */
  const raw = (head: string, body: Buffer, end = true) =>
    new Promise<string>((resolve) => {
      const sock = net.connect(Number(new URL(base).port), "127.0.0.1", () => {
        sock.write(head + "\r\n\r\n");
        sock.write(body);
        if (end) sock.end();
      });
      let out = "";
      sock.on("data", (d) => (out += d.toString()));
      sock.on("close", () => resolve(out));
    });

  beforeAll(async () => {
    db = await createTestDb();
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.url);
    fake = await startFakeDrive();
    const real = createDriveClient({
      config: fakeConfig,
      ...fake.urls,
      sleep: async () => {},
      timeouts: { upload: 300, headers: 300 },
    });
    const drive = {
      ...real,
      getMedia: async (...a: Parameters<typeof real.getMedia>) => {
        await beforeMedia?.();
        return real.getMedia(...a);
      },
      createFile: async (f: Parameters<typeof real.createFile>[0]) => {
        await beforeCreate?.();
        return real.createFile(f);
      },
    };
    const log = (e: Record<string, unknown>) => logs.push(e);
    server = http.createServer(
      createApp({ pool, drive, distDir: "/nonexistent", access: null, log }),
    );
    noDriveServer = http.createServer(
      createApp({ pool, distDir: "/nonexistent", access: null, log }),
    );
    base = await listen(server);
    noDriveBase = await listen(noDriveServer);
  });
  afterAll(async () => {
    await new Promise((r) => server?.close(r));
    await new Promise((r) => noDriveServer?.close(r));
    await fake?.close();
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await pool.query("drop trigger if exists fail_photo_insert on item_photos");
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
    fake.files.clear();
    fake.requests.length = 0;
    fake.hang.clear();
    fake.fail.clear();
    logs = [];
    beforeCreate = null;
    beforeMedia = null;
  });

  it("PUT photo creates one Drive file and one row", async () => {
    await mkItem(uuid(1));
    const res = await putPhoto(uuid(1));
    expect(res.status).toBe(200);
    const { item } = await res.json();
    const [row] = await rows();
    expect(fake.files.size).toBe(1);
    const [[driveId, file]] = [...fake.files];
    expect(file.bytes.equals(JPEG)).toBe(true);
    expect(file.meta).toMatchObject({
      name: `${row.id}.jpg`,
      mimeType: "image/jpeg",
      appProperties: { app: "tudo", photoId: row.id, itemId: uuid(1) },
    });
    expect(row).toMatchObject({ drive_file_id: driveId, is_primary: true, storage_path: null });
    expect(item.primary_photo_id).toBe(row.id);
    expect(item.primary_photo_path).toBeNull();
    expect(JSON.stringify(item)).not.toContain(driveId);
  });

  it("PUT photo for a missing item -> 404, no Drive request, no row", async () => {
    const res = await putPhoto(uuid(9));
    expect(res.status).toBe(404);
    expect(fake.requests).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it("Drive 500 on create -> 502 photo_upload_failed, no row", async () => {
    await mkItem(uuid(1));
    fake.fail.add("upload");
    const res = await putPhoto(uuid(1));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("photo_upload_failed");
    expect(await rows()).toEqual([]);
    expect(logs).toContainEqual({ event: "photo_upload_failed", code: "drive_unavailable" });
  });

  it("Drive timeout on create -> 502, no row", async () => {
    await mkItem(uuid(1));
    fake.hang.add("upload");
    expect((await putPhoto(uuid(1))).status).toBe(502);
    expect(await rows()).toEqual([]);
  });

  it("Drive stores then times out -> 502, no row, the tagged file remains", async () => {
    await mkItem(uuid(1));
    fake.hang.add("upload-after-store");
    expect((await putPhoto(uuid(1))).status).toBe(502);
    expect(await rows()).toEqual([]);
    expect(fake.files.size).toBe(1);
    expect([...fake.files.values()][0].meta.appProperties).toMatchObject({ app: "tudo" });
  });

  it("Drive auth failure -> 503 photos_unavailable, no row", async () => {
    await mkItem(uuid(1));
    beforeCreate = async () => {
      throw new DriveError("drive_auth", 401);
    };
    const res = await putPhoto(uuid(1));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("photos_unavailable");
    expect(await rows()).toEqual([]);
  });

  const failInsert = () =>
    pool.query(`create or replace function fail_photo_insert() returns trigger language plpgsql as
      $$ begin raise exception 'boom'; end $$;
      create trigger fail_photo_insert before insert on item_photos
      for each row execute function fail_photo_insert()`);

  it("DB insert fails after Drive success -> 500, Drive file deleted", async () => {
    await mkItem(uuid(1));
    await failInsert();
    const res = await putPhoto(uuid(1));
    expect(res.status).toBe(500);
    expect(fake.files.size).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it("DB fails and Drive delete fails -> 500, logs photo_orphan", async () => {
    await mkItem(uuid(1));
    await failInsert();
    fake.fail.add("delete");
    expect((await putPhoto(uuid(1))).status).toBe(500);
    expect(fake.files.size).toBe(1);
    expect(logs).toContainEqual({
      event: "photo_orphan",
      photoId: expect.any(String),
      code: "drive_unavailable",
    });
  });

  it("item deleted between pre-check and lock -> 404, Drive file deleted", async () => {
    await mkItem(uuid(1));
    beforeCreate = async () => {
      await pool.query("delete from items");
    };
    expect((await putPhoto(uuid(1))).status).toBe(404);
    expect(fake.files.size).toBe(0);
    expect(await rows()).toEqual([]);
  });

  it("second PUT replaces: one row, one file, old file gone", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const [firstId] = [...fake.files.keys()];
    const second = Buffer.concat([JPEG, Buffer.from("2")]);
    expect((await putPhoto(uuid(1), second)).status).toBe(200);
    expect(fake.files.has(firstId)).toBe(false);
    expect(fake.files.size).toBe(1);
    expect([...fake.files.values()][0].bytes.equals(second)).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it("replace with a failing old-file delete -> 200, new row, logs photo_orphan", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    fake.fail.add("delete");
    expect((await putPhoto(uuid(1))).status).toBe(200);
    expect(await rows()).toHaveLength(1);
    expect(fake.files.size).toBe(2);
    expect(logs.filter((l) => l.event === "photo_orphan")).toHaveLength(1);
  });

  it("concurrent PUTs -> both 200, exactly one row and one file", async () => {
    await mkItem(uuid(1));
    const res = await Promise.all([putPhoto(uuid(1)), putPhoto(uuid(1))]);
    expect(res.map((r) => r.status)).toEqual([200, 200]);
    expect(await rows()).toHaveLength(1);
    expect(fake.files.size).toBe(1);
  });

  it("DELETE photo removes row and file; second DELETE 204; missing item 204", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const pid = await primaryId();
    expect((await delPhoto(uuid(1), base, pid)).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect(fake.files.size).toBe(0);
    expect((await delPhoto(uuid(1), base, pid)).status).toBe(204);
    expect((await delPhoto(uuid(9), base, pid)).status).toBe(204);
    const items = ((await (await fetch(`${base}/api/items`)).json()) as { items: any[] }).items;
    expect(items[0].primary_photo_id).toBeNull();
  });

  it("DELETE photo needs a single uuid ?photo= -> 400 invalid_input field photo", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const pid = await primaryId();
    const url = `${base}/api/items/${uuid(1)}/photo`;
    for (const q of ["", "?photo=", "?photo=nope", `?photo=${pid}&photo=${pid}`, `?x=${pid}`]) {
      const res = await fetch(url + q, { method: "DELETE" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).error).toMatchObject({
        code: "invalid_input",
        field: "photo",
      });
    }
    expect(await rows()).toHaveLength(1);
    expect(fake.files.size).toBe(1);
  });

  it("stale two-tab DELETE: tab A removes an id that tab B already replaced -> 204, newer photo kept", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const seenByA = await primaryId();
    const second = Buffer.concat([JPEG, Buffer.from("2")]);
    expect((await putPhoto(uuid(1), second)).status).toBe(200);
    const newer = await primaryId();
    expect(newer).not.toBe(seenByA);
    expect((await delPhoto(uuid(1), base, seenByA)).status).toBe(204);
    expect((await rows()).map((r) => r.id)).toEqual([newer]);
    expect(fake.files.size).toBe(1);
    expect([...fake.files.values()][0].bytes.equals(second)).toBe(true);
    const items = ((await (await fetch(`${base}/api/items`)).json()) as { items: any[] }).items;
    expect(items[0].primary_photo_id).toBe(newer);
  });

  it("DELETE item removes its Drive files; a failing Drive delete still 204; legacy rows skipped", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    await pool.query(
      "insert into item_photos (item_id, storage_path) values ($1, 'legacy/a.jpg')",
      [uuid(1)],
    );
    const del = (id: string) => fetch(`${base}/api/items/${id}`, { method: "DELETE" });
    expect((await del(uuid(1))).status).toBe(204);
    expect(fake.files.size).toBe(0);
    expect(await rows()).toEqual([]);

    await mkItem(uuid(2));
    await putPhoto(uuid(2));
    fake.fail.add("delete");
    expect((await del(uuid(2))).status).toBe(204);
    expect(await rows()).toEqual([]);
    expect(fake.files.size).toBe(1);
    expect(logs.filter((l) => l.event === "photo_orphan")).toHaveLength(1);
  });

  it("DELETE item with Drive off -> 204 and a photo_orphan log", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    expect((await fetch(`${noDriveBase}/api/items/${uuid(1)}`, { method: "DELETE" })).status).toBe(
      204,
    );
    expect(fake.files.size).toBe(1);
    expect(logs.filter((l) => l.event === "photo_orphan")).toHaveLength(1);
  });

  it("rejects before Drive: 415, 413 (Content-Length and chunked), 400 empty / bad magic / truncated", async () => {
    await mkItem(uuid(1));
    fake.requests.length = 0;
    expect((await putPhoto(uuid(1), JPEG, { "Content-Type": "image/png" })).status).toBe(415);
    const big = Buffer.concat([JPEG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await putPhoto(uuid(1), big)).status).toBe(413);
    const chunked = await raw(
      `PUT /api/items/${uuid(1)}/photo HTTP/1.1\r\nHost: x\r\nContent-Type: image/jpeg\r\nTransfer-Encoding: chunked`,
      Buffer.concat([
        Buffer.from(`${big.length.toString(16)}\r\n`),
        big,
        Buffer.from("\r\n0\r\n\r\n"),
      ]),
    );
    expect(chunked).toMatch(/^HTTP\/1\.1 413 /);
    const empty = await putPhoto(uuid(1), Buffer.alloc(0));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("invalid_photo");
    expect((await putPhoto(uuid(1), Buffer.from("not a jpeg at all"))).status).toBe(400);
    const truncated = await raw(
      `PUT /api/items/${uuid(1)}/photo HTTP/1.1\r\nHost: x\r\nContent-Type: image/jpeg\r\nContent-Length: 100`,
      JPEG,
    );
    expect(truncated).not.toMatch(/ 200 /);
    expect(fake.requests).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it("guards: 503 photos_unavailable without Drive, 405 Allow, 403 cross-site, 400 bad uuid", async () => {
    await mkItem(uuid(1));
    const off: Res = await fetch(`${noDriveBase}/api/items/${uuid(1)}/photo`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: JPEG,
    });
    expect(off.status).toBe(503);
    expect((await off.json()).error.code).toBe("photos_unavailable");
    expect((await delPhoto(uuid(1), noDriveBase, uuid(5))).status).toBe(503);
    const get = await fetch(`${base}/api/items/${uuid(1)}/photo`);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("PUT, DELETE");
    const cross = await fetch(`${base}/api/items/${uuid(1)}/photo`, {
      method: "DELETE",
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(cross.status).toBe(403);
    expect((await putPhoto("not-a-uuid")).status).toBe(400);
    expect(fake.requests).toEqual([]);
  });

  it("item PUT never touches photos and carries primary_photo_id", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const [before] = await rows();
    const res: Res = await fetch(`${base}/api/items/${uuid(1)}`, {
      method: "PUT",
      headers: JSON_H,
      body: JSON.stringify({ name: "renamed" }),
    });
    expect((await res.json()).item.primary_photo_id).toBe(before.id);
    expect(await rows()).toHaveLength(1);
    expect(fake.files.size).toBe(1);
  });

  const getPhoto = (id: string, headers: Record<string, string> = {}): Promise<Res> =>
    fetch(`${base}/api/photos/${id}`, { headers });

  it("GET photo streams the stored bytes with fixed headers", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const photoId = await primaryId();
    const [[driveId, file]] = [...fake.files];
    file.meta.mimeType = "text/html";
    logs = [];
    const res = await getPhoto(photoId);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(JPEG)).toBe(true);
    const h = Object.fromEntries(res.headers);
    expect(h).toMatchObject({
      "content-type": "image/jpeg",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
      "cache-control": "private, max-age=31536000, immutable",
      etag: `"${photoId}"`,
      "cross-origin-resource-policy": "same-origin",
      "content-length": String(JPEG.length),
    });
    const { etag, ...others } = h;
    const wire = JSON.stringify(others) + JSON.stringify(logs);
    for (const secret of [driveId, "googleapis", "fake-access-token", photoId]) {
      expect(wire).not.toContain(secret);
    }
    expect(logs.some((l) => l.route === "/api/photos/:id")).toBe(true);
    const items = JSON.stringify(await (await fetch(`${base}/api/items`)).json());
    expect(items).not.toContain(driveId);
  });

  it("GET photo: If-None-Match -> 304 with ETag and Cache-Control, no Drive media request", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const photoId = await primaryId();
    fake.requests.length = 0;
    const res = await getPhoto(photoId, { "If-None-Match": `"${photoId}"` });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(`"${photoId}"`);
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(fake.requests).toEqual([]);
  });

  it("GET photo: unknown uuid -> 404 not_found, no Drive request", async () => {
    const res = await getPhoto(uuid(9));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
    expect(fake.requests).toEqual([]);
  });

  it("GET photo: legacy storage_path-only row -> 404, no Drive request", async () => {
    await mkItem(uuid(1));
    const { rows: r } = await pool.query(
      "insert into item_photos (item_id, storage_path) values ($1, 'a/b.jpg') returning id",
      [uuid(1)],
    );
    expect((await getPhoto(r[0].id)).status).toBe(404);
    expect(fake.requests).toEqual([]);
  });

  it("GET photo: Drive file gone -> 404 not_found", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const photoId = await primaryId();
    fake.files.clear();
    const res = await getPhoto(photoId);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found" } });
  });

  it("GET photo: Drive 500 on media -> 502 photo_fetch_failed, body exactly {error:{code}}", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const photoId = await primaryId();
    const [[driveId]] = [...fake.files];
    fake.fail.add("media");
    logs = [];
    const res = await getPhoto(photoId);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: { code: "photo_fetch_failed" } });
    expect(JSON.stringify(logs)).not.toContain(photoId);
    expect(JSON.stringify(logs)).not.toContain(driveId);
    expect(logs).toContainEqual({ event: "photo_read_failed", code: "drive_unavailable" });
  });

  it("GET photo: Drive auth failure -> 503 photos_unavailable", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const photoId = await primaryId();
    beforeMedia = async () => {
      throw new DriveError("drive_auth", 401);
    };
    const res = await getPhoto(photoId);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: { code: "photos_unavailable" } });
  });

  it("GET photo: Drive headers timeout -> 502", async () => {
    await mkItem(uuid(1));
    await putPhoto(uuid(1));
    const photoId = await primaryId();
    fake.hang.add("media");
    expect((await getPhoto(photoId)).status).toBe(502);
  });
});
