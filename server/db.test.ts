// @vitest-environment node
import pg from "pg";
import { describe, expect, it } from "vitest";
import {
  createPool,
  ping,
  withCreditAdmin,
  withMaintenance,
  withSpendMeter,
  withUser,
} from "./db.js";

describe("createPool", () => {
  it("options: max 5, connectionTimeoutMillis 3000, idleTimeoutMillis 30000, statement_timeout 5000, application_name tudocuatui-api", async () => {
    const pool = createPool("postgres://u:p@127.0.0.1:1/d");
    const o = pool.options as unknown as Record<string, unknown>;
    expect(o.max).toBe(5);
    expect(o.connectionTimeoutMillis).toBe(3000);
    expect(o.idleTimeoutMillis).toBe(30000);
    expect(o.statement_timeout).toBe(5000);
    expect(o.application_name).toBe("tudocuatui-api");
    await pool.end();
  });

  it("date parser returns the raw string; other OIDs keep pg defaults; global parsers untouched", async () => {
    const pool = createPool("postgres://u:p@127.0.0.1:1/d");
    const types = (
      pool.options as {
        types: { getTypeParser: (oid: number, f?: string) => (v: string) => unknown };
      }
    ).types;
    expect(types.getTypeParser(1082)("2026-01-02")).toBe("2026-01-02");
    expect(types.getTypeParser(23)("42")).toBe(42);
    expect(pg.types.getTypeParser(1082 as never)("2026-01-02")).toBeInstanceOf(Date);
    await pool.end();
  });

  it("pool errors are logged by code only", async () => {
    const entries: Record<string, unknown>[] = [];
    const pool = createPool("postgres://u:p@127.0.0.1:1/d", (e) => entries.push(e));
    pool.emit("error", Object.assign(new Error("password=hunter2"), { code: "ECONNRESET" }));
    expect(entries).toEqual([{ event: "pool_error", code: "ECONNRESET" }]);
    await pool.end();
  });

  it("ping runs select 1", async () => {
    const calls: string[] = [];
    await ping({ query: async (s: string) => void calls.push(s) });
    expect(calls).toEqual(["select 1"]);
  });
});

const UID = "aaaaaaaa-1111-4111-8111-111111111111";

function fakeClientPool(opts: { failOn?: string; rollbackFails?: boolean } = {}) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const released: unknown[] = [];
  let connects = 0;
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql === opts.failOn) throw new Error("boom");
      if (sql === "rollback" && opts.rollbackFails) throw new Error("rollback failed");
      return { rows: [], rowCount: 0 };
    },
    release: (err?: unknown) => void released.push(err),
  };
  const pool = {
    connect: async () => {
      connects++;
      return client;
    },
  };
  return { pool, calls, released, connects: () => connects };
}

describe("withUser", () => {
  it("begin -> set_config(app.user_id) -> fn -> commit -> release()", async () => {
    const { pool, calls, released } = fakeClientPool();
    const r = await withUser(pool, UID, async (c) => {
      await c.query("select 1");
      return 42;
    });
    expect(r).toBe(42);
    expect(calls).toEqual([
      { sql: "begin", params: undefined },
      {
        sql: "select set_config('app.user_id', $1, true), set_config('tudo.maintenance', '', true)",
        params: [UID],
      },
      { sql: "select 1", params: undefined },
      { sql: "commit", params: undefined },
    ]);
    expect(released).toEqual([undefined]);
  });

  it("readOnly sends begin read only", async () => {
    const { pool, calls } = fakeClientPool();
    await withUser(pool, UID, async () => {}, { readOnly: true });
    expect(calls[0].sql).toBe("begin read only");
  });

  it("fn throws -> rollback, release(err), the error is rethrown; a rollback failure is swallowed", async () => {
    const { pool, calls, released } = fakeClientPool({ rollbackFails: true });
    const err = new Error("fn failed");
    await expect(
      withUser(pool, UID, async () => {
        throw err;
      }),
    ).rejects.toBe(err);
    expect(calls.map((c) => c.sql)).toContain("rollback");
    expect(calls.map((c) => c.sql)).not.toContain("commit");
    expect(released).toEqual([err]);
  });

  it("a commit answered with the ROLLBACK tag is an error; a throwing release() does not roll back or release twice", async () => {
    const calls: string[] = [];
    let releases = 0;
    const client = {
      query: async (sql: string) => {
        calls.push(sql);
        return sql === "commit" ? { command: "ROLLBACK" } : { rows: [] };
      },
      release: () => void releases++,
    };
    await expect(withUser({ connect: async () => client }, UID, async () => 1)).rejects.toThrow(
      "transaction was rolled back",
    );
    expect(calls).toContain("rollback");
    expect(releases).toBe(1);

    const calls2: string[] = [];
    let releases2 = 0;
    const bad = {
      query: async (sql: string) => (calls2.push(sql), { rows: [] }),
      release: () => {
        releases2++;
        throw new Error("release failed");
      },
    };
    await expect(withUser({ connect: async () => bad }, UID, async () => 1)).rejects.toThrow(
      "release failed",
    );
    expect(calls2).not.toContain("rollback");
    expect(releases2).toBe(1);
  });

  it("begin fails -> release(err)", async () => {
    const { pool, released } = fakeClientPool({ failOn: "begin" });
    await expect(withUser(pool, UID, async () => {})).rejects.toThrow("boom");
    expect(released).toHaveLength(1);
    expect(released[0]).toBeInstanceOf(Error);
  });

  it("rejects undefined, empty, uppercase and nil ids and a pool without connect() before any connect", async () => {
    const { pool, connects } = fakeClientPool();
    for (const bad of [undefined, "", UID.toUpperCase(), "00000000-0000-0000-0000-000000000000"]) {
      await expect(withUser(pool, bad as never, async () => {})).rejects.toThrow("userId required");
    }
    await expect(withUser({} as never, UID, async () => {})).rejects.toThrow(
      "pool has no connect()",
    );
    expect(connects()).toBe(0);
  });

  it("a nested withUser or withMaintenance inside fn throws without a second connect", async () => {
    const { pool, connects } = fakeClientPool();
    await expect(withUser(pool, UID, () => withUser(pool, UID, async () => {}))).rejects.toThrow(
      "nested transaction",
    );
    await expect(
      withUser(pool, UID, () => withMaintenance(pool, "photo-sweep", async () => {})),
    ).rejects.toThrow("nested transaction");
    expect(connects()).toBe(2);
  });
});

describe("withMaintenance", () => {
  it("accepts only photo-sweep, sets tudo.maintenance and begins read only", async () => {
    const { pool, calls, connects } = fakeClientPool();
    await expect(withMaintenance(pool, "other", async () => {})).rejects.toThrow(
      "unknown maintenance task",
    );
    expect(connects()).toBe(0);
    await withMaintenance(pool, "photo-sweep", async () => {});
    expect(calls.slice(0, 2)).toEqual([
      { sql: "begin read only", params: undefined },
      {
        sql: "select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)",
        params: ["photo-sweep"],
      },
    ]);
    expect(calls.at(-1)?.sql).toBe("commit");
  });
});

describe("withSpendMeter", () => {
  it("begins read-write, sets tudo.maintenance='ai-spend', clears app.user_id, commits; { readOnly: true } begins read only", async () => {
    const { pool, calls } = fakeClientPool();
    await withSpendMeter(pool, async () => {});
    expect(calls.slice(0, 2)).toEqual([
      { sql: "begin", params: undefined },
      {
        sql: "select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)",
        params: ["ai-spend"],
      },
    ]);
    expect(calls.at(-1)?.sql).toBe("commit");

    const ro = fakeClientPool();
    await withSpendMeter(ro.pool, async () => {}, { readOnly: true });
    expect(ro.calls.slice(0, 2)).toEqual([
      { sql: "begin read only", params: undefined },
      {
        sql: "select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)",
        params: ["ai-spend"],
      },
    ]);
    expect(ro.calls.at(-1)?.sql).toBe("commit");
  });

  it("nested withSpendMeter inside withUser (and vice versa) throws nested transaction without a second connect", async () => {
    const { pool, connects } = fakeClientPool();
    await expect(withUser(pool, UID, () => withSpendMeter(pool, async () => {}))).rejects.toThrow(
      "nested transaction",
    );
    await expect(withSpendMeter(pool, () => withUser(pool, UID, async () => {}))).rejects.toThrow(
      "nested transaction",
    );
    expect(connects()).toBe(2);
  });

  it("withMaintenance(pool, 'ai-spend', ...) throws unknown maintenance task", async () => {
    const { pool, connects } = fakeClientPool();
    await expect(withMaintenance(pool, "ai-spend", async () => {})).rejects.toThrow(
      "unknown maintenance task",
    );
    expect(connects()).toBe(0);
  });
});

describe("withCreditAdmin", () => {
  const SET =
    "select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)";

  it("begins read-write, sets tudo.maintenance='credit-admin', clears app.user_id, commits; { readOnly: true } begins read only", async () => {
    const { pool, calls } = fakeClientPool();
    await withCreditAdmin(pool, async () => {});
    expect(calls.slice(0, 2)).toEqual([
      { sql: "begin", params: undefined },
      { sql: SET, params: ["credit-admin"] },
    ]);
    expect(calls.at(-1)?.sql).toBe("commit");

    const ro = fakeClientPool();
    await withCreditAdmin(ro.pool, async () => {}, { readOnly: true });
    expect(ro.calls.slice(0, 2)).toEqual([
      { sql: "begin read only", params: undefined },
      { sql: SET, params: ["credit-admin"] },
    ]);
  });

  it("nested inside withUser (and vice versa) throws nested transaction", async () => {
    const { pool, connects } = fakeClientPool();
    await expect(withUser(pool, UID, () => withCreditAdmin(pool, async () => {}))).rejects.toThrow(
      "nested transaction",
    );
    await expect(withCreditAdmin(pool, () => withUser(pool, UID, async () => {}))).rejects.toThrow(
      "nested transaction",
    );
    expect(connects()).toBe(2);
  });
});
