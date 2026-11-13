// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as sharedCatalog from "../../src/shared/ai/catalog.ts";
import { AI_ERROR_STATUS as sharedStatus } from "../../src/shared/ai/errors.ts";
import * as sharedMask from "../../src/shared/ai/mask.ts";
import * as sharedValidate from "../../src/shared/ai/validate.ts";
import * as catalog from "./catalog.js";
import * as mask from "./mask.js";
import * as validate from "./validate.js";

describe("server/ai mirrors src/shared/ai", () => {
  it("constants are equal", () => {
    expect(catalog.AI_PROVIDERS).toEqual(sharedCatalog.AI_PROVIDERS);
    expect(catalog.AI_MODELS).toEqual(sharedCatalog.AI_MODELS);
    expect(catalog.AI_ERROR_STATUS).toEqual(sharedStatus);
    expect(validate.MAX_BODY_BYTES).toBe(sharedValidate.MAX_BODY_BYTES);
    expect(catalog.MODEL_ID_PATTERN.source).toBe(sharedCatalog.MODEL_ID_PATTERN.source);
    expect(catalog.MODEL_ID_PATTERN.flags).toBe(sharedCatalog.MODEL_ID_PATTERN.flags);
    for (const p of sharedCatalog.AI_PROVIDERS) {
      expect(catalog.defaultModelOf(p)).toBe(sharedCatalog.defaultModelOf(p));
    }
  });

  it("validate agrees on a fixture table", () => {
    const a10 = "a".repeat(10);
    const keys: unknown[] = [
      "a".repeat(19),
      "a".repeat(20),
      "a".repeat(256),
      "a".repeat(257),
      `  ${"a".repeat(20)}  `,
      `${a10} ${a10}`,
      `${a10}\t${a10}`,
      `${a10}\n${a10}`,
      "é" + "a".repeat(20),
      "ă" + "a".repeat(20),
      "\u{1F600}" + "a".repeat(20),
      null,
      5,
      {},
    ];
    for (const k of keys) {
      expect(validate.validateApiKeyFormat(k)).toEqual(sharedValidate.validateApiKeyFormat(k));
    }
    for (const p of ["claude", "gemini", "Claude", "", "toString", 5, null]) {
      expect(validate.isAllowedProvider(p)).toBe(sharedValidate.isAllowedProvider(p));
    }
    for (const provider of sharedCatalog.AI_PROVIDERS) {
      const ids = sharedCatalog.AI_MODELS[provider].flatMap((m) => [
        m.id,
        m.id.toUpperCase(),
        m.id + " ",
      ]);
      for (const m of [...ids, "claude-opus-5-5", "gemini-x", "", null]) {
        expect(validate.isAllowedModel(provider, m)).toBe(
          sharedValidate.isAllowedModel(provider, m),
        );
      }
    }
  });

  it("mask agrees", () => {
    for (const k of ["  abcdefghijklmnopqrst1234  ", "abcdefghijklmnopqrst1234", "ab"]) {
      expect(mask.keyHintOf(k)).toBe(sharedMask.keyHintOf(k));
    }
    expect(mask.maskHint(null)).toBe(sharedMask.maskHint(null));
    expect(mask.maskHint("abcd")).toBe(sharedMask.maskHint("abcd"));
  });
});
