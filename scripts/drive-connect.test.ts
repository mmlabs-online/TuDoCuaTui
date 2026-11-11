// @vitest-environment node
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAuthUrl,
  ENDPOINTS,
  findOrCreateFolder,
  isInsideGitWorkTree,
  parseArgs,
  pkce,
  readClient,
  run,
  startCallbackServer,
  writeSecretsFile,
} from "./drive-connect.mjs";

const CID = "fake-client-1.apps.googleusercontent.com";
const CSECRET = "fake-client-secret-XYZ";
const RTOKEN = "fake-refresh-token/abc.def-1";
const ATOKEN = "fake-access-token-777";
const CODE = "fake-auth-code-555";
const FOLDER = "fakeFolderId_0001";
const SECRETS = [CSECRET, RTOKEN, ATOKEN, CODE];
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const dirs: string[] = [];
function tmp() {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "drive-connect-")));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function clientFile(
  dir: string,
  body: unknown = { installed: { client_id: CID, client_secret: CSECRET } },
) {
  const f = path.join(dir, "client.json");
  fs.writeFileSync(f, JSON.stringify(body));
  return f;
}

function get(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      })
      .on("error", reject);
  });
}

type Opts = {
  token?: { status: number; body: unknown };
  about?: { status: number; body: unknown };
  list?: { status: number; body: unknown };
  create?: { status: number; body: unknown };
  callback?: (redirect: string, state: string) => string; // returns the query string to send
};

/** A full in-process run: fake Google via `fetch`, real loopback server, simulated browser. */
async function fullRun(o: Opts = {}, extraArgs: string[] = []) {
  const dir = tmp();
  const outFile = path.join(dir, "cfg", "drive-secrets.env");
  const out: string[] = [];
  const err: string[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const reply = (r: { status: number; body: unknown }) =>
    new Response(JSON.stringify(r.body), { status: r.status });
  const fetchFake = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith(ENDPOINTS.token))
      return reply(
        o.token ?? {
          status: 200,
          body: { access_token: ATOKEN, refresh_token: RTOKEN, scope: SCOPE },
        },
      );
    if (u.startsWith(ENDPOINTS.about))
      return reply(o.about ?? { status: 200, body: { user: { emailAddress: "a@example.com" } } });
    if (init?.method === "POST") return reply(o.create ?? { status: 200, body: { id: FOLDER } });
    return reply(o.list ?? { status: 200, body: { files: [] } });
  };
  const pending: Promise<number>[] = [];
  const code = await run({
    argv: ["--client-file", clientFile(dir), "--out", outFile, ...extraArgs],
    fetch: fetchFake as typeof fetch,
    out: (s) => {
      out.push(s);
      if (s.startsWith("http")) {
        const u = new URL(s);
        const redirect = u.searchParams.get("redirect_uri")!;
        const state = u.searchParams.get("state")!;
        const q = o.callback ? o.callback(redirect, state) : `code=${CODE}&state=${state}`;
        pending.push(get(`${redirect}?${q}`));
      }
    },
    err: (s) => err.push(s),
    timeoutMs: 3000,
    homedir: dir,
  });
  await Promise.all(pending);
  return { code, out, err, calls, outFile, dir };
}

function expectNoSecrets(r: { out: string[]; err: string[] }) {
  const all = [...r.out, ...r.err].join("\n");
  for (const s of SECRETS) expect(all).not.toContain(s);
}

describe("parseArgs", () => {
  it("--client-file required; unknown flag, missing value -> usage error (exit 2)", () => {
    expect(parseArgs(["--client-file", "a.json"])).toEqual({
      clientFile: "a.json",
      out: undefined,
    });
    expect(parseArgs(["--client-file", "a", "--out", "b"]).out).toBe("b");
    for (const bad of [
      [],
      ["--client-file"],
      ["--nope", "x"],
      ["--client-file", "--out"],
      ["--out", "b"],
    ]) {
      expect(() => parseArgs(bad)).toThrowError(expect.objectContaining({ code: 2 }));
    }
  });
});

describe("readClient", () => {
  it("accepts an installed client", () => {
    const d = tmp();
    expect(readClient(clientFile(d))).toEqual({ clientId: CID, clientSecret: CSECRET });
  });
  it("rejects web clients, missing fields, bad id, unreadable JSON without naming values", () => {
    const d = tmp();
    const bads: unknown[] = [
      { web: { client_id: CID, client_secret: CSECRET } },
      { installed: { client_id: CID } },
      { installed: { client_id: "nope", client_secret: CSECRET } },
      { installed: { client_id: CID, client_secret: "bad secret!" } },
    ];
    for (const b of bads) {
      let msg = "";
      try {
        readClient(clientFile(d, b));
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).not.toBe("");
      expect(msg).not.toContain(CSECRET);
      expect(msg).not.toContain("bad secret!");
    }
    expect(() => readClient(path.join(d, "missing.json"))).toThrow();
    fs.writeFileSync(path.join(d, "x.json"), "{not json");
    expect(() => readClient(path.join(d, "x.json"))).toThrow();
  });
});

describe("pkce and auth url", () => {
  it("verifier is 43+ base64url chars; challenge = base64url(sha256(verifier))", () => {
    const { verifier, challenge } = pkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(challenge).toBe(crypto.createHash("sha256").update(verifier).digest("base64url"));
  });
  it("buildAuthUrl carries the required params and no client secret", () => {
    const s = buildAuthUrl({
      clientId: CID,
      redirectUri: "http://127.0.0.1:1234/",
      challenge: "ch",
      state: "st",
    });
    const u = new URL(s);
    const p = u.searchParams;
    expect(`${u.origin}${u.pathname}`).toBe(ENDPOINTS.auth);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe(CID);
    expect(p.get("redirect_uri")).toBe("http://127.0.0.1:1234/");
    expect(p.get("scope")).toBe(SCOPE);
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("code_challenge")).toBe("ch");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe("st");
    expect(s).not.toContain("client_secret");
  });
});

describe("callback server", () => {
  it("binds 127.0.0.1, 404s other paths and keeps waiting, closes after one valid callback", async () => {
    const s = await startCallbackServer({ state: "good", timeoutMs: 3000 });
    expect(s.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await get(`${s.redirectUri}favicon.ico`)).toBe(404);
    expect(await get(`${s.redirectUri}?code=c1&state=good`)).toBe(200);
    expect(await s.code).toBe("c1");
    await expect(get(s.redirectUri)).rejects.toBeTruthy();
  });
  it("wrong state rejects", async () => {
    const s = await startCallbackServer({ state: "good", timeoutMs: 3000 });
    await get(`${s.redirectUri}?code=c1&state=bad`);
    await expect(s.code).rejects.toThrow(/wrong state/);
  });
  it("error=access_denied rejects with that code; odd error text is not echoed", async () => {
    const s = await startCallbackServer({ state: "good", timeoutMs: 3000 });
    await get(`${s.redirectUri}?error=access_denied&state=good`);
    await expect(s.code).rejects.toThrow(/access_denied/);
    const s2 = await startCallbackServer({ state: "good", timeoutMs: 3000 });
    await get(`${s2.redirectUri}?error=Bad%20Thing&state=good`);
    await expect(s2.code).rejects.toThrow(/unknown/);
  });
  it("missing code rejects", async () => {
    const s = await startCallbackServer({ state: "good", timeoutMs: 3000 });
    await get(`${s.redirectUri}?state=good`);
    await expect(s.code).rejects.toThrow(/no code/);
  });
  it("times out", async () => {
    const s = await startCallbackServer({ state: "good", timeoutMs: 30 });
    await expect(s.code).rejects.toThrow(/timed out/);
  });
});

describe("findOrCreateFolder", () => {
  function fake(list: unknown, create: unknown = { id: FOLDER }, listOk = true, createOk = true) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST")
        return new Response(JSON.stringify(create), { status: createOk ? 200 : 500 });
      return new Response(JSON.stringify(list), { status: listOk ? 200 : 500 });
    }) as unknown as typeof fetch;
    return { f, calls };
  }
  it("query is the fixed name/mimeType/trashed=false with orderBy=createdTime; found -> no create", async () => {
    const { f, calls } = fake({ files: [{ id: FOLDER }] });
    expect(await findOrCreateFolder(f, ENDPOINTS, ATOKEN, () => {})).toBe(FOLDER);
    expect(calls).toHaveLength(1);
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("q")).toBe(
      "name='TuDoCuaTui' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    );
    expect(u.searchParams.get("orderBy")).toBe("createdTime");
  });
  it("several found -> the oldest and a warning with the count", async () => {
    const warns: string[] = [];
    const { f } = fake({ files: [{ id: FOLDER }, { id: "otherFolder_0002" }] });
    expect(await findOrCreateFolder(f, ENDPOINTS, ATOKEN, (s) => warns.push(s))).toBe(FOLDER);
    expect(warns[0]).toContain("2 folders");
  });
  it("none -> one POST creating the folder", async () => {
    const { f, calls } = fake({ files: [] });
    expect(await findOrCreateFolder(f, ENDPOINTS, ATOKEN, () => {})).toBe(FOLDER);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      name: "TuDoCuaTui",
      mimeType: "application/vnd.google-apps.folder",
    });
  });
  it("bad id or failing calls -> error", async () => {
    await expect(
      findOrCreateFolder(fake({ files: [{ id: "x y" }] }).f, ENDPOINTS, ATOKEN, () => {}),
    ).rejects.toThrow();
    await expect(
      findOrCreateFolder(fake({}, {}, false).f, ENDPOINTS, ATOKEN, () => {}),
    ).rejects.toThrow(/lookup/);
    await expect(
      findOrCreateFolder(fake({ files: [] }, {}, true, false).f, ENDPOINTS, ATOKEN, () => {}),
    ).rejects.toThrow(/creation/);
    await expect(
      findOrCreateFolder(fake({ files: [] }, { id: "short" }).f, ENDPOINTS, ATOKEN, () => {}),
    ).rejects.toThrow();
  });
});

describe("isInsideGitWorkTree", () => {
  it(".git dir -> true; .git file -> true; plain dir -> false; nonexistent path checks its ancestor", () => {
    const a = tmp();
    fs.mkdirSync(path.join(a, ".git"));
    expect(isInsideGitWorkTree(a)).toBe(true);
    expect(isInsideGitWorkTree(path.join(a, "x", "y", "f.env"))).toBe(true);
    const b = tmp();
    fs.writeFileSync(path.join(b, ".git"), "gitdir: /elsewhere");
    expect(isInsideGitWorkTree(path.join(b, "f.env"))).toBe(true);
    const c = tmp();
    expect(isInsideGitWorkTree(c)).toBe(false);
    expect(isInsideGitWorkTree(path.join(c, "new", "f.env"))).toBe(false);
  });
});

describe("writeSecretsFile", () => {
  const vals = { clientId: CID, clientSecret: CSECRET, refreshToken: RTOKEN, folderId: FOLDER };
  it("writes exactly 4 dotenv lines, LF, mode 600 / dir 700, atomic overwrite", () => {
    const d = tmp();
    const f = path.join(d, "cfg", "drive-secrets.env");
    writeSecretsFile(f, vals);
    const want =
      `TUDOCUATUI_GOOGLE_CLIENT_ID=${CID}\nTUDOCUATUI_GOOGLE_CLIENT_SECRET=${CSECRET}\n` +
      `TUDOCUATUI_GOOGLE_REFRESH_TOKEN=${RTOKEN}\nTUDOCUATUI_DRIVE_FOLDER_ID=${FOLDER}\n`;
    expect(fs.readFileSync(f, "utf8")).toBe(want);
    if (process.platform !== "win32") {
      expect(fs.statSync(f).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(f)).mode & 0o777).toBe(0o700);
    }
    writeSecretsFile(f, { ...vals, folderId: "otherFolder_0002" });
    expect(fs.readFileSync(f, "utf8")).toContain("otherFolder_0002");
    expect(fs.readdirSync(path.dirname(f))).toEqual(["drive-secrets.env"]);
  });
  it("inside a git tree -> throws, nothing written", () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".git"));
    expect(() => writeSecretsFile(path.join(d, "sub", "x.env"), vals)).toThrowError(
      expect.objectContaining({ code: 2 }),
    );
    expect(fs.existsSync(path.join(d, "sub"))).toBe(false);
  });
  it("values outside the deploy charset -> error before writing", () => {
    const d = tmp();
    const f = path.join(d, "x.env");
    for (const bad of [
      { ...vals, refreshToken: "tok\nTUDO_ACCESS_DISABLED=1" },
      { ...vals, refreshToken: "has space" },
      { ...vals, clientSecret: "a=b" },
      { ...vals, clientId: "plain-id" },
      { ...vals, folderId: "short" },
    ]) {
      expect(() => writeSecretsFile(f, bad)).toThrow();
    }
    expect(fs.existsSync(f)).toBe(false);
  });
  it("cleans the temp file when the rename fails", () => {
    const d = tmp();
    const f = path.join(d, "target");
    fs.mkdirSync(f); // rename of a file onto a directory fails
    expect(() => writeSecretsFile(f, vals)).toThrow();
    expect(fs.readdirSync(d)).toEqual(["target"]);
  });
});

describe("full run (fake Google)", () => {
  it("prints URL, account, folder id, path and the gh command; writes the file; exit 0", async () => {
    const r = await fullRun();
    expect(r.code).toBe(0);
    const text = r.out.join("\n");
    expect(text).toContain("Signed in as: a@example.com");
    expect(text).toContain(`Drive folder id: ${FOLDER}`);
    expect(text).toContain(`Secrets file: ${r.outFile}`);
    expect(text).toContain(
      `gh secret set -f "${r.outFile}" --env tudocuatui -R mmlabs-online/deployment`,
    );
    expect(text).toContain("gh secret list --env tudocuatui -R mmlabs-online/deployment");
    expect(fs.readFileSync(r.outFile, "utf8")).toContain(
      `TUDOCUATUI_GOOGLE_REFRESH_TOKEN=${RTOKEN}`,
    );
    const tokenCall = r.calls.find((c) => c.url.startsWith(ENDPOINTS.token))!;
    const body = new URLSearchParams(String(tokenCall.init?.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe(CODE);
    expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(body.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expectNoSecrets(r);
  });
  it("redaction on success and on every failure path; nothing written on failure", async () => {
    const cases: [string, Opts][] = [
      [
        "token error",
        { token: { status: 400, body: { error: "invalid_grant", error_description: CODE } } },
      ],
      [
        "no refresh_token",
        { token: { status: 200, body: { access_token: ATOKEN, scope: SCOPE } } },
      ],
      [
        "wrong scope",
        {
          token: {
            status: 200,
            body: { access_token: ATOKEN, refresh_token: RTOKEN, scope: "email" },
          },
        },
      ],
      ["token body not json", { token: { status: 500, body: "x" } }],
      ["wrong state", { callback: (_r, _s) => `code=${CODE}&state=nope` }],
      ["denied", { callback: (_r, s) => `error=access_denied&state=${s}` }],
      ["about fails", { about: { status: 500, body: {} } }],
      ["folder lookup fails", { list: { status: 500, body: {} } }],
      ["folder create fails", { create: { status: 500, body: { error: ATOKEN } } }],
      [
        "token with bad chars",
        {
          token: {
            status: 200,
            body: { access_token: ATOKEN, refresh_token: "a b\nc", scope: SCOPE },
          },
        },
      ],
    ];
    for (const [name, o] of cases) {
      const r = await fullRun(o);
      expect(r.code, name).toBe(1);
      expect(r.err.join("\n"), name).toMatch(/^error: /);
      expect(fs.existsSync(r.outFile), name).toBe(false);
      expectNoSecrets(r);
    }
  });
  it("an unexpected exception prints a fixed message", async () => {
    const dir = tmp();
    const err: string[] = [];
    const code = await run({
      argv: ["--client-file", clientFile(dir), "--out", path.join(dir, "o.env")],
      fetch: (async () => {
        throw new Error(`boom ${CSECRET}`);
      }) as unknown as typeof fetch,
      out: (s) => {
        if (s.startsWith("http")) {
          const u = new URL(s);
          void get(
            `${u.searchParams.get("redirect_uri")}?code=${CODE}&state=${u.searchParams.get("state")}`,
          );
        }
      },
      err: (s) => err.push(s),
      timeoutMs: 3000,
    });
    expect(code).toBe(1);
    expect(err.join("")).not.toContain(CSECRET);
  });
  it("warns about the file mode on Windows", async () => {
    const dir = tmp();
    const out: string[] = [];
    await run({
      argv: ["--client-file", clientFile(dir), "--out", path.join(dir, "o.env")],
      fetch: (async (u: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            u.startsWith(ENDPOINTS.token)
              ? { access_token: ATOKEN, refresh_token: RTOKEN, scope: SCOPE }
              : u.startsWith(ENDPOINTS.about)
                ? { user: { emailAddress: "a@example.com" } }
                : init?.method === "POST"
                  ? { id: FOLDER }
                  : { files: [{ id: FOLDER }] },
          ),
        )) as unknown as typeof fetch,
      out: (s) => {
        out.push(s);
        if (s.startsWith("http")) {
          const u = new URL(s);
          void get(
            `${u.searchParams.get("redirect_uri")}?code=${CODE}&state=${u.searchParams.get("state")}`,
          );
        }
      },
      err: () => {},
      timeoutMs: 3000,
      platform: "win32",
    });
    expect(out.join("\n")).toContain("Windows does not enforce");
  });
});

describe("CLI behaviour", () => {
  it("no args exits 2", async () => {
    const err: string[] = [];
    expect(await run({ argv: [], out: () => {}, err: (s) => err.push(s) })).toBe(2);
    expect(err[0]).toContain("usage");
  });
  it("--out inside a git tree exits 2 before any network call", async () => {
    const d = tmp();
    fs.mkdirSync(path.join(d, ".git"));
    let called = false;
    const code = await run({
      argv: ["--client-file", clientFile(d), "--out", path.join(d, "x.env")],
      fetch: (async () => {
        called = true;
        return new Response("{}");
      }) as unknown as typeof fetch,
      out: () => {},
      err: () => {},
    });
    expect(code).toBe(2);
    expect(called).toBe(false);
  });
  it("the default output path is ~/.config/tudocuatui/drive-secrets.env", async () => {
    const d = tmp();
    const home = tmp();
    const code = await run({
      argv: ["--client-file", clientFile(d)],
      fetch: (async (u: string, init?: RequestInit) =>
        new Response(
          JSON.stringify(
            u.startsWith(ENDPOINTS.token)
              ? { access_token: ATOKEN, refresh_token: RTOKEN, scope: SCOPE }
              : u.startsWith(ENDPOINTS.about)
                ? { user: { emailAddress: "a@example.com" } }
                : init?.method === "POST"
                  ? { id: FOLDER }
                  : { files: [] },
          ),
        )) as unknown as typeof fetch,
      out: (s) => {
        if (s.startsWith("http")) {
          const u = new URL(s);
          void get(
            `${u.searchParams.get("redirect_uri")}?code=${CODE}&state=${u.searchParams.get("state")}`,
          );
        }
      },
      err: () => {},
      homedir: home,
      timeoutMs: 3000,
    });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(home, ".config", "tudocuatui", "drive-secrets.env"))).toBe(true);
  });
});
