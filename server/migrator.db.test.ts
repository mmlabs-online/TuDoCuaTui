// @vitest-environment node
import { cp, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationError, runMigrations } from "./migrator.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const here = import.meta.dirname;
const realDir = path.resolve(here, "../db/migrations");
const fixture = (name: string) => path.join(here, "test/fixtures", name);

async function query(url: string, sql: string) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(sql)).rows;
  } finally {
    await c.end();
  }
}

async function tempCopy(name: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
  await cp(fixture(name), dir, { recursive: true });
  return dir;
}

describe.skipIf(!dbAvailable)("runMigrations (real Postgres)", () => {
  let db: TestDb;
  const tmpDirs: string[] = [];
  const run = (dir: string, extra: { lockWaitMs?: number; log?: (l: string) => void } = {}) =>
    runMigrations({ connectionString: db.url, dir, ...extra });
  const versions = async () =>
    (await query(db.url, "select version from schema_migrations order by version")).map(
      (r) => r.version as string,
    );

  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.drop();
    await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("applies all migrations to a fresh database", async () => {
    const lines: string[] = [];
    await run(realDir, { log: (l) => lines.push(l) });
    expect(lines[0]).toMatch(/^applied 20261110120000_init/);
    const rows = await query(db.url, "select to_regclass('items_with_stats') as v");
    expect(rows[0].v).toBe("items_with_stats");
    expect(await versions()).toContain("20261110120000");
  });

  it("second run is a no-op (same rows, same applied_at)", async () => {
    await run(realDir);
    const before = await query(db.url, "select * from schema_migrations order by version");
    const lines: string[] = [];
    await run(realDir, { log: (l) => lines.push(l) });
    expect(lines).toEqual(["up to date"]);
    expect(await query(db.url, "select * from schema_migrations order by version")).toEqual(before);
  });

  it("failing file rolls back fully and stops", async () => {
    await expect(run(fixture("bad"))).rejects.toBeInstanceOf(MigrationError);
    expect(await versions()).toEqual(["20260101000000"]);
    const rows = await query(
      db.url,
      "select to_regclass('t_one') as one, to_regclass('t_two') as two, to_regclass('t_three') as three",
    );
    expect(rows[0]).toEqual({ one: "t_one", two: null, three: null });
  });

  it("rejects a migration that ends the transaction itself (end;)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
    tmpDirs.push(dir);
    await writeFile(
      path.join(dir, "20260101000000_end.sql"),
      "create table t_end (id int);\nend;\ncreate table t_after (id int);\n",
    );
    await expect(run(dir)).rejects.toThrow(/ended the transaction/);
    expect(await versions()).toEqual([]);
  });

  it("checksum mismatch fails and applies nothing", async () => {
    const dir = await tempCopy("ok");
    tmpDirs.push(dir);
    await run(dir);
    await writeFile(path.join(dir, "20260101000000_one.sql"), "create table t_changed (id int);\n");
    await writeFile(path.join(dir, "20260101000200_three.sql"), "create table t_three (id int);\n");
    await expect(run(dir)).rejects.toThrow(/checksum mismatch/);
    expect(await versions()).toEqual(["20260101000000", "20260101000100"]);
    expect((await query(db.url, "select to_regclass('t_three') as v"))[0].v).toBeNull();
  });

  it("missing applied file older than newest local file fails", async () => {
    const dir = await tempCopy("ok");
    tmpDirs.push(dir);
    await run(dir);
    await unlink(path.join(dir, "20260101000000_one.sql"));
    await expect(run(dir)).rejects.toThrow(/missing locally/);
  });

  it("out-of-order pending file fails", async () => {
    const dir = await tempCopy("ok");
    tmpDirs.push(dir);
    await unlink(path.join(dir, "20260101000000_one.sql"));
    await run(dir);
    await writeFile(path.join(dir, "20260101000000_one.sql"), "create table t_one (id int);\n");
    await expect(run(dir)).rejects.toThrow(/older than/);
  });

  it("DB ahead of image warns and exits 0", async () => {
    await run(fixture("ok"));
    const dir = await tempCopy("ok");
    tmpDirs.push(dir);
    await unlink(path.join(dir, "20260101000100_two.sql"));
    const lines: string[] = [];
    await run(dir, { log: (l) => lines.push(l) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^warning: database is ahead.*20260101000100/);
  });

  it("two concurrent runs both succeed, each file applied once", async () => {
    await Promise.all([run(fixture("ok")), run(fixture("ok"))]);
    expect(await versions()).toEqual(["20260101000000", "20260101000100"]);
  });

  it("lock held elsewhere times out with exit code 1", async () => {
    const holder = new pg.Client({ connectionString: db.url });
    await holder.connect();
    try {
      await holder.query("select pg_advisory_lock(7410512012)");
      const err = await run(fixture("ok"), { lockWaitMs: 200 }).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.exitCode).toBe(1);
      expect(err.message).toMatch(/another migration is running/);
    } finally {
      await holder.end();
    }
  });

  it("applies as a NOSUPERUSER database owner", async () => {
    const owned = await createTestDb({ owner: true });
    try {
      await runMigrations({ connectionString: owned.url, dir: realDir });
      const rows = await query(
        owned.url,
        "select rolsuper from pg_roles where rolname = current_user",
      );
      expect(rows[0].rolsuper).toBe(false);
      expect((await query(owned.url, "select to_regclass('items') as v"))[0].v).toBe("items");
    } finally {
      await owned.drop();
    }
  });
});
