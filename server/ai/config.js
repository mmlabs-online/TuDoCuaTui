// @ts-check
// AI_KEK: base64 of exactly 32 bytes. Unset or empty = AI off; malformed = AiConfigError (the server exits 2).

export class AiConfigError extends Error {}

/**
 * Messages name the variable, never the value.
 * @param {Record<string, string | undefined>} env
 * @returns {{ mode: "off" } | { mode: "on", kekB64: string }}
 */
export function loadAiConfig(env) {
  const v = env.AI_KEK || "";
  if (!v) return { mode: "off" };
  if (!/^[A-Za-z0-9+/]{43}=$/.test(v) || Buffer.from(v, "base64").length !== 32) {
    throw new AiConfigError("malformed AI_KEK (expected base64 of 32 bytes)");
  }
  return { mode: "on", kekB64: v };
}

/**
 * Startup decision for AI. Always removes AI_KEK from env (it is never read again). Malformed throws.
 * T-019.5: requestAuth becomes "auth mode is access or identity".
 * @param {Record<string, string | undefined>} env
 * @param {{ requestAuth: boolean, importKek: (b64: string) => Promise<import("./crypto.js").AiKek> }} deps
 * @returns {Promise<{ ai: { kek: import("./crypto.js").AiKek } | null, line: string }>}
 */
export async function initAi(env, { requestAuth, importKek }) {
  /** @type {ReturnType<typeof loadAiConfig>} */
  let cfg;
  try {
    cfg = loadAiConfig(env);
  } finally {
    delete env.AI_KEK;
  }
  if (cfg.mode === "off") return { ai: null, line: "ai not configured" };
  if (!requestAuth) return { ai: null, line: "ai disabled: request auth off" };
  return { ai: { kek: await importKek(cfg.kekB64) }, line: "ai configured" };
}
