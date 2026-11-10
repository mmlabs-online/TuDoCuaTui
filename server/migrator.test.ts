// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checksum, parseMigrationFilename, planMigrations } from "./migrator.js";

const ref = (version: string, sum = "x") => ({ version, name: "n", checksum: sum });

describe("parseMigrationFilename", () => {
  it("parses `YYYYMMDDHHMMSS_snake.sql`, rejects other names", () => {
    expect(parseMigrationFilename("20261110120000_init.sql")).toEqual({
      version: "20261110120000",
      name: "init",
    });
    for (const bad of [
      "0001_init.sql",
      "20261110120000_Init.sql",
      "20261110120000_init.txt",
      "init.sql",
    ]) {
      expect(parseMigrationFilename(bad)).toBeNull();
    }
  });
});

describe("checksum", () => {
  it("is sha256 hex and ignores CRLF vs LF", () => {
    expect(checksum("a\nb")).toMatch(/^[0-9a-f]{64}$/);
    expect(checksum("a\r\nb")).toBe(checksum("a\nb"));
    expect(checksum("a\nb")).not.toBe(checksum("a\nc"));
  });
});

describe("planMigrations", () => {
  it("pending in lexical order", () => {
    const plan = planMigrations([ref("3"), ref("1"), ref("2")], [ref("1")]);
    expect(plan.pending.map((m) => m.version)).toEqual(["2", "3"]);
    expect(plan.ahead).toEqual([]);
  });

  it("applied file missing (<= newest local) -> drift error", () => {
    expect(() => planMigrations([ref("1"), ref("3")], [ref("1"), ref("2"), ref("3")])).toThrow(
      /missing locally/,
    );
  });

  it("checksum differs -> drift error", () => {
    expect(() => planMigrations([ref("1", "a")], [ref("1", "b")])).toThrow(/checksum mismatch/);
  });

  it("unapplied file older than newest applied -> out-of-order error", () => {
    expect(() => planMigrations([ref("1"), ref("2")], [ref("2")])).toThrow(/older than/);
  });

  it("applied versions newer than newest local -> `ahead`, nothing pending", () => {
    const plan = planMigrations([ref("1")], [ref("1"), ref("2")]);
    expect(plan).toEqual({ pending: [], ahead: ["2"] });
  });
});

describe("real db/migrations files", () => {
  const dir = path.resolve(import.meta.dirname, "../db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));

  it("are well-formed and contain no forbidden statements", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(parseMigrationFilename(f), f).not.toBeNull();
      const sql = readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .toLowerCase();
      expect(sql, f).not.toMatch(
        /\b(begin|commit|rollback|end|abort)\b\s*(;|$|work\b|transaction\b|and\b)|start\s+transaction|concurrently/,
      );
      expect(sql, f).not.toMatch(/create\s+extension|\bgrant\b|create\s+role/);
    }
  });
});
