import { describe, expect, it } from "vitest";
import { geminiReasonOf, mapClaudeError, mapGeminiError } from "./providerErrors";

describe("providerErrors", () => {
  it.each([
    [401, "invalid_key"],
    [403, "key_forbidden"],
    [404, "model_unavailable"],
    [429, "provider_rate_limited"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [undefined, "provider_unavailable"],
    [418, "provider_unavailable"],
  ])("status %s maps to %s for both providers", (status, code) => {
    expect(mapClaudeError(status)).toBe(code);
    expect(mapGeminiError(status, undefined)).toBe(code);
  });

  it("gemini invalid-key reason wins over the status", () => {
    expect(mapGeminiError(400, "API_KEY_INVALID")).toBe("invalid_key");
    expect(mapGeminiError(400, "OTHER")).toBe("provider_unavailable");
  });

  it("reads the structured reason only", () => {
    expect(
      geminiReasonOf({ error: { details: [{ "@type": "x" }, { reason: "API_KEY_INVALID" }] } }),
    ).toBe("API_KEY_INVALID");
    expect(geminiReasonOf({ error: { message: "API_KEY_INVALID" } })).toBeUndefined();
    expect(geminiReasonOf(null)).toBeUndefined();
  });
});
