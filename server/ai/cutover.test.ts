// @vitest-environment node
// F-706.4 structural checks: after the cutover no code path decrypts a BYOK key, and every paid call goes through
// the one runner (credits and spend reserved in one place).
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
const sources = [...walk(server), ...walk(path.join(root, "src"))].filter(
  (f) =>
    /\.(js|ts|tsx)$/.test(f) &&
    !/\.test\.(ts|tsx)$/.test(f) &&
    !f.includes(`${path.sep}test${path.sep}`),
);
const mentioning = (re: RegExp) =>
  sources.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => path.basename(f));
const read = (name: string) => readFileSync(path.join(aiDir, name), "utf8");

describe("BYOK keys are never decrypted (F-706.4)", () => {
  it("no non-test file outside crypto.js mentions openStoredKey or openKey", () => {
    expect(mentioning(/\bopenStoredKey\b|\bopenKey\b/)).toEqual(["crypto.js"]);
  });

  it("no non-test file outside store.js calls getSecret; loadSettingsKey does not exist", () => {
    expect(mentioning(/\bgetSecret\b/)).toEqual(["store.js"]);
    expect(mentioning(/\bloadSettingsKey\b/)).toEqual([]);
  });

  it("the settings routes no longer test a key", () => {
    expect(read("routes.js")).not.toMatch(/handleTest|CHECKERS|ai-settings\/test/);
    expect(readFileSync(path.join(server, "api.js"), "utf8")).not.toMatch(/ai-settings\/test/);
  });
});

describe("paid calls go through one runner", () => {
  it("tagPhoto.js and suggestOutfits.js use paidCall and take the key from it; neither imports routes.js", () => {
    for (const f of ["tagPhoto.js", "suggestOutfits.js"]) {
      const src = read(f);
      expect(src).toMatch(/runPaidCall\(/);
      expect(src).not.toMatch(/from "\.\/routes\.js"/);
      expect(src).not.toMatch(/\.reserve\(|\.commit\(|\.refund\(|\.settle\(/);
    }
  });

  it("only paidCall.js calls credits.reserve and spend.reserve", () => {
    const callers = sources
      .filter((f) => /\b(credits|spend)\.reserve\(/.test(readFileSync(f, "utf8")))
      .map((f) => path.basename(f));
    expect(callers).toEqual(["paidCall.js"]);
  });
});
