// @ts-check
// mmlabs Identity access-token verification (T-019.5; org-admin-api docs/consumers.md, "Verifying (backend)").
// Header only; fail closed; the result carries a fixed `code` and nothing else. Never logs, never reads
// err.message or the payload, never touches the database.
import { jwtVerify } from "jose";
import { createJwksResolver, JwksUnavailable } from "./jwks.js";
import { toUserId } from "./user.js";

export const AUDIENCE = "tudocuatui";
export const MAX_TOKEN_CHARS = 4096;
export const ISSUER_PROD = "https://api.mmlabs.online";
const ROLE_PREFIX = "tudocuatui:";
const MAX_TOKEN_AGE_S = 43200; // D46: 12-hour Identity tokens
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

class KeyInHeader extends Error {}

/** @param {unknown} err @returns {string} */
function codeOf(err) {
  if (err instanceof JwksUnavailable) return "jwks_unavailable";
  if (err instanceof KeyInHeader) return "key_in_header";
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
 * @param {{ issuer: string, jwksUrl?: string, jwks?: import("jose").JWTVerifyGetKey, fetch?: typeof globalThis.fetch, timeoutMs?: number, now?: () => number, log?: (entry: Record<string, unknown>) => void }} opts
 * @returns {{ verify(req: import("node:http").IncomingMessage): Promise<{ ok: true, userId: import("./user.js").UserId, email: string | null } | { ok: false, code: string, unavailable?: true }> }}
 */
export function createIdentityVerifier({ issuer, jwksUrl, jwks, fetch, timeoutMs, now, log }) {
  /** @type {import("jose").JWTVerifyGetKey | undefined} */
  let remote = jwks;
  /** @type {import("jose").JWTVerifyGetKey} */
  const getKey = async (header, token) => {
    // A token must never carry its own key or a key location (D50); checked before any key lookup.
    for (const f of ["jku", "x5u", "jwk", "x5c"]) if (f in header) throw new KeyInHeader();
    // Lazy: no fetch at startup (image start checks run without a network).
    remote ??= createJwksResolver({
      url: jwksUrl ?? `${issuer}/.well-known/jwks.json`,
      fetch,
      timeoutMs,
      now,
      log,
    });
    try {
      return await remote(header, token);
    } catch (err) {
      const code = /** @type {{ code?: unknown }} */ (err)?.code;
      if (
        err instanceof JwksUnavailable ||
        code === "ERR_JWKS_NO_MATCHING_KEY" ||
        code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS"
      )
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
          maxTokenAge: MAX_TOKEN_AGE_S,
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
        const email =
          typeof payload.email === "string" && payload.email !== "" ? payload.email : null;
        return { ok: true, userId, email };
      } catch (err) {
        const code = codeOf(err);
        return code === "jwks_unavailable"
          ? { ok: false, code, unavailable: true }
          : { ok: false, code };
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
