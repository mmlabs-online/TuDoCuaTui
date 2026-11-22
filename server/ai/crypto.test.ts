// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OWNER_A, OWNER_B } from "../test/auth.js";
import { importKek, openAppKey, openKey, openStoredKey, sealAppKey, sealKey } from "./crypto.js";

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

describe("appKeys crypto (F-706.3)", () => {
  it("round trips for claude, gemini, and openai; two seals differ; format is app-v1:", async () => {
    const kek = await importKek(b64(32));
    for (const provider of ["claude", "gemini", "openai"]) {
      const a = await sealAppKey(kek, provider, SECRET);
      const b = await sealAppKey(kek, provider, SECRET);
      expect(a).toMatch(/^app-v1:[A-Za-z0-9+/=]+$/);
      expect(a).not.toBe(b);
      expect(a).not.toContain(SECRET);
      expect(await openAppKey(kek, provider, a)).toBe(SECRET);
      expect(await openAppKey(kek, provider, b)).toBe(SECRET);
    }
  });

  it("rejects wrong provider, wrong KEK, tampering, and bad base64", async () => {
    const kek = await importKek(b64(32));
    const sealed = await sealAppKey(kek, "claude", SECRET);
    const bytes = Buffer.from(sealed.slice("app-v1:".length), "base64");
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 1] ^= 1;

    // wrong provider
    await expect(openAppKey(kek, "gemini", sealed)).rejects.toThrow("unreadable");
    await expect(openAppKey(kek, "openai", sealed)).rejects.toThrow("unreadable");

    // wrong KEK
    const otherKek = await importKek(b64(32));
    await expect(openAppKey(otherKek, "claude", sealed)).rejects.toThrow("unreadable");

    // tampering
    await expect(openAppKey(kek, "claude", "app-v1:" + flipped.toString("base64"))).rejects.toThrow(
      "unreadable",
    );

    // truncation
    await expect(
      openAppKey(kek, "claude", "app-v1:" + bytes.subarray(0, 12).toString("base64")),
    ).rejects.toThrow("unreadable");

    // wrong version prefix
    await expect(openAppKey(kek, "claude", "v2:" + bytes.toString("base64"))).rejects.toThrow(
      "unreadable",
    );
    await expect(openAppKey(kek, "claude", "app-v2:" + bytes.toString("base64"))).rejects.toThrow(
      "unreadable",
    );
  });

  it("app-key ciphertext cannot be opened as a BYOK key, and v2 BYOK ciphertext cannot be opened as an app key", async () => {
    const kek = await importKek(b64(32));
    const byokCiphertext = await sealKey(kek, OWNER_A, "claude", SECRET);
    const appCiphertext = await sealAppKey(kek, "claude", SECRET);

    // BYOK cipher into openAppKey -> throws
    await expect(openAppKey(kek, "claude", byokCiphertext)).rejects.toThrow("unreadable");

    // App cipher into openKey or openStoredKey -> throws / key_unreadable
    await expect(openKey(kek, OWNER_A, "claude", appCiphertext)).rejects.toThrow("unreadable");
    expect(
      await openStoredKey(kek, OWNER_A, { provider: "claude", ciphertext: appCiphertext }),
    ).toEqual({
      ok: false,
      code: "key_unreadable",
    });

    // Existing v2 BYOK ciphertext still decrypts cleanly
    expect(await openKey(kek, OWNER_A, "claude", byokCiphertext)).toBe(SECRET);
    expect(
      await openStoredKey(kek, OWNER_A, { provider: "claude", ciphertext: byokCiphertext }),
    ).toEqual({
      ok: true,
      key: SECRET,
    });
  });
});
