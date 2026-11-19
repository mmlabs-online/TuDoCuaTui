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
const authFiles = () => walk(authDir).filter((f) => !isTest(f));

/** Each sensitive token may appear only in the listed files (basename relative to src/features/auth). */
const ALLOWED: Record<string, string[]> = {
  "fetch(": ["identityClient.ts"],
  "api.mmlabs": ["config.ts"],
  localStorage: ["accountId.ts"],
  mm_account_id: ["accountId.ts"],
  'createElement("script")': ["turnstile.ts"],
  "challenges.cloudflare.com": ["turnstile.ts"],
  "history.": ["AuthRoot.tsx"],
  "navigator.locks": ["refreshLock.ts"],
  BroadcastChannel: ["authChannel.ts"],
};
const NOWHERE = [
  "console.",
  "sessionStorage",
  "document.cookie",
  "XMLHttpRequest",
  "sendBeacon",
  "WebSocket",
  "EventSource",
  "dangerouslySetInnerHTML",
  "innerHTML",
];

describe("auth slice boundary", () => {
  it("sensitive calls live only in their one file", () => {
    const files = authFiles();
    expect(files.length).toBeGreaterThan(0);
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, "utf8");
      const name = path.relative(authDir, f);
      return [
        ...Object.entries(ALLOWED)
          .filter(([w, ok]) => text.includes(w) && !ok.includes(name))
          .map(([w]) => `${rel(f)}: ${w}`),
        ...NOWHERE.filter((w) => text.includes(w)).map((w) => `${rel(f)}: ${w}`),
      ];
    });
    expect(hits).toEqual([]);
  });

  it("only src/main.tsx mentions features/auth, and only through a dynamic import()", () => {
    const files = walk(path.join(root, "src")).filter(
      (f) => !f.startsWith(authDir + path.sep) && !isTest(f),
    );
    const hits = [...files, path.join(root, "index.html")].filter((f) => {
      const text = readFileSync(f, "utf8");
      return text.includes("features/auth") || text.includes("auth-preview");
    });
    expect(hits.map(rel).filter((f) => f !== "src/main.tsx")).toEqual([]);
    const main = readFileSync(path.join(root, "src/main.tsx"), "utf8");
    expect(main).not.toMatch(/from\s+["'][^"']*features\/auth/);
    for (const m of main.matchAll(/features\/auth[^"']*/g)) {
      expect(main).toContain(`import("./${m[0]}`);
    }
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
