// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

/** `[selector list, body]` of every flat rule (no nested blocks needed for these selectors). */
function rules(): [string, string][] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

describe("card paint cost", () => {
  it("card badges and wear pills have no backdrop-filter", () => {
    const hit = rules().filter(([sel]) =>
      sel.split(",").some((s) => /(^|[\s>+~])\.(wear-pill|badge)\b/.test(s.trim())),
    );
    expect(hit.length).toBeGreaterThan(0);
    for (const [sel, body] of hit) {
      expect(body, sel).not.toMatch(/backdrop-filter/);
    }
  });
});
