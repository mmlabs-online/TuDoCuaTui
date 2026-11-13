// @ts-check
// AES-256-GCM sealing of the provider API key. Format: "v1:" + base64(IV || ciphertext+tag).
// The AAD binds the ciphertext to the provider. Port of supabase/functions/_shared/core/crypto.ts (no user id: D25).

/** @typedef {import("node:crypto").webcrypto.CryptoKey} AiKek */

const VERSION = "v1";
const IV_BYTES = 12;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** @param {string} provider */
const aad = (provider) =>
  new TextEncoder().encode(`tudocuatui-ai-key|${VERSION}|single|${provider}`);

/** @param {string} b64 @returns {Uint8Array} */
function fromBase64(b64) {
  if (b64.length % 4 !== 0 || !B64.test(b64)) throw new Error("bad_base64");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Imports the KEK (base64 of exactly 32 bytes) as a non-extractable key. Throws "server_misconfigured".
 * @param {string | undefined} b64
 */
export async function importKek(b64) {
  /** @type {Uint8Array} */
  let raw;
  try {
    raw = fromBase64((b64 ?? "").trim());
  } catch {
    throw new Error("server_misconfigured");
  }
  if (raw.length !== 32) throw new Error("server_misconfigured");
  return globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** @param {AiKek} kek @param {string} provider @param {string} plaintext @returns {Promise<string>} */
export async function sealKey(kek, provider, plaintext) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(provider) },
      kek,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${VERSION}:${Buffer.concat([iv, ct]).toString("base64")}`;
}

/**
 * Opens a stored secret; every failure is the single code "key_unreadable", never an error object.
 * T-019.3 changes the AAD here (v2, sub) and nowhere else.
 * @param {AiKek} kek
 * @param {{ provider: string, ciphertext: string } | null} secret
 * @returns {Promise<{ ok: true, key: string } | { ok: false, code: "not_configured" | "key_unreadable" }>}
 */
export async function openStoredKey(kek, secret) {
  if (!secret) return { ok: false, code: "not_configured" };
  try {
    return { ok: true, key: await openKey(kek, secret.provider, secret.ciphertext) };
  } catch {
    return { ok: false, code: "key_unreadable" };
  }
}

/**
 * Throws on any failure (wrong KEK, provider, tampering, unknown version).
 * @param {AiKek} kek @param {string} provider @param {string} sealed @returns {Promise<string>}
 */
export async function openKey(kek, provider, sealed) {
  const prefix = `${VERSION}:`;
  if (!sealed.startsWith(prefix)) throw new Error("unreadable");
  const bytes = fromBase64(sealed.slice(prefix.length));
  if (bytes.length <= IV_BYTES) throw new Error("unreadable");
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES), additionalData: aad(provider) },
    kek,
    bytes.slice(IV_BYTES),
  );
  return new TextDecoder().decode(pt);
}
