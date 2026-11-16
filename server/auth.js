// @ts-check
// Auth (T-019.5, T-019.9): mmlabs Identity bearer tokens only. TUDO_AUTH_MODE is optional; unset or exactly
// `identity`. Anything else is a config error (the server exits 2).
import { toUserId } from "./user.js";
import { createIdentityAuth, createIdentityVerifier, loadIdentityConfig } from "./identity.js";

/** @typedef {{ ok: true, userId: import("./user.js").UserId } | { ok: false, code?: string }} AuthResult */
/** @typedef {{ authenticate(req: import("node:http").IncomingMessage): Promise<AuthResult> }} Auth */
/** @typedef {{ mode: "identity", identity: ReturnType<typeof loadIdentityConfig> & { ownerSub: import("./user.js").UserId } }} AuthConfig */

export class AuthConfigError extends Error {}

/**
 * TUDO_AUTH_MODE unset or exactly `identity`; anything else (also empty, padded, other case) is an error.
 * Needs MM_IDENTITY_ISSUER and TUDO_OWNER_SUB (the owner lane for abuse limits). Messages never carry the value.
 * @param {Record<string, string | undefined>} env
 * @returns {AuthConfig}
 */
export function loadAuthConfig(env) {
  const mode = env.TUDO_AUTH_MODE ?? "identity";
  if (mode !== "identity") throw new AuthConfigError("TUDO_AUTH_MODE must be identity or unset");
  const identity = loadIdentityConfig(env);
  if (!env.TUDO_OWNER_SUB?.trim()) throw new AuthConfigError("TUDO_OWNER_SUB must be set");
  const ownerSub = toUserId(env.TUDO_OWNER_SUB);
  if (!ownerSub) throw new AuthConfigError("TUDO_OWNER_SUB must be a valid UUID");
  return { mode, identity: { ...identity, ownerSub } };
}

/** The owner's user id. @param {AuthConfig} cfg */
export function ownerSubOf(cfg) {
  return cfg.identity.ownerSub;
}

/** @param {AuthConfig} cfg @returns {Auth} */
export function createAuth(cfg) {
  return createIdentityAuth({ verifier: createIdentityVerifier(cfg.identity) });
}

/** @param {AuthConfig} cfg */
export function authLabel(cfg) {
  return cfg.mode;
}
