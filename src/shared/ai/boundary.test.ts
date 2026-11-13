// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const FORBIDDEN = [
  "TUDO_AI_KEK",
  "service_role",
  "SERVICE_ROLE",
  "tudo_ai_settings",
  "tudo_ai_calls",
  "AI_KEK",
  "ai_settings",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("client/server boundary (R3)", () => {
  it("no client source names a server-only secret or table", () => {
    const files = walk(path.join(root, "src")).filter(
      (f) =>
        /\.(ts|tsx)$/.test(f) &&
        !/\.test\.(ts|tsx)$/.test(f) &&
        !f.endsWith(path.join("src", "types", "database.ts")),
    );
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return FORBIDDEN.filter((w) => text.includes(w)).map(
        (w) => `${path.relative(root, f)}: ${w}`,
      );
    });
    expect(hits).toEqual([]);
  });

  it(".env.example gains no AI variable", () => {
    const text = readFileSync(path.join(root, ".env.example"), "utf8");
    expect(text).not.toMatch(/AI|KEK|ANTHROPIC|GEMINI/i);
  });
});
