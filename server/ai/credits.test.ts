// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_A } from "../test/auth.js";
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

  it("inert: no non-test file under server/ or src/ imports credits.js, and only credits.js imports creditMath.js", () => {
    const files = [...walk(server), ...walk(path.join(root, "src"))].filter(
      (f) => /\.(js|ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );
    const importers = (name: string) =>
      files.filter((f) =>
        new RegExp(`from\\s+["'][^"']*/${name}\\.js["']`).test(readFileSync(f, "utf8")),
      );
    expect(importers("credits")).toEqual([]);
    expect(importers("creditMath").map((f) => path.basename(f))).toEqual(["credits.js"]);
  });

  it("backup.js never mentions credit_", () => {
    expect(readFileSync(path.join(server, "backup.js"), "utf8")).not.toMatch(/credit_/);
  });
});
