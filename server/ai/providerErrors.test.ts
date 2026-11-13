// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AI_ERROR_STATUS } from "./catalog.js";
import { mapClaudeError } from "./providerErrors.js";

describe("mapClaudeError", () => {
  it("maps Claude statuses", () => {
    const table: [number, string][] = [
      [401, "invalid_key"],
      [403, "key_forbidden"],
      [404, "model_unavailable"],
      [429, "provider_rate_limited"],
      [500, "provider_unavailable"],
      [502, "provider_unavailable"],
      [503, "provider_unavailable"],
      [529, "provider_unavailable"],
      [400, "provider_unavailable"],
      [408, "provider_unavailable"],
      [418, "provider_unavailable"],
      [0, "provider_unavailable"],
    ];
    for (const [status, code] of table) {
      expect(mapClaudeError(status)).toBe(code);
      expect(code in AI_ERROR_STATUS).toBe(true);
    }
  });
});
