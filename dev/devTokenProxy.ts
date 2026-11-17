import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingHttpHeaders } from "node:http";
import type { Plugin } from "vite";

/**
 * Dev-only (D44): `pnpm dev` proxies /api and /healthz to a local Node server and adds the Identity bearer
 * token on the Node side of the proxy. The token comes from a file written by scripts/dev-token.sh and is read
 * on every request; it never reaches the browser, build-time env variables or `dist/`.
 */

export type TokenResult =
  | { status: "ok"; token: string }
  | { status: "missing" | "malformed" | "expired" };

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** Matches /api, /api/..., /healthz, /healthz/... only. */
export const PROXY_KEY = "^/(api|healthz)(/|$)";
export const DEFAULT_TARGET = "http://127.0.0.1:3000";

export function proxyTarget(env: NodeJS.ProcessEnv): string {
  return env.TUDO_DEV_API || DEFAULT_TARGET;
}

/** Default is outside the repo, so git and Docker can never see it. */
export function tokenFilePath(env: NodeJS.ProcessEnv, homedir: string): string {
  return env.TUDO_DEV_TOKEN_FILE || path.join(homedir, ".config", "tudocuatui", "dev-token");
}

function expOf(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload?.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Synchronous on purpose: read per request, so a refreshed token needs no restart. */
export function readDevToken(file: string, nowMs: number): TokenResult {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8").trim();
  } catch {
    return { status: "missing" };
  }
  if (!JWT_SHAPE.test(raw)) return { status: "malformed" };
  const exp = expOf(raw);
  if (exp === null) return { status: "malformed" };
  if (exp * 1000 <= nowMs) return { status: "expired" };
  return { status: "ok", token: raw };
}

/**
 * Returns the headers to forward: the client's Authorization is always dropped; the bearer is set only for
 * same-origin (or non-browser) requests and a valid token.
 */
export function rewriteAuth(
  headers: IncomingHttpHeaders,
  result: TokenResult,
): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = { ...headers };
  delete out.authorization;
  const site = headers["sec-fetch-site"];
  if (result.status === "ok" && (site === undefined || site === "same-origin")) {
    out.authorization = `Bearer ${result.token}`;
  }
  return out;
}

export function warningFor(result: TokenResult): string | null {
  if (result.status === "ok") return null;
  return `[dev-token] token ${result.status} - run scripts/dev-token.sh`;
}

export function devTokenProxy(): Plugin {
  const file = tokenFilePath(process.env, os.homedir());
  let lastWarning: string | null = null;
  return {
    name: "tudo-dev-token-proxy",
    apply: (_config, env) => env.command === "serve" && !env.isPreview,
    config() {
      return {
        server: {
          proxy: {
            [PROXY_KEY]: {
              target: proxyTarget(process.env),
              configure: (proxy) => {
                proxy.on("proxyReq", (proxyReq, req) => {
                  const result = readDevToken(file, Date.now());
                  const warning = warningFor(result);
                  if (warning !== lastWarning) {
                    lastWarning = warning;
                    if (warning) console.warn(warning);
                  }
                  const out = rewriteAuth(req.headers, result);
                  proxyReq.removeHeader("authorization");
                  if (out.authorization) proxyReq.setHeader("authorization", out.authorization);
                });
              },
            },
          },
        },
      };
    },
  };
}
