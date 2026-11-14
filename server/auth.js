// @ts-check
// Auth mode switch (T-019.5, umbrella A4): TUDO_AUTH_MODE = access (default) | identity.
import {
  createAccessAuth,
  createAccessVerifier,
  createFixedAuth,
  loadAccessConfig,
} from "./access.js";
import { createIdentityAuth, createIdentityVerifier, loadIdentityConfig } from "./identity.js";

/** @typedef {{ ok: true, userId: import("./user.js").UserId } | { ok: false, code?: string }} AuthResult */
/** @typedef {{ authenticate(req: import("node:http").IncomingMessage): Promise<AuthResult> }} Auth */
/** @typedef {{ mode: "access", access: ReturnType<typeof loadAccessConfig> } | { mode: "identity", identity: ReturnType<typeof loadIdentityConfig> }} AuthConfig */

export class AuthConfigError extends Error {}

/**
 * Exactly `access` or `identity`; anything else (also empty, padded, other case) is an error. Messages never
 * carry the value. Identity mode does not read CF_ACCESS_* or TUDO_OWNER_SUB.
 * @param {Record<string, string | undefined>} env
 * @returns {AuthConfig}
 */
export function loadAuthConfig(env) {
  const mode = env.TUDO_AUTH_MODE ?? "access";
  if (mode === "access") return { mode, access: loadAccessConfig(env) };
  if (mode !== "identity") throw new AuthConfigError("TUDO_AUTH_MODE must be access or identity");
  if (env.TUDO_ACCESS_DISABLED === "1") {
    throw new AuthConfigError(
      "TUDO_ACCESS_DISABLED cannot be combined with TUDO_AUTH_MODE=identity",
    );
  }
  return { mode, identity: loadIdentityConfig(env) };
}

/** @param {AuthConfig} cfg @returns {Auth} */
export function createAuth(cfg) {
  if (cfg.mode === "identity") {
    return createIdentityAuth({ verifier: createIdentityVerifier(cfg.identity) });
  }
  const a = cfg.access;
  return a.mode === "on"
    ? createAccessAuth({ verifier: createAccessVerifier(a), ownerSub: a.ownerSub })
    : createFixedAuth(a.ownerSub);
}

/** AI needs a verified caller: access verified, or identity. @param {AuthConfig} cfg */
export function requestAuth(cfg) {
  return cfg.mode === "identity" || cfg.access.mode === "on";
}

/** @param {AuthConfig} cfg */
export function authLabel(cfg) {
  return cfg.mode;
}
