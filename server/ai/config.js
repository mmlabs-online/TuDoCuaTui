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
