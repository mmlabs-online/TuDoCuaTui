// @ts-check
// Cloudflare Access JWT verification (T-011 security note). Header only; never the cookie.
import { createRemoteJWKSet, jwtVerify } from "jose";

export class AccessConfigError extends Error {}

const TEAM_RE = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ mode: "off" } | { mode: "on", issuer: string, certsUrl: string, aud: string }}
 */
export function loadAccessConfig(env) {
  const team = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (team && aud) {
    if (!TEAM_RE.test(team)) {
      throw new AccessConfigError("CF_ACCESS_TEAM_DOMAIN must be <team>.cloudflareaccess.com");
    }
    if (/\s/.test(aud)) throw new AccessConfigError("CF_ACCESS_AUD must not contain whitespace");
    return {
      mode: "on",
      issuer: `https://${team}`,
      certsUrl: `https://${team}/cdn-cgi/access/certs`,
      aud,
    };
  }
  if (env.TUDO_ACCESS_DISABLED === "1") {
    if (env.NODE_ENV === "production") {
      throw new AccessConfigError("TUDO_ACCESS_DISABLED is not allowed in production");
    }
    return { mode: "off" };
  }
  throw new AccessConfigError("CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD must be set");
}

/**
 * @param {{ issuer: string, aud: string, certsUrl?: string, jwks?: import("jose").JWTVerifyGetKey }} opts
 * @returns {{ verify(req: import("node:http").IncomingMessage): Promise<{ ok: boolean, code?: string }> }}
 */
export function createAccessVerifier({ issuer, aud, certsUrl, jwks }) {
  const keys = jwks ?? createRemoteJWKSet(new URL(/** @type {string} */ (certsUrl)));
  return {
    async verify(req) {
      const token = req.headers["cf-access-jwt-assertion"];
      if (typeof token !== "string" || token === "") return { ok: false, code: "missing" };
      try {
        await jwtVerify(token, keys, {
          issuer,
          audience: aud,
          algorithms: ["RS256"],
          clockTolerance: 30,
        });
        return { ok: true };
      } catch (err) {
        const code = /** @type {{ code?: unknown }} */ (err)?.code;
        return { ok: false, code: typeof code === "string" ? code : "invalid" };
      }
    },
  };
}
