import { describe, expect, it } from "vitest";
import { createAiStore, type DbClient, type Query, type QueryResult } from "./store";

const UID = "11111111-1111-4111-8111-111111111111";

function fakeClient(result: Partial<QueryResult> = {}) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const client: DbClient = {
    from(table) {
      const rec = { table, ops: [] as [string, unknown[]][] };
      calls.push(rec);
      const q: Query = new Proxy({} as Query, {
        get(_t, prop: string) {
          if (prop === "then") {
            return (ok: (r: QueryResult) => unknown) => ok({ data: null, error: null, ...result });
          }
          return (...args: unknown[]) => {
            rec.ops.push([prop, args]);
            return q;
          };
        },
      });
      return q;
    },
  };
  return { client, calls };
}

const eqUid = (ops: [string, unknown[]][]) =>
  ops.some(([n, a]) => n === "eq" && a[0] === "user_id" && a[1] === UID);

describe("store", () => {
  it("getView filters by user and never selects the ciphertext", async () => {
    const { client, calls } = fakeClient({
      data: { provider: "claude", model: "m", key_hint: "abcd", updated_at: "t" },
    });
    const view = await createAiStore(client).getView(UID);
    expect(view).toEqual({ provider: "claude", model: "m", keyHint: "abcd", updatedAt: "t" });
    expect(eqUid(calls[0].ops)).toBe(true);
    const select = calls[0].ops.find(([n]) => n === "select")![1][0] as string;
    expect(select).not.toContain("key_ciphertext");
  });

  it("returns null when there is no row", async () => {
    const { client } = fakeClient();
    const s = createAiStore(client);
    expect(await s.getView(UID)).toBeNull();
    expect(await s.getSecret(UID)).toBeNull();
  });

  it("getSecret reads the ciphertext for the user", async () => {
    const { client, calls } = fakeClient({
      data: {
        provider: "claude",
        model: "m",
        key_ciphertext: "v1:x",
        key_hint: "abcd",
        key_updated_at: "t",
      },
    });
    expect(await createAiStore(client).getSecret(UID)).toMatchObject({ keyCiphertext: "v1:x" });
    expect(eqUid(calls[0].ops)).toBe(true);
  });

  it("upsert targets the user_id conflict key", async () => {
    const { client, calls } = fakeClient();
    await createAiStore(client).upsert(UID, {
      provider: "claude",
      model: "m",
      keyCiphertext: "v1:x",
      keyHint: "abcd",
      keyUpdatedAt: "t",
    });
    const [name, args] = calls[0].ops[0];
    expect(name).toBe("upsert");
    expect((args[0] as { user_id: string }).user_id).toBe(UID);
    expect(args[1]).toEqual({ onConflict: "user_id" });
  });

  it("clearKey nulls ciphertext, hint and key_updated_at for the user", async () => {
    const { client, calls } = fakeClient();
    await createAiStore(client).clearKey(UID);
    expect(calls[0].ops[0]).toEqual([
      "update",
      [{ key_ciphertext: null, key_hint: null, key_updated_at: null }],
    ]);
    expect(eqUid(calls[0].ops)).toBe(true);
  });

  it("call methods are filtered by user", async () => {
    const { client, calls } = fakeClient({ count: 3 });
    const s = createAiStore(client);
    expect(await s.countCalls(UID, "test", "since")).toBe(3);
    await s.recordCall(UID, "test");
    await s.pruneCalls(UID, "before");
    expect(eqUid(calls[0].ops)).toBe(true);
    expect(calls[1].ops[0]).toEqual(["insert", [{ user_id: UID, kind: "test" }]]);
    expect(eqUid(calls[2].ops)).toBe(true);
  });

  it("a store error throws without leaking its message", async () => {
    const { client } = fakeClient({ error: { message: "secret detail" } });
    await expect(createAiStore(client).getView(UID)).rejects.toThrow("store_error");
    await expect(createAiStore(client).getView(UID)).rejects.not.toThrow("secret detail");
  });

  it("treats a missing count as zero", async () => {
    const { client } = fakeClient();
    expect(await createAiStore(client).countCalls(UID, "test", "s")).toBe(0);
  });
});
