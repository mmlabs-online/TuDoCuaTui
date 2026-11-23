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
const CONTRACT = "20261114120000_user_ownership_contract.sql";
const AI_PER_USER = "20261114180000_ai_settings_per_user.sql";
const RLS = "20261114200000_row_level_security.sql";
const TABLES = ["locations", "items", "item_photos", "wear_logs", "ai_settings"];
const OWNER_B = "0190a6f2-7c3e-7b8a-9d4e-aaaaaaaaaaaa";
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

async function forced(url: string, tables: string[]) {
  return (
    await query(
      url,
      `select relname, relrowsecurity as rls, relforcerowsecurity as forced from pg_class
       where relname in (${tables.map((t) => `'${t}'`).join(",")}) order by relname`,
    )
  ).map((r) => `${r.relname}:${r.rls}:${r.forced}`);
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

  /** A temp dir with the first six files (up to and including the contract). */
  async function contractDir() {
    const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
    tmpDirs.push(dir);
    for (const f of [...APPLIED, EXPAND, CONTRACT]) {
      await copyFile(path.join(realDir, f), path.join(dir, f));
    }
    return dir;
  }

  /** A temp dir with the first five files (up to and including the expand). */
  async function expandDir() {
    const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
    tmpDirs.push(dir);
    for (const f of [...APPLIED, EXPAND]) await copyFile(path.join(realDir, f), path.join(dir, f));
    return dir;
  }

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
    const dir = await expandDir();
    const ts = () =>
      query(
        db.url,
        "select (select updated_at from items)::text as i, (select updated_at from ai_settings)::text as a",
      );
    const before = await ts();
    await run(dir, { ownerSub: OWNER });
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
        expect((await query(url, "select version from schema_migrations")).length).toBe(12);
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

  it("expand state: null user_id inserts still accepted", async () => {
    await run(await expandDir());
    await query(db.url, "insert into locations (name) values ('L')");
    await query(db.url, "insert into items (name) values ('I')");
    const id = (await query(db.url, "select id from items"))[0].id;
    await query(db.url, `insert into item_photos (item_id, storage_path) values ('${id}', 'p')`);
    await query(db.url, `insert into wear_logs (item_id, worn_on) values ('${id}', '2026-11-10')`);
    await query(db.url, "insert into ai_settings (provider, model) values ('claude', 'm')");
  });

  describe("contract (T-019.2)", () => {
    const TABLES = ["locations", "items", "item_photos", "wear_logs"];
    /** Expand applied on an empty DB, then owned rows (owner `owned`) and optional null-user_id stragglers. */
    async function seedExpanded(opts: { owned?: string; stragglers?: boolean; aiOwner?: string }) {
      await run(await expandDir());
      const q = (sql: string) => query(db.url, sql);
      const u = (v: string | null | undefined) => (v ? `'${v}'` : "null");
      const owned = opts.owned;
      if (owned) {
        const loc = (
          await q(`insert into locations (user_id, name) values ('${owned}', 'L') returning id`)
        )[0].id;
        const item = (
          await q(
            `insert into items (user_id, name, location_id) values ('${owned}', 'I', '${loc}') returning id`,
          )
        )[0].id;
        await q(
          `insert into item_photos (user_id, item_id, storage_path) values ('${owned}', '${item}', 'a')`,
        );
        await q(
          `insert into wear_logs (user_id, item_id, worn_on) values ('${owned}', '${item}', '2026-11-10')`,
        );
      }
      if (opts.stragglers) {
        const loc = (await q("insert into locations (name) values ('S') returning id"))[0].id;
        const item = (
          await q(`insert into items (name, location_id) values ('J', '${loc}') returning id`)
        )[0].id;
        await q(`insert into item_photos (item_id, storage_path) values ('${item}', 'b')`);
        await q(`insert into wear_logs (item_id, worn_on) values ('${item}', '2026-11-11')`);
      }
      if (opts.aiOwner !== undefined || owned) {
        await q(
          `insert into ai_settings (provider, model, user_id) values ('claude', 'm', ${u(opts.aiOwner)})`,
        );
      }
    }
    const notNull = async () =>
      (
        await query(
          db.url,
          "select table_name, is_nullable from information_schema.columns where column_name = 'user_id' and table_name = any('{locations,items,item_photos,wear_logs}') order by table_name",
        )
      ).map((r) => r.is_nullable);
    const contractApplied = async () => (await versions()).includes("20261114120000");

    it("owned rows and stragglers -> every row owned, updated_at kept, trigger enabled, NOT NULL", async () => {
      await seedExpanded({ owned: OWNER, stragglers: true });
      const before = await query(db.url, "select id, updated_at::text as t from items order by id");
      await run(realDir, { ownerSub: OWNER });
      for (const t of TABLES) {
        expect(await query(db.url, `select distinct user_id from ${t}`), t).toEqual([
          { user_id: OWNER },
        ]);
      }
      expect(
        await query(db.url, "select id, updated_at::text as t from items order by id"),
      ).toEqual(before);
      expect(
        await query(db.url, "select tgenabled from pg_trigger where tgname = 'items_updated_at'"),
      ).toEqual([{ tgenabled: "O" }]);
      expect(await notNull()).toEqual(["NO", "NO", "NO", "NO"]);
    });

    it("stragglers and no owner -> fails with a constant message; contract not applied", async () => {
      await seedExpanded({ stragglers: true });
      const err = await run(realDir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/rows exist but TUDO_OWNER_SUB is not set/);
      expect(await contractApplied()).toBe(false);
      expect(await notNull()).toEqual(["YES", "YES", "YES", "YES"]);
    });

    it("all rows owned and no owner -> same failure (owner required whenever rows exist)", async () => {
      await seedExpanded({ owned: OWNER });
      await expect(run(realDir)).rejects.toThrow(/rows exist but TUDO_OWNER_SUB is not set/);
      expect(await contractApplied()).toBe(false);
    });

    it("two owners, or an owner that differs from the GUC -> constant messages, no uuid echoed", async () => {
      await seedExpanded({ owned: OWNER });
      await query(db.url, `insert into locations (user_id, name) values ('${OWNER_B}', 'B')`);
      const two = await run(realDir, { ownerSub: OWNER }).catch((e) => e);
      expect(two.message).toMatch(/rows belong to more than one owner/);
      await db.drop();
      db = await createTestDb();
      await seedExpanded({ owned: OWNER });
      const differs = await run(realDir, { ownerSub: OWNER_B }).catch((e) => e);
      expect(differs.message).toMatch(/existing owner differs from TUDO_OWNER_SUB/);
      await db.drop();
      db = await createTestDb();
      await seedExpanded({ owned: OWNER, aiOwner: OWNER_B });
      const ai = await run(realDir, { ownerSub: OWNER }).catch((e) => e);
      expect(ai.message).toMatch(/rows belong to more than one owner/);
      for (const m of [two.message, differs.message, ai.message]) {
        expect(m).not.toContain(OWNER);
        expect(m).not.toContain(OWNER_B);
      }
      expect(await contractApplied()).toBe(false);
    });

    it("empty DB passes with and without owner; an ai_settings row with null user_id is ignored", async () => {
      await run(await contractDir());
      expect(await contractApplied()).toBe(true);
      await db.drop();
      db = await createTestDb();
      await run(await expandDir());
      await query(db.url, "insert into ai_settings (provider, model) values ('claude', 'm')");
      await expect(run(await contractDir(), { ownerSub: OWNER })).resolves.toBeUndefined();
      expect(await notNull()).toEqual(["NO", "NO", "NO", "NO"]);
    });

    it("the file guards server_version_num < 150000 with a constant message", async () => {
      const sql = await readFile(path.join(realDir, CONTRACT), "utf8");
      expect(sql).toContain("server_version_num");
      expect(sql).toContain("150000");
      expect(sql).toContain("'PostgreSQL 15 or newer is required'");
    });
  });

  describe("ai_settings per user (T-019.3)", () => {
    const perUserApplied = async () => (await versions()).includes("20261114180000");
    const aiColumns = async () =>
      (
        await query(
          db.url,
          "select column_name from information_schema.columns where table_name = 'ai_settings' order by column_name",
        )
      ).map((r) => r.column_name as string);
    const pkColumns = async () =>
      (
        await query(
          db.url,
          "select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey) where i.indrelid = 'ai_settings'::regclass and i.indisprimary",
        )
      ).map((r) => r.attname as string);
    const legacyRow = (user: string | null) =>
      query(
        db.url,
        `insert into ai_settings (user_id, provider, model, key_ciphertext, key_hint, key_updated_at)
         values (${user ? `'${user}'` : "null"}, 'claude', 'claude-haiku-5-5', 'v1:AAAA', 'cdef', now())`,
      );

    it("legacy v1 row: owner set, key columns cleared, provider/model kept, updated_at bumped; PK is user_id", async () => {
      await run(await contractDir());
      await legacyRow(null);
      const before = (await query(db.url, "select updated_at::text as t from ai_settings"))[0].t;
      await new Promise((r) => setTimeout(r, 15));
      await run(realDir, { ownerSub: OWNER });
      const rows = await query(
        db.url,
        "select user_id, provider, model, key_ciphertext, key_hint, key_updated_at, updated_at::text as t from ai_settings",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_id: OWNER,
        provider: "claude",
        model: "claude-haiku-5-5",
        key_ciphertext: null,
        key_hint: null,
        key_updated_at: null,
      });
      expect(rows[0].t).not.toBe(before);
      expect(await pkColumns()).toEqual(["user_id"]);
      expect(await aiColumns()).not.toContain("id");
    });

    it("a row already owned by the owner keeps its owner and is cleared", async () => {
      await run(await contractDir());
      await legacyRow(OWNER);
      await run(realDir, { ownerSub: OWNER });
      expect(await query(db.url, "select user_id, key_ciphertext from ai_settings")).toEqual([
        { user_id: OWNER, key_ciphertext: null },
      ]);
    });

    it("a row and no owner -> fails with a constant message; id column still there", async () => {
      await run(await contractDir());
      await legacyRow(null);
      const err = await run(realDir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/rows exist but TUDO_OWNER_SUB is not set/);
      expect(await perUserApplied()).toBe(false);
      expect(await aiColumns()).toContain("id");
    });

    it("a row owned by someone else -> 'existing owner differs'; no uuid in the message", async () => {
      await run(await contractDir());
      await legacyRow(OWNER_B);
      const err = await run(realDir, { ownerSub: OWNER }).catch((e) => e);
      expect(err.message).toMatch(/existing owner differs from TUDO_OWNER_SUB/);
      expect(err.message).not.toContain(OWNER);
      expect(err.message).not.toContain(OWNER_B);
      expect(await perUserApplied()).toBe(false);
    });

    it("an empty table passes with and without owner", async () => {
      await run(realDir);
      expect(await perUserApplied()).toBe(true);
      await db.drop();
      db = await createTestDb();
      await run(realDir, { ownerSub: OWNER });
      expect(await perUserApplied()).toBe(true);
      expect(await pkColumns()).toEqual(["user_id"]);
    });
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

  describe("row level security (T-019.4)", () => {
    const forced = async (url: string) =>
      (
        await query(
          url,
          `select relname, relrowsecurity as rls, relforcerowsecurity as forced from pg_class
           where relname in (${TABLES.map((t) => `'${t}'`).join(",")}) order by relname`,
        )
      ).map((r) => `${r.relname}:${r.rls}:${r.forced}`);
    const allForced = [...TABLES].sort().map((t) => `${t}:true:true`);

    /** A copy of the real migrations plus one extra file that runs after the RLS file. */
    async function withExtra(sql: string) {
      const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
      tmpDirs.push(dir);
      await cp(realDir, dir, { recursive: true });
      await writeFile(path.join(dir, "29991231235959_extra.sql"), sql);
      return dir;
    }

    it("empty DB: all files applied, the five tables end with RLS + FORCE", async () => {
      await run(realDir);
      expect(await versions()).toContain(RLS.slice(0, 14));
      expect(await forced(db.url)).toEqual(allForced);
    });

    it("upgrade with existing owned rows (as a NOSUPERUSER owner): rows intact, FORCE on", async () => {
      const owned = await createTestDb({ owner: true });
      try {
        await seedBeforeExpand(owned.url);
        await runMigrations({ connectionString: owned.url, dir: realDir, ownerSub: OWNER });
        expect(await forced(owned.url)).toEqual(allForced);
        for (const t of TABLES) {
          const rows = await query(owned.adminUrl, `select user_id from ${t}`);
          expect(rows, t).toEqual([{ user_id: OWNER }]);
        }
      } finally {
        await owned.drop();
      }
    });

    it("a file that leaves a table unforced fails and rolls back", async () => {
      await run(realDir);
      const dir = await withExtra(
        "alter table items no force row level security; update items set notes = 'x';",
      );
      const err = await run(dir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/row level security not forced on items/);
      expect(await versions()).not.toContain("29991231235959");
      expect(await forced(db.url)).toEqual(allForced);
    });

    it("a later file that disables RLS fails the guard (activation is by version, not by the table flag)", async () => {
      await run(realDir);
      const dir = await withExtra("alter table items disable row level security;");
      const err = await run(dir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/row level security not forced on items/);
      expect(await versions()).not.toContain("29991231235959");
      expect(await forced(db.url)).toEqual(allForced);
    });

    it("no force ... force around a data change passes, as the owner role", async () => {
      const owned = await createTestDb({ owner: true });
      try {
        await runMigrations({ connectionString: owned.url, dir: realDir });
        await query(
          owned.adminUrl,
          `insert into items (id, user_id, name) values ('00000000-0000-4000-8000-000000000001', '${OWNER}', 'n')`,
        );
        const dir = await withExtra(
          "alter table items no force row level security; update items set notes = 'x'; alter table items force row level security;",
        );
        await runMigrations({ connectionString: owned.url, dir });
        expect(await query(owned.adminUrl, "select notes from items")).toEqual([{ notes: "x" }]);
        expect(await forced(owned.url)).toEqual(allForced);
      } finally {
        await owned.drop();
      }
    });

    it("create or replace view without security_invoker fails the guard", async () => {
      await run(realDir);
      const dir = await withExtra(
        "do $$ begin execute 'create or replace view items_with_stats as ' || pg_get_viewdef('items_with_stats'::regclass); end $$;",
      );
      const err = await run(dir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/items_with_stats is not security_invoker/);
    });
  });
  describe("credit ledger (F-706.1)", () => {
    const CREDIT = "20261122120000_credit_ledger.sql";
    const SPEND = "20261122140000_ai_spend_meter.sql";
    const APP_KEYS = "20261122160000_ai_app_keys.sql";
    const CREDIT_ADMIN = "20261123120000_credit_admin.sql";
    const CREDIT_TABLES = ["credit_grants", "credit_ops", "credit_settings"];
    const uid = (n: number) => `0190a6f2-7c3e-7b8a-9d4e-${String(n).padStart(12, "0")}`;
    const [U1, U2, U3, U4, NEW_USER] = [uid(1), uid(2), uid(3), uid(4), uid(5)];
    const item = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

    /** A copy of the real migrations without the credit ledger file (and optionally with one extra file). */
    async function beforeCredit(extra?: [string, string]) {
      const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
      tmpDirs.push(dir);
      await cp(realDir, dir, { recursive: true });
      await unlink(path.join(dir, CREDIT));
      await unlink(path.join(dir, SPEND)).catch(() => {});
      await unlink(path.join(dir, APP_KEYS)).catch(() => {});
      await unlink(path.join(dir, CREDIT_ADMIN)).catch(() => {});
      if (extra) await writeFile(path.join(dir, extra[0]), extra[1]);
      return dir;
    }
    const grants = (url: string) =>
      query(
        url,
        "select user_id, bucket, amount, approved_at is not null as approved from credit_grants order by user_id",
      );

    async function seedUsers(url: string) {
      await query(url, `insert into locations (user_id, name) values ('${U1}', 'L')`);
      await query(url, `insert into items (id, user_id, name) values ('${item(2)}', '${U2}', 'I')`);
      await query(
        url,
        `insert into item_photos (user_id, item_id, drive_file_id) values ('${U2}', '${item(2)}', 'driveFileU20001')`,
      );
      await query(url, `insert into items (id, user_id, name) values ('${item(3)}', '${U3}', 'I')`);
      await query(
        url,
        `insert into wear_logs (user_id, item_id, worn_on) values ('${U3}', '${item(3)}', '2026-11-10')`,
      );
      await query(
        url,
        `insert into ai_settings (user_id, provider, model) values ('${U4}', 'claude', 'm')`,
      );
    }

    it("existing users (rows in any of the five tables, incl. one with only an ai_settings row) and TUDO_OWNER_SUB with no rows get one approved welcome grant of 300; a user with no rows gets none; run as the NOSUPERUSER owner", async () => {
      const owned = await createTestDb({ owner: true });
      try {
        await runMigrations({ connectionString: owned.url, dir: await beforeCredit() });
        await seedUsers(owned.adminUrl);
        await runMigrations({ connectionString: owned.url, dir: realDir, ownerSub: OWNER });
        const rows = await grants(owned.adminUrl);
        expect(rows.map((r) => r.user_id).sort()).toEqual([OWNER, U1, U2, U3, U4].sort());
        for (const r of rows) {
          expect(r, r.user_id).toMatchObject({ bucket: "welcome", amount: 300, approved: true });
        }
        expect(rows.find((r) => r.user_id === NEW_USER)).toBeUndefined();
        expect(await forced(owned.url, [...TABLES, ...CREDIT_TABLES])).toEqual(
          [...TABLES, ...CREDIT_TABLES].sort().map((t) => `${t}:true:true`),
        );
      } finally {
        await owned.drop();
      }
    });

    it("empty DB, no owner sub: no grants; settings seeded; all eight tables forced", async () => {
      await run(realDir);
      expect(await grants(db.url)).toEqual([]);
      expect(
        await query(db.url, "select welcome_amount, monthly_amount from credit_settings"),
      ).toEqual([{ welcome_amount: 300, monthly_amount: 60 }]);
      expect(
        await forced(db.url, [...TABLES, ...CREDIT_TABLES, "ai_spend_ops", "ai_app_keys"]),
      ).toEqual(
        [...TABLES, ...CREDIT_TABLES, "ai_spend_ops", "ai_app_keys"]
          .sort()
          .map((t) => `${t}:true:true`),
      );
    });

    it("second run is a no-op (grant rows unchanged)", async () => {
      await run(await beforeCredit());
      await seedUsers(db.url);
      await run(realDir, { ownerSub: OWNER });
      const before = await query(db.url, "select * from credit_grants order by user_id");
      expect(before).toHaveLength(5);
      const lines: string[] = [];
      await run(realDir, { ownerSub: OWNER, log: (l) => lines.push(l) });
      expect(lines).toEqual(["up to date"]);
      expect(await query(db.url, "select * from credit_grants order by user_id")).toEqual(before);
    });

    it("a later file that leaves credit_ops unforced fails the guard and rolls back", async () => {
      await run(realDir);
      const dir = await beforeCredit([
        "29991231235959_extra.sql",
        "alter table credit_ops no force row level security;",
      ]);
      await cp(path.join(realDir, CREDIT), path.join(dir, CREDIT));
      await cp(path.join(realDir, SPEND), path.join(dir, SPEND));
      await cp(path.join(realDir, APP_KEYS), path.join(dir, APP_KEYS));
      await cp(path.join(realDir, CREDIT_ADMIN), path.join(dir, CREDIT_ADMIN));
      const err = await run(dir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/row level security not forced on credit_ops/);
      expect(await versions()).not.toContain("29991231235959");
      expect(await forced(db.url, ["credit_ops"])).toEqual(["credit_ops:true:true"]);
    });

    it("a later file that leaves ai_spend_ops unforced fails the guard and rolls back", async () => {
      await run(realDir);
      const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
      tmpDirs.push(dir);
      await cp(realDir, dir, { recursive: true });
      await writeFile(
        path.join(dir, "29991231235959_extra.sql"),
        "alter table ai_spend_ops no force row level security;",
      );
      const err = await run(dir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/row level security not forced on ai_spend_ops/);
      expect(await versions()).not.toContain("29991231235959");
      expect(await forced(db.url, ["ai_spend_ops"])).toEqual(["ai_spend_ops:true:true"]);
    });

    it("a later file that leaves ai_app_keys unforced fails the guard and rolls back", async () => {
      await run(realDir);
      const dir = await mkdtemp(path.join(tmpdir(), "tudo-mig-"));
      tmpDirs.push(dir);
      await cp(realDir, dir, { recursive: true });
      await writeFile(
        path.join(dir, "29991231235959_extra.sql"),
        "alter table ai_app_keys no force row level security;",
      );
      const err = await run(dir).catch((e) => e);
      expect(err).toBeInstanceOf(MigrationError);
      expect(err.message).toMatch(/row level security not forced on ai_app_keys/);
      expect(await versions()).not.toContain("29991231235959");
      expect(await forced(db.url, ["ai_app_keys"])).toEqual(["ai_app_keys:true:true"]);
    });
  });
});
