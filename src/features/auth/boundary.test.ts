// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const authDir = path.join(root, "src/features/auth");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f);
const rel = (f: string) => path.relative(root, f);

describe("auth slice boundary", () => {
  it("auth sources make no network or storage call", () => {
    const forbidden = [
      "fetch(",
      "XMLHttpRequest",
      "sendBeacon",
      "WebSocket",
      "EventSource",
      "localStorage",
      "sessionStorage",
      "document.cookie",
      "api.mmlabs",
      "console.",
    ];
    const files = walk(authDir).filter((f) => !isTest(f));
    expect(files.length).toBeGreaterThan(0);
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return forbidden.filter((w) => text.includes(w)).map((w) => `${rel(f)}: ${w}`);
    });
    expect(hits).toEqual([]);
  });

  it("no app module imports features/auth", () => {
    const files = walk(path.join(root, "src")).filter((f) => !f.startsWith(authDir + path.sep));
    const hits = [...files, path.join(root, "index.html")].filter((f) => {
      const text = readFileSync(f, "utf8");
      return text.includes("features/auth") || text.includes("auth-preview");
    });
    expect(hits.map(rel)).toEqual([]);
  });

  it("auth UI uses theme variables, no fixed wide widths", () => {
    const files = walk(authDir).filter((f) => f.endsWith(".tsx") && !isTest(f));
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, "utf8");
      const out: string[] = [];
      if (/#[0-9a-fA-F]{3,8}\b/.test(text)) out.push(`${rel(f)}: hex colour`);
      for (const m of text.matchAll(/(?<![\w-])(?:min-)?w-\[(\d+)px\]/g)) {
        if (Number(m[1]) > 390) out.push(`${rel(f)}: ${m[0]}`);
      }
      return out;
    });
    expect(hits).toEqual([]);
  });
});
