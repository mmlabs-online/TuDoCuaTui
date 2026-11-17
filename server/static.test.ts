// @vitest-environment node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SPA_CSP } from "./http.js";
import { mimeFor, referrerPolicyFor, resolveStaticPath, serveStatic } from "./static.js";

let dir: string;
let server: http.Server;
let base: string;

beforeAll(async () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), "tudo-static-"));
  dir = path.join(outer, "dist");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<html>INDEX</html>");
  fs.writeFileSync(path.join(dir, "version.txt"), "1.2.3");
  fs.writeFileSync(path.join(dir, "robots.txt"), "User-agent: *");
  fs.writeFileSync(path.join(dir, "assets", "x.js"), "console.log(1)");
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=1");
  fs.mkdirSync(path.join(dir, ".git"));
  fs.writeFileSync(path.join(dir, ".git", "config"), "SECRET=2");
  fs.writeFileSync(path.join(outer, "package.json"), "OUTSIDE");
  server = http.createServer((req, res) => {
    void serveStatic(req, res, dir, (req.url ?? "/").split("?")[0]);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

// fetch normalises dot segments, so raw requests are needed for traversal cases.
function raw(p: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: (server.address() as AddressInfo).port, path: p, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("static serving", () => {
  it("`/` and `/index.html` resolve to index.html with `no-cache`", async () => {
    for (const p of ["/", "/index.html"]) {
      const res = await fetch(base + p);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(await res.text()).toContain("INDEX");
    }
  });

  it("`/version.txt` -> `no-cache`, `text/plain; charset=utf-8`", async () => {
    const res = await fetch(base + "/version.txt");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("1.2.3");
  });

  it("other files carry no Cache-Control (as nginx)", async () => {
    const res = await fetch(base + "/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("`/assets/x.js` found -> immutable, `text/javascript; charset=utf-8`", async () => {
    const res = await fetch(base + "/assets/x.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
  });

  it("`/assets/missing.js` -> 404, never index.html", async () => {
    const res = await fetch(base + "/assets/missing.js");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("INDEX");
  });

  it("unknown non-asset path -> fallback index.html (`no-cache`)", async () => {
    const res = await fetch(base + "/some/deep/path");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain("INDEX");
  });

  it("HEAD sends headers only", async () => {
    const res = await fetch(base + "/", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("directory path (`/assets`, `/assets/`) -> fallback/404, never a listing", async () => {
    const a = await fetch(base + "/assets");
    expect(await a.text()).toContain("INDEX");
    const b = await fetch(base + "/assets/");
    expect(b.status).toBe(404);
  });

  it("falls back to 404 when index.html is missing", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "tudo-empty-"));
    try {
      const s = http.createServer((req, res) => void serveStatic(req, res, empty, "/x"));
      await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/x`);
      expect(res.status).toBe(404);
      await new Promise((r) => s.close(r));
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("path safety", () => {
  it("traversal attempts never escape the root", async () => {
    const cases = [
      "/../package.json",
      "/%2e%2e/%2e%2e/etc/passwd",
      "/assets/..%2f..%2fpackage.json",
      "/%00",
      "//etc/passwd",
      "/assets/%5c..%5cpackage.json",
      "/%E0%A4%A",
    ];
    for (const c of cases) {
      const { status, body } = await raw(c);
      expect([200, 400, 404]).toContain(status);
      expect(body).not.toContain("OUTSIDE");
      expect(body).not.toContain("root:");
    }
  });

  it("dot-segment files (`/.env`, `/.git/config`) are never served", async () => {
    for (const p of ["/.env", "/.git/config"]) {
      const res = await fetch(base + p);
      const text = await res.text();
      expect(text).not.toContain("SECRET");
    }
  });

  it("resolveStaticPath classifies bad, missing and found", async () => {
    expect(await resolveStaticPath(dir, "/%E0%A4%A")).toEqual({ bad: true });
    expect(await resolveStaticPath(dir, "/a\\b")).toEqual({ bad: true });
    expect(await resolveStaticPath(dir, "/../package.json")).toEqual({ notFound: true });
    expect(await resolveStaticPath(dir, "/version.txt")).toEqual({
      file: path.join(dir, "version.txt"),
    });
    expect(await resolveStaticPath(dir, "/")).toEqual({ notFound: true });
  });
});

describe("MIME map", () => {
  it("html, js, css, svg, png, ico, txt, json, webmanifest, woff2; unknown -> octet-stream", () => {
    expect(mimeFor("a.html")).toBe("text/html; charset=utf-8");
    expect(mimeFor("a.js")).toBe("text/javascript; charset=utf-8");
    expect(mimeFor("a.css")).toBe("text/css; charset=utf-8");
    expect(mimeFor("a.svg")).toBe("image/svg+xml");
    expect(mimeFor("a.png")).toBe("image/png");
    expect(mimeFor("a.ico")).toBe("image/x-icon");
    expect(mimeFor("a.txt")).toBe("text/plain; charset=utf-8");
    expect(mimeFor("a.json")).toBe("application/json; charset=utf-8");
    expect(mimeFor("a.webmanifest")).toBe("application/manifest+json");
    expect(mimeFor("a.woff2")).toBe("font/woff2");
    expect(mimeFor("a.zzz")).toBe("application/octet-stream");
  });
});

const CHALLENGES = "https://challenges.cloudflare.com";

function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    expect(out[name]).toBeUndefined();
    out[name] = sources;
  }
  return out;
}

describe("security headers", () => {
  it("SPA responses carry the CSP", async () => {
    for (const p of ["/", "/index.html", "/some/deep/path", "/assets/x.js", "/assets/missing.js"]) {
      const res = await fetch(base + p);
      expect(res.headers.get("content-security-policy")).toBe(SPA_CSP);
      await res.text();
    }
    const head = await fetch(base + "/", { method: "HEAD" });
    expect(head.headers.get("content-security-policy")).toBe(SPA_CSP);
  });

  it("CSP directives are exact", () => {
    expect(parseCsp(SPA_CSP)).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", CHALLENGES],
      "worker-src": ["'self'"],
      "style-src": ["'self'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "blob:", "data:"],
      "connect-src": ["'self'", "https://api.mmlabs.online", "blob:", "data:"],
      "frame-src": [CHALLENGES],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("CSP has no unsafe sources and keeps Turnstile out of connect-src", () => {
    expect(SPA_CSP).not.toMatch(/'unsafe-inline'|'unsafe-eval'|\*|http:/);
    const csp = parseCsp(SPA_CSP);
    for (const d of ["connect-src", "default-src", "img-src", "worker-src"]) {
      expect(csp[d]).not.toContain(CHALLENGES);
    }
    expect(csp["script-src"]).not.toContain("data:");
    expect(csp["script-src"]).not.toContain("blob:");
    expect(csp["worker-src"]).not.toContain("blob:");
    expect(csp["worker-src"]).not.toContain("data:");
  });

  it("SPA responses carry HSTS", async () => {
    for (const p of ["/", "/assets/x.js"]) {
      const res = await fetch(base + p);
      expect(res.headers.get("strict-transport-security")).toBe(
        "max-age=31536000; includeSubDomains",
      );
      await res.text();
    }
  });

  it("`/verify-email` and `/reset-password` -> `Referrer-Policy: no-referrer`", async () => {
    for (const p of [
      "/verify-email",
      "/verify-email/",
      "/verify-email?x=1",
      "/reset-password",
      "/reset-password/",
    ]) {
      const res = await fetch(base + p);
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      expect(await res.text()).toContain("INDEX");
    }
  });

  it("other paths get no Referrer-Policy override", async () => {
    for (const p of ["/", "/verify-emailx", "/verify-email/x", "/VERIFY-EMAIL", "/assets/x.js"]) {
      const res = await fetch(base + p);
      expect(res.headers.get("referrer-policy")).toBeNull();
      await res.text();
    }
  });

  it("referrerPolicyFor", () => {
    for (const p of ["/verify-email", "/verify-email/", "/reset-password", "/reset-password/"]) {
      expect(referrerPolicyFor(p)).toBe("no-referrer");
    }
    for (const p of ["", "/", "/verify-emailx", "/verify-email/x", "/VERIFY-EMAIL"]) {
      expect(referrerPolicyFor(p)).toBeUndefined();
    }
  });

  it("source index.html has no inline script or style", () => {
    const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag).toContain("src=");
    expect(html).not.toContain("<style");
  });
});
