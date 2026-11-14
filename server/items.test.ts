// @vitest-environment node
import { describe, expect, it } from "vitest";
import { saveItem } from "./items.js";
import { fakePool } from "./test/fake-pool.js";

const UID = "aaaaaaaa-1111-4111-8111-111111111111";
const V = { name: "x", category: "other", status: "active" };

function pool(code: string) {
  const sent: string[] = [];
  const p = fakePool({
    query: async (sql: string) => {
      sent.push(sql);
      if (sql.startsWith("insert into items")) {
        throw Object.assign(new Error("rls"), { code });
      }
      return { rows: [], rowCount: 0 };
    },
  });
  return { p, sent };
}

describe("saveItem error mapping", () => {
  it("a 42501 from the item upsert -> null, rollback sent, commit not, client released", async () => {
    const { p } = pool("42501");
    const calls: string[] = [];
    const conn = p.connect;
    p.connect = async () => {
      const c = await conn();
      const q = c.query;
      c.query = async (sql: string, params?: unknown[]) => (calls.push(sql), q(sql, params));
      return c;
    };
    await expect(saveItem(p as never, UID as never, "i1", V)).resolves.toBeNull();
    expect(calls).toContain("rollback");
    expect(calls).not.toContain("commit");
    expect(p.released).toHaveLength(1);
  });

  it("another error code is rethrown", async () => {
    const { p } = pool("23505");
    await expect(saveItem(p as never, UID as never, "i1", V)).rejects.toMatchObject({
      code: "23505",
    });
    expect(p.released).toHaveLength(1);
  });
});
