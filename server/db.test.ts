// @vitest-environment node
import pg from "pg";
import { describe, expect, it } from "vitest";
import { createPool, ping } from "./db.js";

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
