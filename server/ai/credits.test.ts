// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_A } from "../test/auth.js";
import { fakePool } from "../test/fake-pool.js";
import { CREDIT_PRICES } from "./creditMath.js";
import { createCreditLedger } from "./credits.js";

const server = path.resolve(import.meta.dirname, "..");
const root = path.resolve(server, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules") return [];
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("credit ledger (no database)", () => {
  const pool = {
    query: () => Promise.reject(new Error("pool touched")),
    connect: () => Promise.reject(new Error("pool touched")),
  };
  const ledger = createCreditLedger(pool);

  it("reserve/commit/refund/balance throw on a non-canonical userId, an invalid opKey or an unknown kind before touching the pool", async () => {
    await expect(ledger.reserve("nope", "k1", "sticker")).rejects.toThrow("userId required");
    await expect(ledger.reserve(OWNER_A, "bad key", "sticker")).rejects.toThrow("invalid opKey");
    await expect(ledger.reserve(OWNER_A, "k1", "toString")).rejects.toThrow("unknown kind");
    await expect(ledger.commit("nope", "k1")).rejects.toThrow("userId required");
    await expect(ledger.commit(OWNER_A, "")).rejects.toThrow("invalid opKey");
    await expect(ledger.refund(OWNER_A, "đ")).rejects.toThrow("invalid opKey");
    await expect(ledger.balance("NOPE")).rejects.toThrow("userId required");
  });

  it("migration kind check lists exactly Object.keys(CREDIT_PRICES)", () => {
    const dir = path.join(root, "db/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_credit_ledger.sql"));
    expect(file).toBeDefined();
    const sql = readFileSync(path.join(dir, file as string), "utf8");
    const m = /check \(kind in \(([^)]*)\)\)/.exec(sql);
    expect(m).not.toBeNull();
    const kinds = (m as RegExpExecArray)[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect([...kinds].sort()).toEqual(Object.keys(CREDIT_PRICES).sort());
  });

  it("only app.js and paidCall.js import credits.js (F-706.4), and only credits.js imports creditMath.js", () => {
    const files = [...walk(server), ...walk(path.join(root, "src"))].filter(
      (f) => /\.(js|ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );
    const importers = (name: string) =>
      files.filter((f) =>
        new RegExp(`from\\s+["'][^"']*/${name}\\.js["']`).test(readFileSync(f, "utf8")),
      );
    expect(
      importers("credits")
        .map((f) => path.basename(f))
        .sort(),
    ).toEqual(["app.js", "paidCall.js"]);
    expect(importers("creditMath").map((f) => path.basename(f))).toEqual(["credits.js"]);
  });

  it("backup.js never mentions credit_", () => {
    expect(readFileSync(path.join(server, "backup.js"), "utf8")).not.toMatch(/credit_/);
  });
});

describe("credit ledger settle arguments (fake pool)", () => {
  const op = {
    op_key: "k1",
    kind: "photo_fill",
    credits: 1,
    monthly_part: 1,
    lasting_part: 0,
    period: "2026-11",
    state: "committed",
    expires_at: new Date(Date.now() + 60_000),
    request_hash: "a".repeat(64),
    result: { suggestion: { name: null } },
    error_code: null,
  };
  const run = async (fn: (l: ReturnType<typeof createCreditLedger>) => Promise<unknown>) => {
    const seen: { sql: string; params: unknown[] }[] = [];
    const pool = fakePool({
      query: async (sql: string, params: unknown[]) => {
        seen.push({ sql, params });
        return { rows: sql.includes("update credit_ops") ? [op] : [] };
      },
    });
    const out = await fn(createCreditLedger(pool as never));
    return { out, update: seen.find((s) => s.sql.includes("update credit_ops")) };
  };

  it("commit writes the request hash and the JSON result in the same UPDATE and returns them", async () => {
    const hash = "a".repeat(64);
    const { out, update } = await run((l) =>
      l.commit(OWNER_A, "k1", { requestHash: hash, result: op.result }),
    );
    expect(update?.params.slice(4)).toEqual([hash, JSON.stringify(op.result), null]);
    expect(out).toMatchObject({
      status: "committed",
      op: { requestHash: hash, result: op.result, errorCode: null },
    });
  });

  it("refund writes the error code; a plain commit or refund stores nulls", async () => {
    const a = await run((l) => l.refund(OWNER_A, "k1", { errorCode: "provider_unavailable" }));
    expect(a.update?.params.slice(4)).toEqual([null, null, "provider_unavailable"]);
    const b = await run((l) => l.commit(OWNER_A, "k1"));
    expect(b.update?.params.slice(4)).toEqual([null, null, null]);
  });
});
