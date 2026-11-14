// @vitest-environment node
import { copyFile, cp, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MigrationError, runMigrations } from "./migrator.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const here = import.meta.dirname;
const realDir = path.resolve(here, "../db/migrations");
const OWNER = "0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e";
const APPLIED = [
  "20261110120000_init.sql",
  "20261112120000_item_photos_drive.sql",
  "20261112140000_item_category_v2.sql",
  "20261112160000_ai_settings.sql",
];
const EXPAND = "20261113120000_user_ownership_expand.sql";
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
  const run = (
    dir: string,
    extra: { lockWaitMs?: number; log?: (l: string) => void; ownerSub?: string } = {},
  ) => runMigrations({ connectionString: db.url, dir, ...extra });
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

  /** Applies the four pre-ownership files, then inserts one row in each of the five tables. */
  async function seedBeforeExpand(url: string) {
    const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
    tmpDirs.push(dir);
    for (const f of APPLIED) await copyFile(path.join(realDir, f), path.join(dir, f));
    await runMigrations({ connectionString: url, dir });
    const loc = (await query(url, "insert into locations (name) values ('L') returning id"))[0].id;
    const item = (
      await query(url, `insert into items (name, location_id) values ('I', '${loc}') returning id`)
    )[0].id;
    await query(
      url,
      `insert into item_photos (item_id, storage_path) values ('${item}', 'u/i/a.jpg')`,
    );
    await query(url, `insert into wear_logs (item_id, worn_on) values ('${item}', '2026-11-10')`);
    await query(url, "insert into ai_settings (provider, model) values ('claude', 'm')");
    return dir;
  }

  it("ownership expand: rows in all five tables get the owner; updated_at unchanged; triggers re-enabled", async () => {
    await seedBeforeExpand(db.url);
    const ts = () =>
      query(
        db.url,
        "select (select updated_at from items)::text as i, (select updated_at from ai_settings)::text as a",
      );
    const before = await ts();
    await run(realDir, { ownerSub: OWNER });
    for (const t of ["locations", "items", "item_photos", "wear_logs", "ai_settings"]) {
      const rows = await query(db.url, `select user_id from ${t}`);
      expect(rows, t).toEqual([{ user_id: OWNER }]);
    }
    expect(await ts()).toEqual(before);
    const trg = await query(
      db.url,
      "select tgenabled from pg_trigger where tgname in ('items_updated_at', 'ai_settings_updated_at')",
    );
    expect(trg).toEqual([{ tgenabled: "O" }, { tgenabled: "O" }]);
    await query(db.url, "update items set name = 'J'");
    const after = await query(db.url, "select updated_at::text as i from items");
    expect(after[0].i).not.toBe(before[0].i);
  });

  it("rows + no owner rejects; nothing applied", async () => {
    await seedBeforeExpand(db.url);
    for (const ownerSub of [undefined, "  "]) {
      const err = await run(realDir, { ownerSub }).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.exitCode).toBe(1);
      expect(err.message).toMatch(/TUDO_OWNER_SUB is not set/);
    }
    expect(await versions()).toEqual(APPLIED.map((f) => f.slice(0, 14)));
    expect(
      await query(
        db.url,
        "select 1 from information_schema.columns where column_name = 'user_id' and table_name = 'items'",
      ),
    ).toEqual([]);
  });

  it("empty DB passes with and without owner", async () => {
    await run(realDir);
    const other = await createTestDb();
    try {
      await runMigrations({ connectionString: other.url, dir: realDir, ownerSub: OWNER });
      for (const url of [db.url, other.url]) {
        expect((await query(url, "select version from schema_migrations")).length).toBe(5);
        expect(
          (
            await query(
              url,
              "select 1 from information_schema.columns where column_name = 'user_id' and table_name = 'locations'",
            )
          ).length,
        ).toBe(1);
      }
    } finally {
      await other.drop();
    }
  });

  it("garbage tudo.owner_sub GUC is rejected without echoing it", async () => {
    await seedBeforeExpand(db.url);
    const sql = await readFile(path.join(realDir, EXPAND), "utf8");
    for (const bad of ["not-a-uuid-SECRETISH", "00000000-0000-0000-0000-000000000000"]) {
      const c = new pg.Client({ connectionString: db.url });
      await c.connect();
      try {
        await c.query("begin");
        await c.query("select set_config('tudo.owner_sub', $1, true)", [bad]);
        const err = await c.query(sql).catch((e) => e);
        expect(err.message).toMatch(/not a valid uuid/);
        expect(err.message).not.toContain("SECRETISH");
        await c.query("rollback");
      } finally {
        await c.end();
      }
    }
  });

  it("null user_id inserts still accepted", async () => {
    await run(realDir);
    await query(db.url, "insert into locations (name) values ('L')");
    await query(db.url, "insert into items (name) values ('I')");
    const id = (await query(db.url, "select id from items"))[0].id;
    await query(db.url, `insert into item_photos (item_id, storage_path) values ('${id}', 'p')`);
    await query(db.url, `insert into wear_logs (item_id, worn_on) values ('${id}', '2026-11-10')`);
    await query(db.url, "insert into ai_settings (provider, model) values ('claude', 'm')");
  });

  it("applies as a NOSUPERUSER database owner", async () => {
    const owned = await createTestDb({ owner: true });
    try {
      await seedBeforeExpand(owned.url);
      await runMigrations({ connectionString: owned.url, dir: realDir, ownerSub: OWNER });
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
