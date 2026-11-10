// @vitest-environment node
import { describe, expect, it } from "vitest";
import { importKek, openKey, sealKey } from "./crypto";

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const kekB64 = (fill: number) => b64(new Uint8Array(32).fill(fill));
const UID = "11111111-1111-4111-8111-111111111111";
const KEY = "sk-test-0123456789abcdef";

describe("crypto", () => {
  it("round trips and uses the v1 format", async () => {
    const kek = await importKek(kekB64(1));
    const sealed = await sealKey(kek, UID, "claude", KEY);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain(KEY);
    expect(await openKey(kek, UID, "claude", sealed)).toBe(KEY);
  });

  it("uses a fresh IV for the same plaintext", async () => {
    const kek = await importKek(kekB64(1));
    expect(await sealKey(kek, UID, "claude", KEY)).not.toBe(await sealKey(kek, UID, "claude", KEY));
  });

  it("fails for a wrong user, wrong provider, flipped byte, other KEK, unknown version", async () => {
    const kek = await importKek(kekB64(1));
    const sealed = await sealKey(kek, UID, "claude", KEY);
    await expect(
      openKey(kek, "22222222-2222-4222-8222-222222222222", "claude", sealed),
    ).rejects.toThrow();
    await expect(openKey(kek, UID, "gemini", sealed)).rejects.toThrow();
    const raw = Uint8Array.from(atob(sealed.slice(3)), (c) => c.charCodeAt(0));
    raw[raw.length - 1] ^= 1;
    await expect(openKey(kek, UID, "claude", "v1:" + b64(raw))).rejects.toThrow();
    await expect(openKey(await importKek(kekB64(2)), UID, "claude", sealed)).rejects.toThrow();
    await expect(openKey(kek, UID, "claude", "v2:" + sealed.slice(3))).rejects.toThrow();
    await expect(openKey(kek, UID, "claude", "v1:AAAA")).rejects.toThrow();
  });

  it("rejects a KEK that is missing, not base64 or not 32 bytes", async () => {
    await expect(importKek(undefined)).rejects.toThrow("server_misconfigured");
    await expect(importKek("***")).rejects.toThrow("server_misconfigured");
    await expect(importKek(b64(new Uint8Array(16)))).rejects.toThrow("server_misconfigured");
  });
});
