// @vitest-environment node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importKek } from "./crypto.js";
import { createAppKeyStore, isAppKeyProvider } from "./appKeys.js";

const b64 = (n: number) => Buffer.alloc(n, 7).toString("base64");

describe("appKeys unit", () => {
  it("isAppKeyProvider allowlist", () => {
    expect(isAppKeyProvider("claude")).toBe(true);
    expect(isAppKeyProvider("gemini")).toBe(true);
    expect(isAppKeyProvider("openai")).toBe(true);
    expect(isAppKeyProvider("anthropic")).toBe(false);
    expect(isAppKeyProvider("google")).toBe(false);
    expect(isAppKeyProvider("")).toBe(false);
    expect(isAppKeyProvider(null)).toBe(false);
    expect(isAppKeyProvider(123)).toBe(false);
  });

  it("put rejects invalid provider or invalid key format", async () => {
    const kek = await importKek(b64(32));
    const store = createAppKeyStore({} as any, kek);

    // invalid provider
    expect(await store.put("unknown", "sk-valid-key-format-1234567890")).toEqual({
      ok: false,
      status: 400,
      code: "invalid_provider",
    });

    // invalid key format (too short)
    expect(await store.put("claude", "short")).toEqual({
      ok: false,
      status: 400,
      code: "invalid_key_format",
    });
  });

  it("delete rejects invalid provider", async () => {
    const kek = await importKek(b64(32));
    const store = createAppKeyStore({} as any, kek);
    expect(await store.delete("unknown")).toEqual({
      ok: false,
      status: 400,
      code: "invalid_provider",
    });
  });

  it("test rejects invalid provider", async () => {
    const kek = await importKek(b64(32));
    const store = createAppKeyStore({} as any, kek);
    expect(await store.test("unknown")).toEqual({
      ok: false,
      status: 400,
      code: "invalid_provider",
    });
  });

  it("open rejects an invalid provider before touching the pool", async () => {
    const kek = await importKek(b64(32));
    const store = createAppKeyStore({} as any, kek);
    expect(await store.open("unknown")).toEqual({
      ok: false,
      status: 400,
      code: "invalid_provider",
    });
  });

  it("the AI routes reach the shared key only through paidCall.js appKeys.open", async () => {
    const aiDir = path.resolve(__dirname);
    const paid = await readFile(path.join(aiDir, "paidCall.js"), "utf8");
    expect(paid).toMatch(/appKeys\.open\(/);
    for (const f of ["tagPhoto.js", "suggestOutfits.js", "outfitSuggest.js", "paidCall.js"]) {
      const content = await readFile(path.join(aiDir, f), "utf8");
      expect(content).not.toMatch(/\bai_app_keys\b/);
      expect(content).not.toMatch(/\bsealAppKey\b/);
      expect(content).not.toMatch(/\bopenAppKey\b/);
      if (f !== "paidCall.js") expect(content).not.toMatch(/\bappKeys\b/);
    }
  });
});
