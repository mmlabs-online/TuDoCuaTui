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

  it("inert: no AI route (tag-photo, suggest-outfits) imports appKeys or reads shared keys", async () => {
    const aiDir = path.resolve(__dirname);
    const checkedFiles = [
      path.join(aiDir, "tagPhoto.js"),
      path.join(aiDir, "suggestOutfits.js"),
      path.join(aiDir, "outfitSuggest.js"),
    ];

    for (const f of checkedFiles) {
      const content = await readFile(f, "utf8");
      expect(content).not.toMatch(/\bappKeys\b/);
      expect(content).not.toMatch(/\bai_app_keys\b/);
      expect(content).not.toMatch(/\bsealAppKey\b/);
      expect(content).not.toMatch(/\bopenAppKey\b/);
    }
  });
});
