import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tokenPageOf } from "./tokenPages";

describe("tokenPageOf", () => {
  it("matches the exact path or one trailing slash", () => {
    expect(tokenPageOf("/verify-email")).toBe("verify");
    expect(tokenPageOf("/verify-email/")).toBe("verify");
    expect(tokenPageOf("/reset-password")).toBe("reset");
    expect(tokenPageOf("/reset-password/")).toBe("reset");
  });
  it.each([
    "",
    "/",
    "/reset-password//",
    "/reset-passwordx",
    "/reset-password/x",
    "/RESET-PASSWORD",
  ])("%j is not a token page", (p) => {
    expect(tokenPageOf(p)).toBeNull();
  });
});

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(f);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [f] : [];
  });
}

describe("one path list", () => {
  it("no other file in src/ spells '/verify-email' or '/reset-password' as a page path", () => {
    const own = path.resolve(__dirname, "tokenPages.ts");
    const root = path.resolve(__dirname, "..");
    const hits = sourceFiles(root).filter(
      (f) =>
        f !== own && /["']\/(verify-email|reset-password)["']/.test(fs.readFileSync(f, "utf8")),
    );
    expect(hits).toEqual([]);
  });
});
