// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAKE, fakeEnv } from "./test/fake-drive.js";

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "photo-relocate.js");

function run(env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, [entry, ...args], {
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("photo-relocate CLI", () => {
  it("no Google env -> 2; no DATABASE_URL -> 2; bad --max-move / unknown flag -> 2 with usage", () => {
    const noGoogle = run({});
    expect(noGoogle.status).toBe(2);
    expect(noGoogle.stderr).toContain("drive not configured");
    const noDb = run(fakeEnv);
    expect(noDb.status).toBe(2);
    expect(noDb.stderr).toContain("DATABASE_URL is not set");
    expect(noDb.stdout + noDb.stderr).not.toContain(FAKE.clientSecret);
    for (const args of [
      ["--max-move", "0"],
      ["--max-move", "abc"],
      ["--max-move", "10001"],
      ["--bogus"],
      ["stray"],
    ]) {
      const r = run(fakeEnv, args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toContain("usage:");
    }
  });
});
