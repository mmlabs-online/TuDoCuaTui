// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSpendMeter } from "./spend.js";
import { KIND_CEILINGS } from "./spendPrices.js";

const aiDir = import.meta.dirname;
const server = path.resolve(aiDir, "..");
const root = path.resolve(server, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules") return [];
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("spend meter (no database)", () => {
  const pool = {
    query: () => Promise.reject(new Error("pool touched")),
    connect: () => Promise.reject(new Error("pool touched")),
  };
  const meter = createSpendMeter(pool);

  it("reserve throws on a non-object, a non-string provider/model, an unknown kind, or any extra key before touching the pool", async () => {
    await expect(meter.reserve(null as never)).rejects.toThrow("reserve requires options object");
    await expect(meter.reserve([] as never)).rejects.toThrow("reserve requires options object");
    await expect(
      meter.reserve({ provider: 123 as never, model: "m", kind: "suggest" }),
    ).rejects.toThrow("provider and model must be strings");
    await expect(
      meter.reserve({ provider: "gemini", model: 123 as never, kind: "suggest" }),
    ).rejects.toThrow("provider and model must be strings");
    await expect(
      meter.reserve({ provider: "gemini", model: "gemini-2.5-flash", kind: "unknown" as never }),
    ).rejects.toThrow("unknown kind");
    await expect(
      meter.reserve({
        provider: "gemini",
        model: "gemini-2.5-flash",
        kind: "suggest",
        owner: true,
      } as never),
    ).rejects.toThrow("unexpected key in reserve options: owner");
    await expect(
      meter.reserve({
        provider: "gemini",
        model: "gemini-2.5-flash",
        kind: "suggest",
        userId: "11111111-1111-4111-8111-111111111111",
      } as never),
    ).rejects.toThrow("unexpected key in reserve options: userId");
  });

  it("reserve of an unpriced model / prototype-key model returns { status: 'unpriced' } without touching the pool", async () => {
    expect(
      await meter.reserve({ provider: "gemini", model: "unpriced-model", kind: "suggest" }),
    ).toEqual({
      status: "unpriced",
    });
    expect(await meter.reserve({ provider: "gemini", model: "toString", kind: "suggest" })).toEqual(
      {
        status: "unpriced",
      },
    );
    expect(
      await meter.reserve({ provider: "gemini", model: "gemini-2.5-flash", kind: "sticker" }),
    ).toEqual({
      status: "unpriced",
    });
  });

  it("settle throws on a non-UUID spendId or a non-string outcome before touching the pool", async () => {
    await expect(meter.settle("not-a-uuid", "ok")).rejects.toThrow(
      "spendId must be a canonical UUID",
    );
    await expect(meter.settle("00000000-0000-0000-0000-000000000000", "ok")).rejects.toThrow(
      "spendId must be a canonical UUID",
    );
    await expect(
      meter.settle("11111111-1111-4111-8111-111111111111", 123 as never),
    ).rejects.toThrow("outcome must be a string");
  });

  it("migration kind check lists exactly Object.keys(KIND_CEILINGS)", () => {
    const dir = path.join(root, "db/migrations");
    const file = readdirSync(dir).find((f) => f.endsWith("_ai_spend_meter.sql"));
    expect(file).toBeDefined();
    const sql = readFileSync(path.join(dir, file as string), "utf8");
    const m = /check \(kind in \(([^)]*)\)\)/.exec(sql);
    expect(m).not.toBeNull();
    const kinds = (m as RegExpExecArray)[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect([...kinds].sort()).toEqual(Object.keys(KIND_CEILINGS).sort());
  });

  it("static: spend.js and spendPrices.js never match /owner|TUDO_OWNER_SUB|rateLimit|inflight/i", () => {
    const re = /owner|TUDO_OWNER_SUB|rateLimit|inflight/i;
    const spendSrc = readFileSync(path.join(aiDir, "spend.js"), "utf8");
    const spendPricesSrc = readFileSync(path.join(aiDir, "spendPrices.js"), "utf8");
    expect(spendSrc).not.toMatch(re);
    expect(spendPricesSrc).not.toMatch(re);
  });

  it("only app.js imports spend.js (F-706.4); only spend.js imports spendPrices.js; only spend.js and db.js mention withSpendMeter", () => {
    const files = [...walk(server), ...walk(path.join(root, "src"))].filter(
      (f) => /\.(js|ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f),
    );
    const importers = (name: string) =>
      files.filter((f) =>
        new RegExp(`from\\s+["'][^"']*/${name}\\.js["']`).test(readFileSync(f, "utf8")),
      );
    expect(importers("spend").map((f) => path.basename(f))).toEqual(["app.js"]);
    expect(importers("spendPrices").map((f) => path.basename(f))).toEqual(["spend.js"]);

    const withSpendMeterUsers = files.filter((f) =>
      readFileSync(f, "utf8").includes("withSpendMeter"),
    );
    expect(withSpendMeterUsers.map((f) => path.basename(f)).sort()).toEqual(["db.js", "spend.js"]);
  });

  it("backup.js never mentions ai_spend", () => {
    const backupSrc = readFileSync(path.join(server, "backup.js"), "utf8");
    expect(backupSrc).not.toMatch(/ai_spend/);
  });
});
