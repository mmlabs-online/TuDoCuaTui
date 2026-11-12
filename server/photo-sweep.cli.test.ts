// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAKE, fakeEnv } from "./test/fake-drive.js";

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "photo-sweep.js");

function run(env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, [entry, ...args], {
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
}

describe("photo-sweep CLI", () => {
  it("without Google env exits 2 'drive not configured'", () => {
    const r = run({});
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("drive not configured");
  });

  it("partial Google env exits 2 without values", () => {
    const r = run({ GOOGLE_CLIENT_ID: FAKE.clientId, GOOGLE_CLIENT_SECRET: FAKE.clientSecret });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("config error");
    expect(r.stderr).toContain("GOOGLE_REFRESH_TOKEN");
    expect(r.stdout + r.stderr).not.toContain(FAKE.clientSecret);
    expect(r.stdout + r.stderr).not.toContain(FAKE.clientId);
  });

  it("Google env but no DATABASE_URL exits 2 'DATABASE_URL is not set'", () => {
    const r = run(fakeEnv);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("DATABASE_URL is not set");
  });

  it("--grace-minutes below 15, non-integer, unknown flag -> exit 2 with usage", () => {
    for (const args of [
      ["--grace-minutes", "5"],
      ["--grace-minutes", "abc"],
      ["--grace-minutes", "60000"],
      ["--max-delete", "0"],
      ["--bogus"],
      ["stray"],
    ]) {
      const r = run(fakeEnv, args);
      expect(r.status, args.join(" ")).toBe(2);
      expect(r.stderr).toContain("usage:");
    }
  });
});
