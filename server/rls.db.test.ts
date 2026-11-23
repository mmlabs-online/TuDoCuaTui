// @vitest-environment node
// Row level security (T-019.4, D32), run as the NOSUPERUSER owner role so RLS really applies.
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPool,
  withAppKeys,
  withCreditAdmin,
  withMaintenance,
  withSpendMeter,
  withUser,
} from "./db.js";
import { removeItem, saveItem } from "./items.js";
import { runMigrations } from "./migrator.js";
import { OWNER_A, OWNER_B, OWNER_C } from "./test/auth.js";
import { createTestDb, dbAvailable, type TestDb } from "./test/pg.js";

const realDir = path.resolve(import.meta.dirname, "../db/migrations");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ITEM_A = uuid(1);
const ITEM_B = uuid(2);
const TABLES = ["locations", "items", "item_photos", "wear_logs", "ai_settings"];
const CREDIT_USER_TABLES = ["credit_grants", "credit_ops"];
const READABLE = [...TABLES, ...CREDIT_USER_TABLES, "items_with_stats"];

describe.skipIf(!dbAvailable)("row level security (real Postgres, owner role)", () => {
  let db: TestDb;
  let pool: ReturnType<typeof createPool>;
  let admin: ReturnType<typeof createPool>;
  const count = async (t: string) =>
    (await pool.query(`select count(*)::int as n from ${t}`)).rows[0].n as number;
  const sqlState = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e) => (e as { code?: string }).code,
    );

  beforeAll(async () => {
    db = await createTestDb({ owner: true });
    await runMigrations({ connectionString: db.url, dir: realDir });
    pool = createPool(db.url);
    admin = createPool(db.adminUrl);
  });
  afterAll(async () => {
    await pool?.end();
    await admin?.end();
    await db?.drop();
  });
  beforeEach(async () => {
    await admin.query(
      "truncate wear_logs, item_photos, items, locations, ai_settings, credit_ops, credit_grants, ai_spend_ops, ai_app_keys cascade",
    );
    for (const [u, item, n] of [
      [OWNER_A, ITEM_A, "A"],
      [OWNER_B, ITEM_B, "B"],
    ]) {
      await admin.query("insert into locations (user_id, name) values ($1, $2)", [u, `Tủ ${n}`]);
      await admin.query("insert into items (user_id, id, name) values ($1, $2, $3)", [u, item, n]);
      await admin.query(
        "insert into item_photos (user_id, id, item_id, drive_file_id) values ($1, $2, $3, $4)",
        [u, n === "A" ? uuid(11) : uuid(12), item, `driveFile${n}0001`],
      );
      await admin.query("insert into wear_logs (user_id, item_id, worn_on) values ($1, $2, $3)", [
        u,
        item,
        "2026-03-04",
      ]);
      await admin.query(
        "insert into ai_settings (user_id, provider, model) values ($1, 'claude', 'm')",
        [u],
      );
      await admin.query(
        "insert into credit_grants (user_id, bucket, amount, approved_at) values ($1, 'manual', 5, now())",
        [u],
      );
      await admin.query(
        `insert into credit_ops (user_id, op_key, kind, credits, monthly_part, lasting_part, period, state, expires_at)
         values ($1, 'k1', 'photo_fill', 1, 1, 0, '2026-11', 'reserved', now() + interval '10 minutes')`,
        [u],
      );
    }
    await admin.query(
      `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state)
       values ('2026-11', 'claude', 'claude-haiku-5-5', 'suggest', '2026-11-22', 1500, 'reserved')`,
    );
  });

  it("guard: the test pool's current_user is not a superuser and does not bypass RLS", async () => {
    const r = await pool.query(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );
    expect(r.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it("no GUC: every table and the view return 0 rows", async () => {
    for (const t of [...READABLE, "ai_spend_ops", "ai_app_keys"]) expect(await count(t), t).toBe(0);
  });

  it("withUser(A) sees only A's rows; withUser(B) only B's", async () => {
    for (const [u, n] of [
      [OWNER_A, "A"],
      [OWNER_B, "B"],
    ] as const) {
      await withUser(pool, u, async (c) => {
        for (const t of READABLE) {
          const rows = (await c.query(`select user_id from ${t}`)).rows;
          expect(rows, `${n} ${t}`).toEqual([{ user_id: u }]);
        }
      });
    }
  });

  it("residual GUC: after a committed withUser on a max 1 pool, a plain query sees 0 rows and does not raise", async () => {
    const one = createPool(db.url);
    try {
      const single = new (one.constructor as any)({ connectionString: db.url, max: 1 });
      await withUser(single, OWNER_A, async (c) => {
        expect((await c.query("select 1 from items")).rowCount).toBe(1);
      });
      const r = await single.query("select count(*)::int as n from items");
      expect(r.rows[0].n).toBe(0);
      await single.end();
    } finally {
      await one.end();
    }
  });

  it("writes: no GUC or a foreign user_id -> 42501; foreign rows are invisible to update and delete", async () => {
    const insertItem = (c: { query: Function }, u: string) =>
      c.query("insert into items (user_id, name) values ($1, 'x')", [u]);
    expect(await sqlState(insertItem(pool, OWNER_A))).toBe("42501");
    expect(await sqlState(withUser(pool, OWNER_A, (c) => insertItem(c, OWNER_B)))).toBe("42501");
    expect(
      await sqlState(
        withUser(pool, OWNER_A, (c) =>
          c.query("update items set user_id = $1 where id = $2", [OWNER_B, ITEM_A]),
        ),
      ),
    ).toBe("42501");
    await withUser(pool, OWNER_A, async (c) => {
      expect((await c.query("update items set name = 'z' where id = $1", [ITEM_B])).rowCount).toBe(
        0,
      );
      expect((await c.query("delete from items where id = $1", [ITEM_B])).rowCount).toBe(0);
    });
    expect((await admin.query("select name from items where id = $1", [ITEM_B])).rows).toEqual([
      { name: "B" },
    ]);
  });

  it("a malformed app.user_id fails closed with 22P02", async () => {
    const code = await sqlState(
      (async () => {
        const c = await pool.connect();
        try {
          await c.query("begin");
          await c.query("select set_config('app.user_id', 'x', true)");
          await c.query("select 1 from items");
        } finally {
          await c.query("rollback").catch(() => {});
          c.release();
        }
      })(),
    );
    expect(code).toBe("22P02");
  });

  it("saveItem(B, A's id) -> null via the upsert's WHERE (rowCount 0); A's row and locations are unchanged", async () => {
    const before = (await admin.query("select * from items order by id")).rows;
    const locs = (await admin.query("select * from locations order by name")).rows;
    const r = await saveItem(pool, OWNER_B, ITEM_A, {
      name: "hijack",
      category: "other",
      status: "active",
      location_name: "Tủ mới",
      colors: [],
      seasons: [],
      tags: [],
    });
    expect(r).toBeNull();
    expect((await admin.query("select * from items order by id")).rows).toEqual(before);
    expect((await admin.query("select * from locations order by name")).rows).toEqual(locs);
  });

  it("FK actions under RLS: removeItem cascades photos and wear logs; deleting a location nulls location_id", async () => {
    const photos = await removeItem(pool, OWNER_A, ITEM_A);
    expect(photos).toEqual([{ id: uuid(11), drive_file_id: "driveFileA0001" }]);
    expect(
      (await admin.query("select 1 from item_photos where item_id = $1", [ITEM_A])).rowCount,
    ).toBe(0);
    expect(
      (await admin.query("select 1 from wear_logs where item_id = $1", [ITEM_A])).rowCount,
    ).toBe(0);
    const loc = (await admin.query("select id from locations where user_id = $1", [OWNER_B]))
      .rows[0].id;
    await admin.query("update items set location_id = $1 where id = $2", [loc, ITEM_B]);
    await withUser(pool, OWNER_B, (c) => c.query("delete from locations where id = $1", [loc]));
    expect(
      (await admin.query("select location_id from items where id = $1", [ITEM_B])).rows,
    ).toEqual([{ location_id: null }]);
  });

  it("view: security_invoker is on; another user's item is not returned even by id; wear_count counts own logs", async () => {
    const o = await admin.query(
      "select reloptions from pg_class where relname = 'items_with_stats'",
    );
    expect(o.rows[0].reloptions).toContain("security_invoker=true");
    await withUser(pool, OWNER_B, async (c) => {
      expect(
        (await c.query("select 1 from items_with_stats where id = $1", [ITEM_A])).rowCount,
      ).toBe(0);
      const own = await c.query("select wear_count from items_with_stats where id = $1", [ITEM_B]);
      expect(own.rows).toEqual([{ wear_count: 1 }]);
    });
  });

  describe("credit ledger (F-706.1)", () => {
    it("B cannot select A's credit_grants/credit_ops; insert for A -> 42501; update/delete of A's rows touch 0 rows", async () => {
      await withUser(pool, OWNER_B, async (c) => {
        for (const t of CREDIT_USER_TABLES) {
          const rows = (await c.query(`select user_id from ${t}`)).rows;
          expect(rows, t).toEqual([{ user_id: OWNER_B }]);
          expect((await c.query(`select 1 from ${t} where user_id = $1`, [OWNER_A])).rowCount).toBe(
            0,
          );
        }
        expect(
          (await c.query("update credit_grants set amount = 9 where user_id = $1", [OWNER_A]))
            .rowCount,
        ).toBe(0);
        expect(
          (await c.query("delete from credit_ops where user_id = $1", [OWNER_A])).rowCount,
        ).toBe(0);
      });
      const insertFor = (table: string) =>
        withUser(pool, OWNER_B, (c) =>
          table === "credit_grants"
            ? c.query(
                "insert into credit_grants (user_id, bucket, amount, approved_at) values ($1, 'manual', 5, now())",
                [OWNER_A],
              )
            : c.query(
                `insert into credit_ops (user_id, op_key, kind, credits, monthly_part, lasting_part, period, state, expires_at)
                 values ($1, 'k2', 'photo_fill', 1, 1, 0, '2026-11', 'reserved', now())`,
                [OWNER_A],
              ),
        );
      expect(await sqlState(insertFor("credit_grants"))).toBe("42501");
      expect(await sqlState(insertFor("credit_ops"))).toBe("42501");
      expect(
        (await admin.query("select 1 from credit_grants where user_id = $1", [OWNER_A])).rows,
      ).toHaveLength(1);
      expect(
        (await admin.query("select amount from credit_grants where user_id = $1", [OWNER_A])).rows,
      ).toEqual([{ amount: 5 }]);
    });

    it("credit_settings: readable in any withUser transaction; insert -> 42501; update/delete touch 0 rows", async () => {
      await withUser(pool, OWNER_A, async (c) => {
        expect((await c.query("select 1 from credit_settings")).rowCount).toBe(1);
      });
      expect(
        await sqlState(
          withUser(pool, OWNER_A, (c) =>
            c.query("insert into credit_settings (id) values (false)"),
          ),
        ),
      ).toBe("42501");
      await withUser(pool, OWNER_A, async (c) => {
        expect((await c.query("update credit_settings set monthly_amount = 1")).rowCount).toBe(0);
        expect((await c.query("delete from credit_settings")).rowCount).toBe(0);
      });
      expect((await admin.query("select monthly_amount from credit_settings")).rows).toEqual([
        { monthly_amount: 60 },
      ]);
    });
  });

  it("catalog: every public base table except schema_migrations has RLS, FORCE and a policy", async () => {
    const r = await admin.query(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity,
              (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
          and c.relname <> 'schema_migrations'`,
    );
    expect(r.rows.map((x) => x.relname).sort()).toEqual(
      [...TABLES, ...CREDIT_USER_TABLES, "credit_settings", "ai_spend_ops", "ai_app_keys"].sort(),
    );
    for (const x of r.rows) {
      expect(x.relrowsecurity, x.relname).toBe(true);
      expect(x.relforcerowsecurity, x.relname).toBe(true);
      expect(x.policies, x.relname).toBeGreaterThanOrEqual(1);
    }
  });

  it("pg_policies: owner_only (user tables), the credit user and admin policies, photo_sweep_read and credit_settings_read (SELECT only)", async () => {
    const r = await admin.query(
      `select tablename, policyname, cmd, permissive, qual, with_check from pg_policies
        where schemaname = 'public' order by tablename, policyname`,
    );
    const owner = "(user_id = ( SELECT app_user_id() AS app_user_id))";
    const adminSetting = "current_setting('tudo.maintenance'::text, true) = 'credit-admin'::text";
    const row = (tablename: string) => ({
      tablename,
      policyname: "owner_only",
      cmd: "ALL",
      permissive: "PERMISSIVE",
      qual: owner,
      with_check: owner,
    });
    expect(r.rows).toEqual([
      {
        tablename: "ai_app_keys",
        policyname: "ai_app_keys_delete",
        cmd: "DELETE",
        permissive: "PERMISSIVE",
        qual: "(current_setting('tudo.maintenance'::text, true) = 'app-keys'::text)",
        with_check: null,
      },
      {
        tablename: "ai_app_keys",
        policyname: "ai_app_keys_insert",
        cmd: "INSERT",
        permissive: "PERMISSIVE",
        qual: null,
        with_check: "(current_setting('tudo.maintenance'::text, true) = 'app-keys'::text)",
      },
      {
        tablename: "ai_app_keys",
        policyname: "ai_app_keys_select",
        cmd: "SELECT",
        permissive: "PERMISSIVE",
        qual: "(current_setting('tudo.maintenance'::text, true) = 'app-keys'::text)",
        with_check: null,
      },
      {
        tablename: "ai_app_keys",
        policyname: "ai_app_keys_update",
        cmd: "UPDATE",
        permissive: "PERMISSIVE",
        qual: "(current_setting('tudo.maintenance'::text, true) = 'app-keys'::text)",
        with_check: "(current_setting('tudo.maintenance'::text, true) = 'app-keys'::text)",
      },
      row("ai_settings"),
      {
        tablename: "ai_spend_ops",
        policyname: "ai_spend_read",
        cmd: "SELECT",
        permissive: "PERMISSIVE",
        qual: "(current_setting('tudo.maintenance'::text, true) = 'ai-spend'::text)",
        with_check: null,
      },
      {
        tablename: "ai_spend_ops",
        policyname: "ai_spend_reserve",
        cmd: "INSERT",
        permissive: "PERMISSIVE",
        qual: null,
        with_check:
          "((current_setting('tudo.maintenance'::text, true) = 'ai-spend'::text) AND (state = 'reserved'::text))",
      },
      {
        tablename: "ai_spend_ops",
        policyname: "ai_spend_settle",
        cmd: "UPDATE",
        permissive: "PERMISSIVE",
        qual: "((current_setting('tudo.maintenance'::text, true) = 'ai-spend'::text) AND (state = 'reserved'::text))",
        with_check:
          "((current_setting('tudo.maintenance'::text, true) = 'ai-spend'::text) AND (state = ANY (ARRAY['charged'::text, 'released'::text])))",
      },
      ...[
        [
          "credit_grants",
          "credit_admin_approve",
          "UPDATE",
          `((${adminSetting}) AND (bucket = 'welcome'::text) AND (approved_at IS NULL))`,
          `((${adminSetting}) AND (bucket = 'welcome'::text) AND (approved_at IS NOT NULL))`,
        ],
        [
          "credit_grants",
          "credit_admin_manual",
          "INSERT",
          null,
          `((${adminSetting}) AND (bucket = 'manual'::text) AND (approved_at IS NOT NULL) AND (period IS NULL) AND (grant_key IS NOT NULL))`,
        ],
        ["credit_grants", "credit_admin_read", "SELECT", `(${adminSetting})`, null],
        [
          "credit_grants",
          "credit_grants_user_insert",
          "INSERT",
          null,
          `((user_id = ( SELECT app_user_id() AS app_user_id)) AND (grant_key IS NULL) AND (((bucket = 'monthly'::text) AND (approved_at IS NOT NULL)) OR ((bucket = 'welcome'::text) AND (approved_at IS NULL))))`,
        ],
        ["credit_grants", "credit_grants_user_read", "SELECT", owner, null],
        ["credit_ops", "credit_ops_user_insert", "INSERT", null, owner],
        ["credit_ops", "credit_ops_user_read", "SELECT", owner, null],
        ["credit_ops", "credit_ops_user_update", "UPDATE", owner, owner],
        [
          "credit_settings",
          "credit_admin_settings",
          "UPDATE",
          `(${adminSetting})`,
          `(${adminSetting})`,
        ],
      ].map(([tablename, policyname, cmd, qual, with_check]) => ({
        tablename,
        policyname,
        cmd,
        permissive: "PERMISSIVE",
        qual,
        with_check,
      })),
      {
        tablename: "credit_settings",
        policyname: "credit_settings_read",
        cmd: "SELECT",
        permissive: "PERMISSIVE",
        qual: "true",
        with_check: null,
      },
      row("item_photos"),
      {
        tablename: "item_photos",
        policyname: "photo_sweep_read",
        cmd: "SELECT",
        permissive: "PERMISSIVE",
        qual: "(current_setting('tudo.maintenance'::text, true) = 'photo-sweep'::text)",
        with_check: null,
      },
      row("items"),
      row("locations"),
      row("wear_logs"),
    ]);
  });

  describe("maintenance (photo sweep)", () => {
    it("withMaintenance sees both users' item_photos and the one credit_settings row, and nothing else", async () => {
      await withMaintenance(pool, "photo-sweep", async (c) => {
        expect((await c.query("select 1 from item_photos")).rowCount).toBe(2);
        expect((await c.query("select 1 from credit_settings")).rowCount).toBe(1);
        expect((await c.query("select 1 from ai_spend_ops")).rowCount).toBe(0);
        for (const t of ["items", "locations", "wear_logs", "ai_settings", ...CREDIT_USER_TABLES]) {
          expect((await c.query(`select 1 from ${t}`)).rowCount, t).toBe(0);
        }
      });
    });

    it("the policy is SELECT-only: insert -> 42501, update and delete touch no row", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("select set_config('tudo.maintenance', 'photo-sweep', true)");
        expect(
          await sqlState(
            c.query(
              "insert into item_photos (user_id, item_id, drive_file_id) values ($1, $2, 'driveFileX0001')",
              [OWNER_A, ITEM_A],
            ),
          ),
        ).toBe("42501");
        await c.query("rollback");
        await c.query("begin");
        await c.query("select set_config('tudo.maintenance', 'photo-sweep', true)");
        expect((await c.query("update item_photos set is_primary = false")).rowCount).toBe(0);
        expect((await c.query("delete from item_photos")).rowCount).toBe(0);
        await c.query("rollback");
      } finally {
        c.release();
      }
    });

    it("any other tudo.maintenance value reads 0 rows", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("select set_config('tudo.maintenance', 'other', true)");
        expect((await c.query("select 1 from item_photos")).rowCount).toBe(0);
        await c.query("rollback");
      } finally {
        c.release();
      }
    });
  });

  describe("spend meter (F-706.2)", () => {
    it("withSpendMeter reads the seeded row, inserts reserved, cannot insert charged, settles, cannot delete", async () => {
      await withSpendMeter(pool, async (c: any) => {
        expect((await c.query("select * from ai_spend_ops")).rowCount).toBe(1);

        const ins = await c.query(
          `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state)
           values ('2026-11', 'gemini', 'gemini-2.5-flash', 'photo_fill', '2026-11-22', 1000, 'reserved')
           returning id`,
        );
        expect(ins.rowCount).toBe(1);
        const newId = ins.rows[0].id;

        // Updates reserved -> charged
        const upd = await c.query(
          "update ai_spend_ops set state = 'charged', settled_at = now() where id = $1",
          [newId],
        );
        expect(upd.rowCount).toBe(1);

        // Updating a charged row back to reserved touches 0 rows (using clause forbids)
        const back = await c.query(
          "update ai_spend_ops set state = 'reserved', settled_at = null where id = $1",
          [newId],
        );
        expect(back.rowCount).toBe(0);

        // Delete touches 0 rows (no policy)
        const del = await c.query("delete from ai_spend_ops where id = $1", [newId]);
        expect(del.rowCount).toBe(0);

        // User tables read 0 rows
        for (const t of ["items", "locations", "wear_logs", "ai_settings", ...CREDIT_USER_TABLES]) {
          expect((await c.query(`select 1 from ${t}`)).rowCount, t).toBe(0);
        }
      });

      // Inserting a charged row -> 42501 (separate transaction so main isn't aborted)
      await expect(
        withSpendMeter(pool, (c: any) =>
          c.query(
            `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state, settled_at)
             values ('2026-11', 'gemini', 'gemini-2.5-flash', 'photo_fill', '2026-11-22', 1000, 'charged', now())`,
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });

    it("any other tudo.maintenance value reads 0 ai_spend_ops rows and cannot insert", async () => {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("select set_config('tudo.maintenance', 'photo-sweep', true)");
        expect((await c.query("select 1 from ai_spend_ops")).rowCount).toBe(0);
        await expect(
          c.query(
            `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state)
             values ('2026-11', 'gemini', 'gemini-2.5-flash', 'photo_fill', '2026-11-22', 1000, 'reserved')`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await c.query("rollback");

        await c.query("begin");
        await c.query("select set_config('tudo.maintenance', 'other', true)");
        expect((await c.query("select 1 from ai_spend_ops")).rowCount).toBe(0);
        await expect(
          c.query(
            `insert into ai_spend_ops (period, provider, model, kind, price_version, estimate_micro_usd, state)
             values ('2026-11', 'gemini', 'gemini-2.5-flash', 'photo_fill', '2026-11-22', 1000, 'reserved')`,
          ),
        ).rejects.toMatchObject({ code: "42501" });
        await c.query("rollback");
      } finally {
        c.release();
      }
    });
  });

  describe("app keys (F-706.3)", () => {
    it("withAppKeys can CRUD; withUser reads 0 rows and cannot write; other maintenance cannot access", async () => {
      await withAppKeys(pool, async (c: any) => {
        expect((await c.query("select * from ai_app_keys")).rowCount).toBe(0);

        const ins = await c.query(
          "insert into ai_app_keys (provider, key_ciphertext, key_hint) values ('claude', 'cipher1', 'hint1') returning *",
        );
        expect(ins.rowCount).toBe(1);

        const sel = await c.query("select * from ai_app_keys where provider = 'claude'");
        expect(sel.rowCount).toBe(1);
        expect(sel.rows[0].key_hint).toBe("hint1");

        const upd = await c.query(
          "update ai_app_keys set key_hint = 'hint2' where provider = 'claude' returning *",
        );
        expect(upd.rowCount).toBe(1);
        expect(upd.rows[0].key_hint).toBe("hint2");

        const del = await c.query("delete from ai_app_keys where provider = 'claude'");
        expect(del.rowCount).toBe(1);

        // User tables read 0 rows
        for (const t of ["items", "locations", "wear_logs", "ai_settings", ...CREDIT_USER_TABLES]) {
          expect((await c.query(`select 1 from ${t}`)).rowCount, t).toBe(0);
        }
      });

      // Seed a row directly with admin
      await admin.query(
        "insert into ai_app_keys (provider, key_ciphertext, key_hint) values ('gemini', 'cg', 'hg')",
      );

      // withUser sees 0 rows and fails on write with 42501
      await withUser(pool, OWNER_A, async (c) => {
        expect((await c.query("select * from ai_app_keys")).rowCount).toBe(0);
      });
      await expect(
        withUser(pool, OWNER_A, (c) =>
          c.query(
            "insert into ai_app_keys (provider, key_ciphertext, key_hint) values ('claude', 'cx', 'hx')",
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });

      // Other maintenance (e.g. photo-sweep or ai-spend) sees 0 rows
      await withMaintenance(pool, "photo-sweep", async (c) => {
        expect((await c.query("select * from ai_app_keys")).rowCount).toBe(0);
      });
      await withSpendMeter(pool, async (c: any) => {
        expect((await c.query("select * from ai_app_keys")).rowCount).toBe(0);
      });
    });
  });

  describe("credit admin (F-706.5)", () => {
    const addWelcome = (u: string, approved: boolean) =>
      admin.query(
        `insert into credit_grants (user_id, bucket, amount, approved_at)
         values ($1, 'welcome', 300, ${approved ? "now()" : "null"})`,
        [u],
      );
    const adminTx = <T>(fn: (c: any) => Promise<T>) => withCreditAdmin(pool, fn);
    const MANUAL = `insert into credit_grants (user_id, bucket, amount, approved_at, grant_key)
                    values ($1, 'manual', 7, now(), $2)`;

    it("withCreditAdmin selects both users' grants and inserts a manual grant (with key) for another user", async () => {
      await adminTx(async (c) => {
        expect((await c.query("select 1 from credit_grants")).rowCount).toBe(2);
        expect((await c.query(MANUAL, [OWNER_A, "k1"])).rowCount).toBe(1);
      });
      expect(
        (await admin.query("select 1 from credit_grants where grant_key = 'k1'")).rowCount,
      ).toBe(1);
    });

    it("cannot insert welcome, monthly, a manual grant without approved_at, or a manual grant without grant_key (42501)", async () => {
      const bad = [
        "insert into credit_grants (user_id, bucket, amount) values ($1, 'welcome', 5)",
        "insert into credit_grants (user_id, bucket, period, amount, approved_at) values ($1, 'monthly', '2026-11', 5, now())",
        "insert into credit_grants (user_id, bucket, amount, grant_key) values ($1, 'manual', 5, 'k')",
        "insert into credit_grants (user_id, bucket, amount, approved_at) values ($1, 'manual', 5, now())",
      ];
      for (const sql of bad) {
        expect(await sqlState(adminTx((c) => c.query(sql, [OWNER_A]))), sql).toBe("42501");
      }
    });

    it("approves a pending welcome (1 row) and touches 0 rows on approved welcome, monthly and manual rows", async () => {
      await addWelcome(OWNER_A, false);
      await addWelcome(OWNER_B, true);
      await admin.query(
        "insert into credit_grants (user_id, bucket, period, amount, approved_at) values ($1, 'monthly', '2026-11', 5, now())",
        [OWNER_B],
      );
      await adminTx(async (c) => {
        const touch = (bucket: string, who: string) =>
          c.query(
            "update credit_grants set approved_at = now() where user_id = $1 and bucket = $2",
            [who, bucket],
          );
        expect((await touch("welcome", OWNER_B)).rowCount).toBe(0);
        expect((await touch("monthly", OWNER_B)).rowCount).toBe(0);
        expect((await touch("manual", OWNER_B)).rowCount).toBe(0);
        expect((await touch("welcome", OWNER_A)).rowCount).toBe(1);
      });
      expect(
        (
          await admin.query(
            "select approved_at is not null as ok from credit_grants where user_id = $1 and bucket = 'welcome'",
            [OWNER_A],
          )
        ).rows,
      ).toEqual([{ ok: true }]);
    });

    it("delete touches 0 rows; credit_ops is invisible; credit_settings updates but insert -> 42501 and delete touches 0 rows", async () => {
      await adminTx(async (c) => {
        expect((await c.query("delete from credit_grants")).rowCount).toBe(0);
        expect((await c.query("select 1 from credit_ops")).rowCount).toBe(0);
        expect((await c.query("update credit_ops set state = 'refunded'")).rowCount).toBe(0);
        expect((await c.query("delete from credit_settings")).rowCount).toBe(0);
        expect((await c.query("update credit_settings set monthly_amount = 61")).rowCount).toBe(1);
      });
      expect(
        await sqlState(adminTx((c) => c.query("insert into credit_settings (id) values (false)"))),
      ).toBe("42501");
      await admin.query("update credit_settings set monthly_amount = 60");
    });

    it("user side (note 10): cannot approve own welcome, write a manual grant, insert an approved welcome, or delete grants and ops; credit_settings is read-only", async () => {
      await addWelcome(OWNER_A, false);
      await withUser(pool, OWNER_A, async (c) => {
        expect(
          (await c.query("update credit_grants set approved_at = now() where bucket = 'welcome'"))
            .rowCount,
        ).toBe(0);
        expect((await c.query("update credit_grants set amount = 9")).rowCount).toBe(0);
        expect((await c.query("delete from credit_grants")).rowCount).toBe(0);
        expect((await c.query("delete from credit_ops")).rowCount).toBe(0);
        expect((await c.query("update credit_settings set monthly_amount = 1")).rowCount).toBe(0);
      });
      const insertAs = (sql: string) =>
        sqlState(withUser(pool, OWNER_A, (c) => c.query(sql, [OWNER_A])));
      expect(
        await insertAs(
          "insert into credit_grants (user_id, bucket, amount, approved_at) values ($1, 'manual', 5, now())",
        ),
      ).toBe("42501");
      expect(
        await insertAs(
          "insert into credit_grants (user_id, bucket, amount, approved_at) values ($1, 'welcome', 5, now())",
        ),
      ).toBe("42501");
      expect(
        await insertAs(
          "insert into credit_grants (user_id, bucket, period, amount, approved_at, grant_key) values ($1, 'monthly', '2026-11', 5, now(), 'k')",
        ),
      ).toBe("42501");
    });

    it("withMaintenance('photo-sweep'), withSpendMeter and withAppKeys see no credit_grants rows and cannot write them", async () => {
      const insert =
        "insert into credit_grants (user_id, bucket, amount, approved_at, grant_key) values ($1, 'manual', 5, now(), 'k')";
      await withMaintenance(pool, "photo-sweep", async (c) => {
        expect((await c.query("select 1 from credit_grants")).rowCount).toBe(0);
      });
      await withSpendMeter(pool, async (c: any) => {
        expect((await c.query("select 1 from credit_grants")).rowCount).toBe(0);
      });
      await withAppKeys(pool, async (c: any) => {
        expect((await c.query("select 1 from credit_grants")).rowCount).toBe(0);
      });
      expect(await sqlState(withSpendMeter(pool, (c: any) => c.query(insert, [OWNER_A])))).toBe(
        "42501",
      );
      expect(await sqlState(withAppKeys(pool, (c: any) => c.query(insert, [OWNER_A])))).toBe(
        "42501",
      );
    });

    it("guard trigger: even the table owner cannot change amount, user_id, bucket, period, grant_key or clear approved_at; approving a pending welcome works", async () => {
      await addWelcome(OWNER_A, false);
      await admin.query(MANUAL, [OWNER_A, "gk"]);
      const code = (sql: string) => sqlState(admin.query(sql));
      expect(
        await code("update credit_grants set amount = amount + 1 where bucket = 'manual'"),
      ).toBe("23514");
      expect(
        await code(`update credit_grants set user_id = '${OWNER_C}' where bucket = 'manual'`),
      ).toBe("23514");
      expect(
        await code("update credit_grants set grant_key = 'other' where bucket = 'manual'"),
      ).toBe("23514");
      expect(
        await code("update credit_grants set approved_at = null where bucket = 'manual'"),
      ).toBe("23514");
      expect(await code("update credit_grants set amount = 1 where bucket = 'welcome'")).toBe(
        "23514",
      );
      expect(
        await code("update credit_grants set approved_at = now() where bucket = 'welcome'"),
      ).toBe("ok");
      expect(
        await code("update credit_grants set approved_at = now() where bucket = 'welcome'"),
      ).toBe("23514");
    });
  });
});
