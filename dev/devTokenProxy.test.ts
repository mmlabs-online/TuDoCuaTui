// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TARGET,
  PROXY_KEY,
  devTokenProxy,
  proxyTarget,
  readDevToken,
  rewriteAuth,
  tokenFilePath,
  warningFor,
} from "./devTokenProxy";

const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const jwt = (exp: number) =>
  [
    Buffer.from('{"alg":"none"}').toString("base64url"),
    Buffer.from(JSON.stringify({ exp })).toString("base64url"),
    "sig_-x",
  ].join(".");
const FRESH = jwt(NOW / 1000 + 600);
const STALE = jwt(NOW / 1000 - 5);

const tmpDirs: string[] = [];
function tokenFile(content: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tudo-dev-"));
  tmpDirs.push(dir);
  const file = path.join(dir, "dev-token");
  if (content !== null) fs.writeFileSync(file, content);
  return file;
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("devTokenProxy plugin", () => {
  const apply = devTokenProxy().apply as (c: unknown, e: unknown) => boolean;

  it("applies only to serve, not build, not preview", () => {
    expect(apply({}, { command: "serve", isPreview: false })).toBe(true);
    expect(apply({}, { command: "build", isPreview: false })).toBe(false);
    expect(apply({}, { command: "serve", isPreview: true })).toBe(false);
  });

  it("proxy rule matches /api, /api/items/x, /healthz; not /apix, /healthzz, /src/api.ts", () => {
    const re = new RegExp(PROXY_KEY);
    for (const ok of ["/api", "/api/items/x", "/healthz", "/healthz/x"]) {
      expect(re.test(ok)).toBe(true);
    }
    for (const no of ["/apix", "/healthzz", "/src/api.ts", "/"]) expect(re.test(no)).toBe(false);
  });

  it("registers exactly one proxy rule", () => {
    const plugin = devTokenProxy();
    const cfg = (plugin.config as () => { server: { proxy: Record<string, unknown> } })();
    expect(Object.keys(cfg.server.proxy)).toEqual([PROXY_KEY]);
  });

  it("default target http://127.0.0.1:3000; TUDO_DEV_API overrides", () => {
    expect(DEFAULT_TARGET).toBe("http://127.0.0.1:3000");
    expect(proxyTarget({})).toBe("http://127.0.0.1:3000");
    expect(proxyTarget({ TUDO_DEV_API: "http://127.0.0.1:4000" })).toBe("http://127.0.0.1:4000");
  });
});

describe("tokenFilePath", () => {
  it("token file: default under the home dir (outside the repo); TUDO_DEV_TOKEN_FILE overrides", () => {
    const p = tokenFilePath({}, "/home/ming");
    expect(p).toBe(path.join("/home/ming", ".config", "tudocuatui", "dev-token"));
    expect(tokenFilePath({ TUDO_DEV_TOKEN_FILE: "/x/t" }, "/home/ming")).toBe("/x/t");
  });
});

describe("readDevToken", () => {
  it("missing file -> missing", () => {
    expect(readDevToken(tokenFile(null), NOW)).toEqual({ status: "missing" });
  });
  it("not JWT-shaped -> malformed", () => {
    expect(readDevToken(tokenFile("not a token"), NOW)).toEqual({ status: "malformed" });
    expect(readDevToken(tokenFile("a.b.c"), NOW)).toEqual({ status: "malformed" });
    expect(readDevToken(tokenFile(""), NOW)).toEqual({ status: "malformed" });
  });
  it("exp in the past -> expired", () => {
    expect(readDevToken(tokenFile(STALE), NOW)).toEqual({ status: "expired" });
  });
  it("valid -> token (trailing newline trimmed)", () => {
    expect(readDevToken(tokenFile(FRESH + "\n"), NOW)).toEqual({ status: "ok", token: FRESH });
  });
});

describe("rewriteAuth", () => {
  const ok = { status: "ok", token: FRESH } as const;

  it("always strips the client Authorization header", () => {
    for (const r of [ok, { status: "missing" } as const]) {
      const out = rewriteAuth({ authorization: "Bearer attacker", accept: "x" }, r);
      expect(out.authorization === `Bearer ${FRESH}` || out.authorization === undefined).toBe(true);
      expect(out.accept).toBe("x");
    }
    expect(rewriteAuth({ authorization: "Bearer attacker" }, { status: "expired" })).toEqual({});
  });

  it("injects Bearer for sec-fetch-site same-origin or absent; not for cross-site, same-site, none", () => {
    expect(rewriteAuth({}, ok).authorization).toBe(`Bearer ${FRESH}`);
    expect(rewriteAuth({ "sec-fetch-site": "same-origin" }, ok).authorization).toBe(
      `Bearer ${FRESH}`,
    );
    for (const site of ["cross-site", "same-site", "none"]) {
      expect(rewriteAuth({ "sec-fetch-site": site }, ok).authorization).toBeUndefined();
    }
  });

  it("no header when the token is missing, expired or malformed", () => {
    for (const status of ["missing", "expired", "malformed"] as const) {
      expect(rewriteAuth({}, { status }).authorization).toBeUndefined();
    }
  });
});

describe("warnings", () => {
  it("warnings never contain the token", () => {
    expect(warningFor({ status: "ok", token: FRESH })).toBeNull();
    for (const status of ["missing", "expired", "malformed"] as const) {
      const w = warningFor({ status })!;
      expect(w).toContain("run scripts/dev-token.sh");
      expect(w).not.toContain(FRESH);
    }
  });

  it("plugin logs one line per distinct problem and never the token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = tokenFile(null);
    vi.stubEnv("TUDO_DEV_TOKEN_FILE", file);
    const plugin = devTokenProxy();
    vi.unstubAllEnvs();
    const cfg = (
      plugin.config as () => {
        server: {
          proxy: Record<
            string,
            { configure: (p: { on: (e: string, cb: unknown) => void }) => void }
          >;
        };
      }
    )();
    let handler: (pr: unknown, req: unknown) => void = () => {};
    cfg.server.proxy[PROXY_KEY].configure({ on: (_e, cb) => (handler = cb as typeof handler) });
    const headers: Record<string, string> = {};
    const proxyReq = {
      removeHeader: (n: string) => delete headers[n],
      setHeader: (n: string, v: string) => (headers[n] = v),
    };
    handler(proxyReq, { headers: { authorization: "Bearer attacker" } });
    handler(proxyReq, { headers: {} });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(headers.authorization).toBeUndefined();
    fs.writeFileSync(file, FRESH);
    handler(proxyReq, { headers: {} });
    expect(warn.mock.calls.flat().join(" ")).not.toContain(FRESH);
  });
});

describe("source scan", () => {
  const root = path.resolve(__dirname, "..");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });

  it("no VITE_ in dev/; nothing under src/ or index.html mentions dev-token, devTokenProxy or TUDO_DEV", () => {
    for (const f of walk(__dirname).filter((f) => !f.endsWith(".test.ts"))) {
      expect(fs.readFileSync(f, "utf8"), f).not.toContain("VITE" + "_");
    }
    const re = /dev-token|devTokenProxy|TUDO_DEV/;
    for (const f of [...walk(path.join(root, "src")), path.join(root, "index.html")]) {
      expect(fs.readFileSync(f, "utf8"), f).not.toMatch(re);
    }
  });
});
