// @ts-check
// AES-256-GCM sealing of the provider API key. Format: "v2:" + base64(IV || ciphertext+tag).
// The AAD binds the ciphertext to the user (`sub`) and the provider (D33). v1 (AAD "single") is rejected on
// purpose: there is no fallback, so a ciphertext never opens for another user.
import { toUserId } from "../user.js";

/** @typedef {import("node:crypto").webcrypto.CryptoKey} AiKek */

const VERSION = "v2";
const IV_BYTES = 12;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** @param {string} userId @param {string} provider */
function aad(userId, provider) {
  if (typeof userId !== "string" || toUserId(userId) !== userId) throw new Error("bad_user");
  return new TextEncoder().encode(`tudocuatui-ai-key|${VERSION}|${userId}|${provider}`);
}

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

/** @param {AiKek} kek @param {string} userId @param {string} provider @param {string} plaintext @returns {Promise<string>} */
export async function sealKey(kek, userId, provider, plaintext) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(userId, provider) },
      kek,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${VERSION}:${Buffer.concat([iv, ct]).toString("base64")}`;
}

/**
 * Opens a stored secret; every failure is the single code "key_unreadable", never an error object.
 * @param {AiKek} kek
 * @param {string} userId
 * @param {{ provider: string, ciphertext: string } | null} secret
 * @returns {Promise<{ ok: true, key: string } | { ok: false, code: "not_configured" | "key_unreadable" }>}
 */
export async function openStoredKey(kek, userId, secret) {
  if (!secret) return { ok: false, code: "not_configured" };
  try {
    return { ok: true, key: await openKey(kek, userId, secret.provider, secret.ciphertext) };
  } catch {
    return { ok: false, code: "key_unreadable" };
  }
}

/**
 * Throws on any failure (wrong KEK, provider, tampering, unknown version).
 * @param {AiKek} kek @param {string} userId @param {string} provider @param {string} sealed @returns {Promise<string>}
 */
export async function openKey(kek, userId, provider, sealed) {
  const prefix = `${VERSION}:`;
  if (!sealed.startsWith(prefix)) throw new Error("unreadable");
  const bytes = fromBase64(sealed.slice(prefix.length));
  if (bytes.length <= IV_BYTES) throw new Error("unreadable");
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES), additionalData: aad(userId, provider) },
    kek,
    bytes.slice(IV_BYTES),
  );
  return new TextDecoder().decode(pt);
}

export const APP_KEY_VERSION = "app-v1";
const APP_AAD_PREFIX = "tudocuatui-app-key|v1|";

/**
 * Seals an app-wide shared key with AES-256-GCM (F-706.3, D52). AAD binds the key to its provider.
 * Format: "app-v1:" + base64(IV || ciphertext+tag).
 * @param {AiKek} kek @param {string} provider @param {string} plaintext @returns {Promise<string>}
 */
export async function sealAppKey(kek, provider, plaintext) {
  if (typeof provider !== "string" || !provider) throw new Error("bad_provider");
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(`${APP_AAD_PREFIX}${provider}`),
      },
      kek,
      new TextEncoder().encode(plaintext),
    ),
  );
  return `${APP_KEY_VERSION}:${Buffer.concat([iv, ct]).toString("base64")}`;
}

/**
 * Opens a stored app key; throws on any failure (wrong KEK, wrong provider, tampering, unknown version).
 * @param {AiKek} kek @param {string} provider @param {string} sealed @returns {Promise<string>}
 */
export async function openAppKey(kek, provider, sealed) {
  if (typeof provider !== "string" || !provider) throw new Error("bad_provider");
  const prefix = `${APP_KEY_VERSION}:`;
  if (!sealed.startsWith(prefix)) throw new Error("unreadable");
  let bytes;
  try {
    bytes = fromBase64(sealed.slice(prefix.length));
  } catch {
    throw new Error("unreadable");
  }
  if (bytes.length <= IV_BYTES) throw new Error("unreadable");
  const iv = bytes.slice(0, IV_BYTES);
  const ct = bytes.slice(IV_BYTES);
  try {
    const pt = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode(`${APP_AAD_PREFIX}${provider}`),
      },
      kek,
      ct,
    );
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("unreadable");
  }
}
