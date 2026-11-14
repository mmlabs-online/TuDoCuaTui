// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checksum,
  MigrationError,
  parseMigrationFilename,
  parseOwnerSub,
  planMigrations,
} from "./migrator.js";

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

describe("parseOwnerSub", () => {
  const V4 = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";
  const V7 = "0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e";

  it("unset or blank means no owner", () => {
    for (const v of [undefined, "", "   "]) expect(parseOwnerSub(v)).toBeUndefined();
  });

  it("trims, lowercases, accepts v4 and v7", () => {
    expect(parseOwnerSub(`  ${V4.toUpperCase()}\n`)).toBe(V4);
    expect(parseOwnerSub(V7)).toBe(V7);
  });

  it("rejects malformed values with exit code 2 and never echoes the input", () => {
    for (const bad of ["xyz", V4.slice(1), `{${V4}}`, "00000000-0000-0000-0000-000000000000"]) {
      let err: unknown;
      try {
        parseOwnerSub(bad);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(MigrationError);
      expect(err).toMatchObject({
        exitCode: 2,
        message: "TUDO_OWNER_SUB is not a valid UUID",
      });
      expect((err as Error).message).not.toContain(bad);
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
