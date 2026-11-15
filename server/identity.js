// @ts-check
// mmlabs Identity access-token verification (T-019.5; org-admin-api docs/consumers.md, "Verifying (backend)").
// Header only; fail closed; the result carries a fixed `code` and nothing else. Never logs, never reads
// err.message or the payload, never touches the database.
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import { toUserId } from "./user.js";

export const AUDIENCE = "tudocuatui";
export const MAX_TOKEN_CHARS = 4096;
export const ISSUER_PROD = "https://api.mmlabs.online";
const ROLE_PREFIX = "tudocuatui:";
const CLAIMS = new Set(["iss", "aud", "typ", "iat", "nbf", "exp", "sub", "jti"]);
const TOKEN_RE = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

export class IdentityConfigError extends Error {}

/**
 * MM_IDENTITY_ISSUER must be exactly `https://<host>` (production: https://api.mmlabs.online). Outside
 * production, `http://localhost:<port>` is also allowed (local Identity API). Messages never carry the value.
 * @param {Record<string, string | undefined>} env
 * @returns {{ issuer: string, jwksUrl: string }}
 */
export function loadIdentityConfig(env) {
  const raw = env.MM_IDENTITY_ISSUER;
  if (!raw) throw new IdentityConfigError("MM_IDENTITY_ISSUER must be set");
  const bad = new IdentityConfigError("MM_IDENTITY_ISSUER must be https://<host>");
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw bad;
  }
  const production = env.NODE_ENV === "production";
  const localhost = u.protocol === "http:" && u.hostname === "localhost" && u.port !== "";
  const plain =
    u.username === "" &&
    u.password === "" &&
    (u.port === "" || localhost) &&
    raw === `${u.protocol}//${u.host}`;
  if (!plain || (u.protocol !== "https:" && !(localhost && !production))) throw bad;
  if (production && raw !== ISSUER_PROD) {
    throw new IdentityConfigError(`MM_IDENTITY_ISSUER must be ${ISSUER_PROD} in production`);
  }
  return { issuer: raw, jwksUrl: `${raw}/.well-known/jwks.json` };
}

class JwksUnavailable extends Error {}

/** @param {unknown} err @returns {string} */
function codeOf(err) {
  if (err instanceof JwksUnavailable) return "jwks_unavailable";
  const e = /** @type {{ code?: unknown, claim?: unknown }} */ (err);
  switch (e?.code) {
    case "ERR_JWS_INVALID":
    case "ERR_JWT_INVALID":
      return "malformed";
    case "ERR_JOSE_ALG_NOT_ALLOWED":
      return "alg";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "signature";
    case "ERR_JWT_EXPIRED":
      return "expired";
    case "ERR_JWKS_NO_MATCHING_KEY":
      return "unknown_kid";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      return typeof e.claim === "string" && CLAIMS.has(e.claim) ? `claim_${e.claim}` : "invalid";
    default:
      return "invalid";
  }
}

/**
 * @param {{ issuer: string, jwksUrl?: string, jwks?: import("jose").JWTVerifyGetKey, fetch?: typeof globalThis.fetch, timeoutMs?: number }} opts
 * @returns {{ verify(req: import("node:http").IncomingMessage): Promise<{ ok: true, userId: import("./user.js").UserId } | { ok: false, code: string }> }}
 */
export function createIdentityVerifier({ issuer, jwksUrl, jwks, fetch, timeoutMs }) {
  /** @type {import("jose").JWTVerifyGetKey | undefined} */
  let remote = jwks;
  /** @type {import("jose").JWTVerifyGetKey} */
  const getKey = async (header, token) => {
    // Lazy: no fetch at startup (image start checks run without a network).
    remote ??= createRemoteJWKSet(new URL(jwksUrl ?? `${issuer}/.well-known/jwks.json`), {
      cacheMaxAge: 300_000,
      cooldownDuration: 60_000,
      timeoutDuration: timeoutMs ?? 5_000,
      headers: { "User-Agent": "tudocuatui-server" },
      ...(fetch ? { [customFetch]: fetch } : {}),
    });
    try {
      return await remote(header, token);
    } catch (err) {
      const code = /** @type {{ code?: unknown }} */ (err)?.code;
      if (code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS")
        throw err;
      throw new JwksUnavailable();
    }
  };
  return {
    async verify(req) {
      const header = req.headers.authorization;
      if (typeof header !== "string" || !/^Bearer /i.test(header))
        return { ok: false, code: "missing" };
      if (header.length > 7 + MAX_TOKEN_CHARS) return { ok: false, code: "too_large" };
      const m = TOKEN_RE.exec(header);
      if (!m) return { ok: false, code: "malformed" };
      try {
        const { payload } = await jwtVerify(m[1], getKey, {
          algorithms: ["ES256"],
          issuer,
          audience: AUDIENCE,
          typ: "at+jwt",
          requiredClaims: ["exp", "iat", "sub", "jti", "iss", "aud"],
          clockTolerance: 30,
          maxTokenAge: 900,
        });
        if (typeof payload.aud !== "string") return { ok: false, code: "claim_aud" };
        if (typeof payload.jti !== "string" || payload.jti === "")
          return { ok: false, code: "claim_jti" };
        if (payload.email_verified !== true) return { ok: false, code: "email_unverified" };
        const sub = payload.sub;
        const userId = typeof sub === "string" ? toUserId(sub) : null;
        if (!userId || userId !== sub) return { ok: false, code: "sub_invalid" };
        const roles = payload.roles;
        const hasRole =
          Array.isArray(roles) &&
          roles.some(
            (r) =>
              typeof r === "string" && r.startsWith(ROLE_PREFIX) && r.length > ROLE_PREFIX.length,
          );
        if (!hasRole) return { ok: false, code: "no_role" };
        return { ok: true, userId };
      } catch (err) {
        return { ok: false, code: codeOf(err) };
      }
    },
  };
}

/**
 * @param {{ verifier: ReturnType<typeof createIdentityVerifier> }} opts
 * @returns {import("./auth.js").Auth}
 */
export function createIdentityAuth({ verifier }) {
  return { authenticate: (req) => verifier.verify(req) };
}
