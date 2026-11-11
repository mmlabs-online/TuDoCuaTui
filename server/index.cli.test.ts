// @vitest-environment node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fakeEnv } from "./test/fake-drive.js";

const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.js");

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [entry], { env, encoding: "utf8", timeout: 10_000 });
}

async function start(env: Record<string, string>) {
  const child = spawn(process.execPath, [entry], { env: { PORT: "0", ...env } });
  let out = "";
  let err = "";
  child.stderr.on("data", (c) => (err += c));
  const port = await new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 8000);
    child.stdout.on("data", (c) => {
      out += c;
      const m = /listening on :(\d+)/.exec(out);
      if (m) {
        clearTimeout(t);
        resolve(Number(m[1]));
      }
    });
    child.on("exit", () => reject(new Error("exited early")));
  });
  return { child, port, output: () => out + err };
}

describe("entry point", () => {
  it("NODE_ENV=production without CF_ACCESS_* exits 2 with a fixed message", () => {
    const r = run({ NODE_ENV: "production" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set");
  });

  it("TUDO_ACCESS_DISABLED=1 is refused in production (exit 2)", () => {
    const r = run({ NODE_ENV: "production", TUDO_ACCESS_DISABLED: "1" });
    expect(r.status).toBe(2);
  });

  it("starts on PORT with no DATABASE_URL; /healthz 200, /readyz 503, /api 401 with Access on; SIGTERM exits 0", async () => {
    const { child, port } = await start({ TUDO_ACCESS_DISABLED: "1" });
    try {
      expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${port}/readyz`)).status).toBe(503);
    } finally {
      const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
      child.kill("SIGTERM");
      expect(await exited).toBe(0);
    }
    const on = await start({
      CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CF_ACCESS_AUD: "aud",
    });
    try {
      expect((await fetch(`http://127.0.0.1:${on.port}/api/items`)).status).toBe(401);
    } finally {
      on.child.kill("SIGTERM");
    }
  });

  it("unreachable DATABASE_URL: /readyz 503; stdout, stderr and the body contain neither the URL nor the password", async () => {
    const url = "postgres://tudo:s3cretpw9@127.0.0.1:1/tudodb";
    const { child, port, output } = await start({ TUDO_ACCESS_DISABLED: "1", DATABASE_URL: url });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/readyz`);
      expect(res.status).toBe(503);
      const body = await res.text();
      await new Promise((r) => setTimeout(r, 100));
      for (const text of [body, output()]) {
        expect(text).not.toContain("s3cretpw9");
        expect(text).not.toContain("tudodb");
        expect(text).not.toContain(url);
      }
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("starts with no Google env and logs 'drive not configured'", async () => {
    const { child, output } = await start({ TUDO_ACCESS_DISABLED: "1" });
    try {
      expect(output()).toContain("drive not configured");
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("with all four fake values: logs 'drive configured', /healthz 200, /readyz unaffected, no value printed", async () => {
    const { child, port, output } = await start({ TUDO_ACCESS_DISABLED: "1", ...fakeEnv });
    try {
      expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${port}/readyz`)).status).toBe(503);
      expect(output()).toContain("drive configured");
      for (const v of Object.values(fakeEnv)) expect(output()).not.toContain(v);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("partial Google config exits 2 with 'config error: ...' and no values", () => {
    const r = run({
      TUDO_ACCESS_DISABLED: "1",
      GOOGLE_CLIENT_SECRET: fakeEnv.GOOGLE_CLIENT_SECRET,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("config error: Google Drive config is incomplete");
    expect(r.stderr + r.stdout).not.toContain(fakeEnv.GOOGLE_CLIENT_SECRET);
  });
});
