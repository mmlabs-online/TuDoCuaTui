// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OWNER_A, OWNER_B } from "../test/auth.js";
import { importKek, openKey, openStoredKey, sealKey } from "./crypto.js";

const b64 = (n: number) => randomBytes(n).toString("base64");
const SECRET = "sk-ant-PLAINTEXT-0123456789abcdef";

describe("crypto", () => {
  it("round trips, and two seals of the same plaintext differ", async () => {
    const kek = await importKek(b64(32));
    const a = await sealKey(kek, OWNER_A, "claude", SECRET);
    const b = await sealKey(kek, OWNER_A, "claude", SECRET);
    expect(a).toMatch(/^v2:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(SECRET);
    expect(await openKey(kek, OWNER_A, "claude", a)).toBe(SECRET);
  });

  it("rejects wrong KEK, wrong provider, tampering, truncation, unknown version, bad base64", async () => {
    const kek = await importKek(b64(32));
    const sealed = await sealKey(kek, OWNER_A, "claude", SECRET);
    const bytes = Buffer.from(sealed.slice(3), "base64");
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 1] ^= 1;
    const cases: [Awaited<ReturnType<typeof importKek>>, string, string, string?][] = [
      [await importKek(b64(32)), "claude", sealed],
      [kek, "gemini", sealed],
      [kek, "claude", sealed, OWNER_B],
      [kek, "claude", "v2:" + flipped.toString("base64")],
      [kek, "claude", "v2:" + bytes.subarray(0, 12).toString("base64")],
      [kek, "claude", "v1:" + bytes.toString("base64")],
      [kek, "claude", "v3:" + bytes.toString("base64")],
      [kek, "claude", "v2:not base64!"],
    ];
    for (const [k, p, s, u] of cases) {
      const err = await openKey(k, u ?? OWNER_A, p, s).then(
        () => null,
        (e: Error) => e,
      );
      expect(err).toBeInstanceOf(Error);
      expect(String(err?.message)).not.toContain(SECRET);
    }
  });

  it("a real v1 ciphertext (old AAD) does not open and is key_unreadable", async () => {
    const raw = randomBytes(32);
    const kek = await importKek(raw.toString("base64"));
    const wc = globalThis.crypto.subtle;
    const key = await wc.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
    const iv = randomBytes(12);
    const ct = Buffer.from(
      await wc.encrypt(
        {
          name: "AES-GCM",
          iv,
          additionalData: new TextEncoder().encode("tudocuatui-ai-key|v1|single|claude"),
        },
        key,
        new TextEncoder().encode(SECRET),
      ),
    );
    const v1 = "v1:" + Buffer.concat([iv, ct]).toString("base64");
    await expect(openKey(kek, OWNER_A, "claude", v1)).rejects.toThrow();
    expect(await openStoredKey(kek, OWNER_A, { provider: "claude", ciphertext: v1 })).toEqual({
      ok: false,
      code: "key_unreadable",
    });
  });

  it("a malformed user: sealKey throws, openStoredKey is key_unreadable", async () => {
    const kek = await importKek(b64(32));
    const good = await sealKey(kek, OWNER_A, "claude", SECRET);
    const bad = [
      "",
      "xyz",
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
      "00000000-0000-0000-0000-000000000000",
    ];
    for (const u of bad) {
      await expect(sealKey(kek, u, "claude", SECRET)).rejects.toThrow("bad_user");
      expect(await openStoredKey(kek, u, { provider: "claude", ciphertext: good })).toEqual({
        ok: false,
        code: "key_unreadable",
      });
    }
  });

  it("importKek rejects 31 and 33 bytes, non-base64 and empty input", async () => {
    for (const v of [b64(31), b64(33), "!!!", "", undefined]) {
      await expect(importKek(v)).rejects.toThrow("server_misconfigured");
    }
  });
});

describe("openStoredKey", () => {
  it("null -> not_configured; round trip -> key", async () => {
    const kek = await importKek(b64(32));
    expect(await openStoredKey(kek, OWNER_A, null)).toEqual({ ok: false, code: "not_configured" });
    const ciphertext = await sealKey(kek, OWNER_A, "claude", SECRET);
    expect(await openStoredKey(kek, OWNER_A, { provider: "claude", ciphertext })).toEqual({
      ok: true,
      key: SECRET,
    });
  });

  it("every failure is key_unreadable, never throws, never logs", async () => {
    const spies = [vi.spyOn(console, "error"), vi.spyOn(console, "log")];
    const kek = await importKek(b64(32));
    const ciphertext = await sealKey(kek, OWNER_A, "claude", SECRET);
    const bytes = Buffer.from(ciphertext.slice(3), "base64");
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 1] ^= 1;
    const cases: [Awaited<ReturnType<typeof importKek>>, string, string, string?][] = [
      [await importKek(b64(32)), "claude", ciphertext],
      [kek, "gemini", ciphertext],
      [kek, "claude", ciphertext, OWNER_B],
      [kek, "claude", "v2:" + flipped.toString("base64")],
      [kek, "claude", "v1:" + bytes.toString("base64")],
      [kek, "claude", "v3:" + bytes.toString("base64")],
      [kek, "claude", "v2:not base64!"],
      [kek, "claude", "v2:" + bytes.subarray(0, 12).toString("base64")],
    ];
    for (const [k, provider, c, u] of cases) {
      expect(await openStoredKey(k, u ?? OWNER_A, { provider, ciphertext: c })).toEqual({
        ok: false,
        code: "key_unreadable",
      });
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
