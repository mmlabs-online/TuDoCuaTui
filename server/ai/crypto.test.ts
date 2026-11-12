// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { importKek, openKey, sealKey } from "./crypto.js";

const b64 = (n: number) => randomBytes(n).toString("base64");
const SECRET = "sk-ant-PLAINTEXT-0123456789abcdef";

describe("crypto", () => {
  it("round trips, and two seals of the same plaintext differ", async () => {
    const kek = await importKek(b64(32));
    const a = await sealKey(kek, "claude", SECRET);
    const b = await sealKey(kek, "claude", SECRET);
    expect(a).toMatch(/^v1:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(SECRET);
    expect(await openKey(kek, "claude", a)).toBe(SECRET);
  });

  it("rejects wrong KEK, wrong provider, tampering, truncation, unknown version, bad base64", async () => {
    const kek = await importKek(b64(32));
    const sealed = await sealKey(kek, "claude", SECRET);
    const bytes = Buffer.from(sealed.slice(3), "base64");
    const flipped = Buffer.from(bytes);
    flipped[flipped.length - 1] ^= 1;
    const cases: [Awaited<ReturnType<typeof importKek>>, string, string][] = [
      [await importKek(b64(32)), "claude", sealed],
      [kek, "gemini", sealed],
      [kek, "claude", "v1:" + flipped.toString("base64")],
      [kek, "claude", "v1:" + bytes.subarray(0, 12).toString("base64")],
      [kek, "claude", "v2:" + bytes.toString("base64")],
      [kek, "claude", "v1:not base64!"],
    ];
    for (const [k, p, s] of cases) {
      const err = await openKey(k, p, s).then(
        () => null,
        (e: Error) => e,
      );
      expect(err).toBeInstanceOf(Error);
      expect(String(err?.message)).not.toContain(SECRET);
    }
  });

  it("importKek rejects 31 and 33 bytes, non-base64 and empty input", async () => {
    for (const v of [b64(31), b64(33), "!!!", "", undefined]) {
      await expect(importKek(v)).rejects.toThrow("server_misconfigured");
    }
  });
});
