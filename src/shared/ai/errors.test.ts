import { describe, expect, it } from "vitest";
import { AI_CLIENT_ERROR_CODES, AI_ERROR_STATUS, isServerErrorCode } from "./errors";

describe("errors", () => {
  it("every server code has a 4xx/5xx HTTP status", () => {
    for (const status of Object.values(AI_ERROR_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it("client-only codes have no HTTP status", () => {
    for (const code of AI_CLIENT_ERROR_CODES) {
      expect(isServerErrorCode(code)).toBe(false);
    }
    expect(isServerErrorCode("key_unreadable")).toBe(true);
    expect(isServerErrorCode("toString")).toBe(false);
    expect(isServerErrorCode(5)).toBe(false);
  });
});
