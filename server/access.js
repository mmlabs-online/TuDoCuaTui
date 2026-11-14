// @ts-check
// Cloudflare Access JWT verification (T-011 security note). Header only; never the cookie.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { toUserId } from "./user.js";

export class AccessConfigError extends Error {}

const TEAM_RE = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

/**
 * TUDO_OWNER_SUB is required in every mode. Never put the value in a message.
 * @param {Record<string, string | undefined>} env
 */
function loadOwnerSub(env) {
  if (!env.TUDO_OWNER_SUB?.trim()) throw new AccessConfigError("TUDO_OWNER_SUB must be set");
  const id = toUserId(env.TUDO_OWNER_SUB);
  if (!id) throw new AccessConfigError("TUDO_OWNER_SUB must be a valid UUID");
  return id;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ mode: "off", ownerSub: import("./user.js").UserId } | { mode: "on", issuer: string, certsUrl: string, aud: string, ownerSub: import("./user.js").UserId }}
 */
export function loadAccessConfig(env) {
  const team = env.CF_ACCESS_TEAM_DOMAIN;
  const aud = env.CF_ACCESS_AUD;
  if (team && aud) {
    if (!TEAM_RE.test(team)) {
      throw new AccessConfigError("CF_ACCESS_TEAM_DOMAIN must be <team>.cloudflareaccess.com");
    }
    if (/\s/.test(aud)) throw new AccessConfigError("CF_ACCESS_AUD must not contain whitespace");
    const ownerSub = loadOwnerSub(env);
    return {
      mode: "on",
      issuer: `https://${team}`,
      certsUrl: `https://${team}/cdn-cgi/access/certs`,
      aud,
      ownerSub,
    };
  }
  if (env.TUDO_ACCESS_DISABLED === "1") {
    if (env.NODE_ENV === "production") {
      throw new AccessConfigError("TUDO_ACCESS_DISABLED is not allowed in production");
    }
    return { mode: "off", ownerSub: loadOwnerSub(env) };
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

/** @typedef {{ ok: true, userId: import("./user.js").UserId } | { ok: false, code?: string }} AuthResult */
/** @typedef {{ authenticate(req: import("node:http").IncomingMessage): Promise<AuthResult> }} Auth */

/**
 * Access verified -> every request is the owner. The user never comes from headers, query or body.
 * @param {{ verifier: ReturnType<typeof createAccessVerifier>, ownerSub: import("./user.js").UserId }} opts
 * @returns {Auth}
 */
export function createAccessAuth({ verifier, ownerSub }) {
  return {
    async authenticate(req) {
      const r = await verifier.verify(req);
      return r.ok ? { ok: true, userId: ownerSub } : { ok: false, code: r.code };
    },
  };
}

/** Dev mode (check off): every request is the owner. @param {import("./user.js").UserId} ownerSub @returns {Auth} */
export function createFixedAuth(ownerSub) {
  return { authenticate: async () => ({ ok: true, userId: ownerSub }) };
}
