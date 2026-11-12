// @vitest-environment node
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "./db.js";
import { createDriveClient } from "./drive.js";
import { runMigrations } from "./migrator.js";
import { main, runSweep } from "./photo-sweep.js";
import {
  FAKE,
  fakeConfig,
  fakeEnv,
  GOOGLE_TEXT_SENTINEL,
  startFakeDrive,
} from "./test/fake-drive.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
const NOW = Date.parse("2026-03-04T05:00:00Z");
const MIN = 60_000;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fid = (n: number) => `fakefile${String(n).padStart(8, "0")}`;
const ITEM = uuid(900);

describe.skipIf(!dbAvailable)("photo sweep against real Postgres and a fake Drive", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let fake: Awaited<ReturnType<typeof startFakeDrive>>;
  const iso = (agoMin: number) => new Date(NOW - agoMin * MIN).toISOString();

  const client = () =>
    createDriveClient({ config: fakeConfig, ...fake.urls, sleep: async () => {} });
  /** A Drive file in the fake folder; `n` is its id, `photo` its tagged photo uuid. */
  const putFile = (n: number, agoMin: number | null, props: Record<string, string> | null = {}) =>
    fake.files.set(fid(n), {
      bytes: Buffer.from("x"),
      meta: {
        parents: [FAKE.folderId],
        ...(agoMin === null ? {} : { createdTime: iso(agoMin) }),
        ...(props === null ? {} : { appProperties: { app: "tudo", photoId: uuid(n), ...props } }),
      },
    });
  const addRow = async (n: number, agoMin = 600) =>
    (
      await pool.query(
        "insert into item_photos (id, item_id, drive_file_id, created_at) values ($1, $2, $3, $4) returning id",
        [uuid(n), ITEM, fid(n), iso(agoMin)],
      )
    ).rows[0].id as string;
  /** A referenced tagged file (id 100), so the sweep does not refuse for an empty reference set. */
  const anchor = async () => {
    putFile(100, 600);
    await addRow(100);
  };
  const run = async (
    o: Partial<Parameters<typeof runSweep>[0]> = {},
  ): Promise<{ code: number; lines: string[] }> => {
    const lines: string[] = [];
    const code = await runSweep({
      drive: client(),
      pool,
      folderId: FAKE.folderId,
      now: () => NOW,
      log: (l) => lines.push(l),
      ...o,
    });
    return { code, lines };
  };
  const deletes = () => fake.requests.filter((r) => r.method === "DELETE");
  const listCalls = () => fake.requests.filter((r) => r.url.startsWith("/drive/v3/files?q="));

  beforeAll(async () => {
    db = await createTestDb();
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.url);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    fake = await startFakeDrive();
    await pool.query("truncate wear_logs, item_photos, items, locations cascade");
    await pool.query("insert into items (id, name) values ($1, 'x')", [ITEM]);
  });
  afterEach(() => fake?.close());

  it("apply deletes an unreferenced tagged file older than the grace period", async () => {
    await anchor();
    putFile(1, 120);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(fake.files.has(fid(1))).toBe(false);
    expect(lines).toContain(`delete ${uuid(1)}: ok`);
    expect(lines.at(-1)).toContain("deleted 1");
  });

  it("apply keeps a file referenced by an item_photos row", async () => {
    putFile(1, 600);
    await addRow(1);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(fake.files.has(fid(1))).toBe(true);
    expect(lines.at(-1)).toContain("referenced 1");
    expect(deletes()).toHaveLength(0);
  });

  it("apply keeps an unreferenced file younger than the grace period", async () => {
    await anchor();
    putFile(1, 59);
    expect((await run({ apply: true })).code).toBe(0);
    expect(fake.files.has(fid(1))).toBe(true);
    // boundary with the minimum grace period: 14 min kept, 16 min deleted
    putFile(2, 14);
    putFile(3, 16);
    const { lines } = await run({ apply: true, graceMinutes: 15 });
    expect(fake.files.has(fid(2))).toBe(true);
    expect(fake.files.has(fid(3))).toBe(false);
    expect(fake.files.has(fid(1))).toBe(false); // 59 min is older than 15
    expect(lines.at(-1)).toContain("young 1");
  });

  it("apply keeps untagged files", async () => {
    putFile(1, 600, null);
    fake.files.set(fid(2), {
      bytes: Buffer.from("x"),
      meta: { parents: [FAKE.folderId], createdTime: iso(600), appProperties: { tudo: "smoke" } },
    });
    fake.files.set(fid(3), {
      bytes: Buffer.from("x"),
      meta: { parents: [FAKE.folderId], createdTime: iso(600), appProperties: { app: "other" } },
    });
    expect((await run({ apply: true })).code).toBe(0);
    expect(fake.files.size).toBe(3);
    // the fake ignores the tag clause: the sweep's own check still keeps them
    fake.modes.add("list-ignore-tag");
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(fake.files.size).toBe(3);
    expect(deletes()).toHaveLength(0);
    expect(lines.at(-1)).toContain("untagged 3");
  });

  it("apply keeps files with a missing or unparsable createdTime", async () => {
    putFile(1, null);
    fake.files.set(fid(2), {
      bytes: Buffer.from("x"),
      meta: {
        parents: [FAKE.folderId],
        createdTime: "garbage",
        appProperties: { app: "tudo" },
      },
    });
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(fake.files.size).toBe(2);
    expect(lines.at(-1)).toContain("no_time 2");
  });

  it("dry-run (default) deletes nothing and reports would-delete", async () => {
    putFile(1, 600);
    putFile(2, 600, { photoId: "not-a-uuid" });
    const { code, lines } = await run();
    expect(code).toBe(0);
    expect(deletes()).toHaveLength(0);
    expect(fake.files.size).toBe(2);
    expect(lines).toContain(`would delete ${uuid(1)}`);
    expect(lines).toContain("would delete -");
    expect(lines.at(-1)).toContain("candidates 2, deleted 0");
    expect(lines.at(-1)).toContain("mode dry-run");
  });

  it("a row inserted after the listing is not deleted (re-check)", async () => {
    await anchor();
    putFile(1, 600);
    let loaded = false;
    const lateInsertPool = {
      query: async (sql: string, params?: unknown[]) => {
        const r = await pool.query(sql, params);
        if (!loaded) {
          loaded = true; // the sweep has its reference set: now a row appears
          await addRow(1);
        }
        return r;
      },
    };
    const { code, lines } = await run({ pool: lateInsertPool, apply: true });
    expect(code).toBe(0);
    expect(fake.files.has(fid(1))).toBe(true);
    expect(deletes()).toHaveLength(0);
    expect(lines).toContain(`keep ${uuid(1)}: referenced`);
  });

  it("rows whose Drive file is missing are reported and kept; young rows are not reported", async () => {
    const old = await addRow(1, 600);
    await addRow(2, 5);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(lines).toContain(`missing file for photo ${old}`);
    expect(lines.filter((l) => l.startsWith("missing file"))).toHaveLength(1);
    expect(lines.at(-1)).toContain("missing 1");
    expect((await pool.query("select 1 from item_photos")).rowCount).toBe(2);
  });

  it("pagination: files on later pages are swept", async () => {
    fake.config.listPageSize = 2;
    await anchor();
    for (let i = 1; i <= 5; i++) putFile(i, 600);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(0);
    expect(fake.files.size).toBe(1);
    expect(listCalls()).toHaveLength(3);
    expect(lines.at(-1)).toContain("listed 6 (3 pages)");
  });

  it("a failed delete is reported with its code, the sweep continues, exit 1", async () => {
    await anchor();
    putFile(1, 600);
    putFile(2, 600);
    fake.fail.add("delete");
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(1);
    expect(lines).toContain(`delete ${uuid(1)}: FAIL drive_unavailable`);
    expect(lines).toContain(`delete ${uuid(2)}: FAIL drive_unavailable`);
    expect(lines.at(-1)).toContain("failed 2");
  });

  it("list failure -> exit 1, nothing deleted", async () => {
    putFile(1, 600);
    fake.fail.add("list");
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(1);
    expect(lines).toEqual(["list: FAIL drive_unavailable"]);
    expect(deletes()).toHaveLength(0);
  });

  it("more candidates than --max-delete: apply deletes nothing, exit 1", async () => {
    await anchor();
    for (let i = 1; i <= 3; i++) putFile(i, 600);
    const { code, lines } = await run({ apply: true, maxDelete: 2 });
    expect(code).toBe(1);
    expect(lines[0]).toBe("too many candidates: 3 > 2 (rerun with --max-delete 3)");
    expect(deletes()).toHaveLength(0);
    // dry-run is not capped
    expect((await run({ maxDelete: 2 })).code).toBe(0);
  });

  it("apply refuses and deletes nothing when item_photos is empty and old tagged files exist", async () => {
    for (let i = 1; i <= 3; i++) putFile(i, 600);
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(1);
    expect(lines).toContain("refusing: no listed file is referenced (check DATABASE_URL)");
    expect(deletes()).toHaveLength(0);
    expect(fake.files.size).toBe(3);
    // dry-run still reports, with the same warning
    const dry = await run();
    expect(dry.code).toBe(0);
    expect(dry.lines).toContain("refusing: no listed file is referenced (check DATABASE_URL)");
    expect(dry.lines).toContain(`would delete ${uuid(1)}`);
  });

  it("apply refuses when item_photos has only rows that match no listed file", async () => {
    for (let i = 1; i <= 3; i++) putFile(i, 600);
    await addRow(50); // its file is not in the listing
    const { code, lines } = await run({ apply: true });
    expect(code).toBe(1);
    expect(lines).toContain("refusing: no listed file is referenced (check DATABASE_URL)");
    expect(deletes()).toHaveLength(0);
    expect(fake.files.size).toBe(3);
  });

  it("folder check fails -> exit 1, no list, nothing deleted", async () => {
    putFile(1, 600);
    const drive = createDriveClient({
      config: { ...fakeConfig, folderId: "missingfolder0123456" },
      ...fake.urls,
      sleep: async () => {},
    });
    const { code, lines } = await run({ drive, apply: true });
    expect(code).toBe(1);
    expect(lines).toEqual(["checkFolder: FAIL drive_folder_not_found"]);
    expect(listCalls()).toHaveLength(0);
    expect(deletes()).toHaveLength(0);
  });

  it("db failure -> exit 1, nothing deleted", async () => {
    putFile(1, 600);
    const badPool = {
      query: () => Promise.reject(Object.assign(new Error("x"), { code: "57P01" })),
    };
    const { code, lines } = await run({ pool: badPool, apply: true });
    expect(code).toBe(1);
    expect(lines).toEqual(["db: FAIL 57P01"]);
    expect(deletes()).toHaveLength(0);
  });

  it("output never contains tokens, secrets, Google error text, Drive file ids or page tokens", async () => {
    fake.config.listPageSize = 2;
    for (let i = 1; i <= 3; i++) putFile(i, 600);
    await addRow(4); // a row whose file is missing
    const all: string[] = [];
    all.push(...(await run()).lines);
    fake.fail.add("delete");
    all.push(...(await run({ apply: true })).lines);
    fake.fail.delete("delete");
    fake.fail.add("list");
    all.push(...(await run({ apply: true })).lines);
    const tokens = fake.requests
      .map((r) => new URL(r.url, "http://x").searchParams.get("pageToken"))
      .filter((t): t is string => Boolean(t));
    expect(tokens.length).toBeGreaterThan(0);
    const text = all.join("\n");
    for (const s of [
      FAKE.accessToken,
      FAKE.refreshToken,
      FAKE.clientSecret,
      GOOGLE_TEXT_SENTINEL,
      "fakefile",
      ...tokens,
    ])
      expect(text).not.toContain(s);
  });

  it("main runs with env + injected client/pool factories and returns the exit code", async () => {
    await anchor();
    putFile(1, 600);
    const lines: string[] = [];
    const errors: string[] = [];
    const code = await main({
      argv: ["--apply", "--grace-minutes", "30"],
      env: { ...fakeEnv, DATABASE_URL: db.url },
      log: (l) => lines.push(l),
      error: (l) => errors.push(l),
      makeClient: (o) => createDriveClient({ ...o, ...fake.urls, sleep: async () => {} }),
      makePool: (url) => createPool(url),
      now: () => NOW,
    });
    expect(code).toBe(0);
    expect(errors).toEqual([]);
    expect(fake.files.size).toBe(1);
    expect(lines.at(-1)).toContain("mode apply");
  });

  it("main: an unexpected error prints a fixed message and returns 1", async () => {
    const errors: string[] = [];
    const code = await main({
      argv: [],
      env: { ...fakeEnv, DATABASE_URL: db.url },
      log: () => {},
      error: (l) => errors.push(l),
      makeClient: () => {
        throw new Error(FAKE.clientSecret);
      },
      makePool: (url) => createPool(url),
    });
    expect(code).toBe(1);
    expect(errors).toEqual(["sweep failed"]);
  });
});
