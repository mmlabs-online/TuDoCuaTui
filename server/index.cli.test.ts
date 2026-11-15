// @vitest-environment node
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fakeEnv } from "./test/fake-drive.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.js");

function run(env: Record<string, string>) {
  return spawnSync(process.execPath, [entry], {
    env: { TUDO_OWNER_SUB: OWNER, ...env },
    encoding: "utf8",
    timeout: 10_000,
  });
}

async function start(env: Record<string, string>) {
  const child = spawn(process.execPath, [entry], {
    env: { PORT: "0", TUDO_OWNER_SUB: OWNER, ...env },
  });
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

  it("TUDO_OWNER_SUB missing, malformed or nil -> exit 2 in both modes, value never printed", () => {
    const on = { CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", CF_ACCESS_AUD: "aud" };
    const cases: Array<[Record<string, string>, string]> = [
      [{ ...on, TUDO_OWNER_SUB: "" }, "TUDO_OWNER_SUB must be set"],
      [{ TUDO_ACCESS_DISABLED: "1", TUDO_OWNER_SUB: "" }, "TUDO_OWNER_SUB must be set"],
      [{ ...on, TUDO_OWNER_SUB: "SECRETISH-not-a-uuid" }, "TUDO_OWNER_SUB must be a valid UUID"],
      [
        { ...on, TUDO_OWNER_SUB: "00000000-0000-0000-0000-000000000000" },
        "TUDO_OWNER_SUB must be a valid UUID",
      ],
    ];
    for (const [env, msg] of cases) {
      const r = run(env);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(msg);
      expect(r.stdout + r.stderr).not.toContain("SECRETISH");
    }
  });

  it("TUDO_AUTH_MODE and MM_IDENTITY_ISSUER misconfiguration -> exit 2, values never printed", () => {
    const id = { TUDO_AUTH_MODE: "identity" };
    const cases: Array<[Record<string, string>, string, string?]> = [
      [{ TUDO_AUTH_MODE: "bogus", TUDO_ACCESS_DISABLED: "1" }, "TUDO_AUTH_MODE", "bogus"],
      [id, "MM_IDENTITY_ISSUER"],
      [
        { ...id, NODE_ENV: "production", MM_IDENTITY_ISSUER: "https://evil.example" },
        "MM_IDENTITY_ISSUER",
        "evil.example",
      ],
      [
        { ...id, NODE_ENV: "production", MM_IDENTITY_ISSUER: "http://api.mmlabs.online" },
        "MM_IDENTITY_ISSUER",
      ],
      [
        { ...id, MM_IDENTITY_ISSUER: "https://api.mmlabs.online", TUDO_ACCESS_DISABLED: "1" },
        "TUDO_ACCESS_DISABLED",
      ],
    ];
    for (const [env, msg, secret] of cases) {
      const r = run(env);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain(msg);
      if (secret) expect(r.stdout + r.stderr).not.toContain(secret);
    }
  });

  it("identity mode needs TUDO_OWNER_SUB: blank or malformed -> exit 2, value never printed", () => {
    const id = { TUDO_AUTH_MODE: "identity", MM_IDENTITY_ISSUER: "https://api.mmlabs.online" };
    const blank = run({ ...id, TUDO_OWNER_SUB: "" });
    expect(blank.status).toBe(2);
    expect(blank.stderr).toContain("TUDO_OWNER_SUB must be set");
    const bad = run({ ...id, TUDO_OWNER_SUB: "SECRETISH-not-a-uuid" });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("TUDO_OWNER_SUB must be a valid UUID");
    expect(bad.stdout + bad.stderr).not.toContain("SECRETISH");
  });

  it("production identity needs no CF_ACCESS_*, only the owner: starts, /healthz auth identity, /api 401", async () => {
    const { child, port, output } = await start({
      NODE_ENV: "production",
      TUDO_AUTH_MODE: "identity",
      MM_IDENTITY_ISSUER: "https://api.mmlabs.online",
      TUDO_OWNER_SUB: OWNER,
    });
    try {
      expect(output()).toContain("auth: identity");
      expect(await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()).toEqual({
        status: "ok",
        auth: "identity",
      });
      expect((await fetch(`http://127.0.0.1:${port}/api/items`)).status).toBe(401);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("identity with a valid AI_KEK: logs 'ai configured'", async () => {
    const kek = randomBytes(32).toString("base64");
    const { child, output } = await start({
      TUDO_AUTH_MODE: "identity",
      MM_IDENTITY_ISSUER: "https://api.mmlabs.online",
      AI_KEK: kek,
    });
    try {
      expect(output()).toContain("ai configured");
      expect(output()).not.toContain(kek);
    } finally {
      child.kill("SIGTERM");
    }
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

  it("no AI_KEK: logs 'ai not configured'", async () => {
    const { child, output } = await start({ TUDO_ACCESS_DISABLED: "1" });
    try {
      expect(output()).toContain("ai not configured");
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("valid AI_KEK with Access on: logs 'ai configured', value not printed", async () => {
    const kek = randomBytes(32).toString("base64");
    const { child, port, output } = await start({
      CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
      CF_ACCESS_AUD: "aud",
      AI_KEK: kek,
    });
    try {
      expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
      expect(output()).toContain("ai configured");
      expect(output()).not.toContain(kek);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("valid AI_KEK with Access off: logs 'ai disabled: request auth off', routes answer 503", async () => {
    const kek = randomBytes(32).toString("base64");
    const { child, port, output } = await start({ TUDO_ACCESS_DISABLED: "1", AI_KEK: kek });
    try {
      expect(output()).toContain("ai disabled: request auth off");
      const res = await fetch(`http://127.0.0.1:${port}/api/ai-settings`);
      expect(res.status).toBe(503);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "server_misconfigured",
      );
      expect(output()).not.toContain(kek);
    } finally {
      child.kill("SIGTERM");
    }
  });

  it("malformed AI_KEK exits 2 with 'config error: ...AI_KEK...' and no value", () => {
    const r = run({ TUDO_ACCESS_DISABLED: "1", AI_KEK: "not-a-kek-value" });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/config error: .*AI_KEK/);
    expect(r.stderr + r.stdout).not.toContain("not-a-kek-value");
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
