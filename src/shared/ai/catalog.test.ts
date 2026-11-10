import { describe, expect, it } from "vitest";
import { AI_MODELS, AI_PROVIDERS, MODEL_ID_PATTERN, defaultModelOf } from "./catalog";

describe("catalog", () => {
  it("providers are exactly claude and gemini", () => {
    expect([...AI_PROVIDERS]).toEqual(["claude", "gemini"]);
  });

  it("claude has exactly the three models, Haiku is the default", () => {
    expect(AI_MODELS.claude.map((m) => m.id)).toEqual([
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ]);
    expect(AI_MODELS.claude.filter((m) => m.isDefault).map((m) => m.id)).toEqual([
      "claude-haiku-5-5",
    ]);
    expect(defaultModelOf("claude")).toBe("claude-haiku-5-5");
  });

  it("gemini ships with no models until the ids are verified", () => {
    expect(AI_MODELS.gemini).toEqual([]);
    expect(defaultModelOf("gemini")).toBeNull();
  });

  it("ids are unique and match the DB CHECK pattern", () => {
    for (const p of AI_PROVIDERS) {
      const ids = AI_MODELS[p].map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(MODEL_ID_PATTERN);
      expect(AI_MODELS[p].filter((m) => m.isDefault).length).toBeLessThanOrEqual(1);
    }
  });
});
