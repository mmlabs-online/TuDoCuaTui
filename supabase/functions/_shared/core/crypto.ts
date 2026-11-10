// AES-256-GCM sealing of provider API keys. Format: "v1:" + base64(IV || ciphertext+tag).
// AAD binds the ciphertext to the user and provider.

const VERSION = "v1";
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const aad = (userId: string, provider: string) =>
  new TextEncoder().encode(`tudo-ai-key|${VERSION}|${userId}|${provider}`);

/** Imports TUDO_AI_KEK (base64 of 32 bytes) as a non-extractable key. Throws "server_misconfigured". */
export async function importKek(b64: string | undefined): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromBase64((b64 ?? "").trim());
  } catch {
    throw new Error("server_misconfigured");
  }
  if (raw.length !== 32) throw new Error("server_misconfigured");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealKey(
  kek: CryptoKey,
  userId: string,
  provider: string,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(userId, provider) },
      kek,
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `${VERSION}:${toBase64(out)}`;
}

/** Throws on any failure (wrong KEK, user, provider, tampering, unknown version). */
export async function openKey(
  kek: CryptoKey,
  userId: string,
  provider: string,
  sealed: string,
): Promise<string> {
  const prefix = `${VERSION}:`;
  if (!sealed.startsWith(prefix)) throw new Error("unreadable");
  const bytes = fromBase64(sealed.slice(prefix.length));
  if (bytes.length <= IV_BYTES) throw new Error("unreadable");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, IV_BYTES), additionalData: aad(userId, provider) },
    kek,
    bytes.slice(IV_BYTES),
  );
  return new TextDecoder().decode(pt);
}
