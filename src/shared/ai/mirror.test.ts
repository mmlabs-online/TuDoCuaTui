// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const src = path.join(root, "src/shared/ai");
const mirror = path.join(root, "supabase/functions/_shared/ai");
const sources = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
const FIX =
  "run: pnpm format && cp src/shared/ai/{catalog,errors,validate,mask}.ts supabase/functions/_shared/ai/";

describe("allowlist mirror", () => {
  it("has the same non-test file set", () => {
    expect(sources(mirror), FIX).toEqual(sources(src));
  });

  it("is byte-identical", () => {
    for (const f of sources(src)) {
      expect(
        readFileSync(path.join(mirror, f)).equals(readFileSync(path.join(src, f))),
        `${f}: ${FIX}`,
      ).toBe(true);
    }
  });
});
