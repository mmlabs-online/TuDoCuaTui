import { describe, expect, it } from "vitest";

import { AI_CLIENT_ERROR_CODES, AI_ERROR_STATUS } from "@/shared/ai/errors";
import { AI_ERRORS, SETTINGS_COPY, aiErrorMessage } from "./copy";

describe("settings copy", () => {
  it("has a non-empty message for every AI error code", () => {
    for (const code of [...Object.keys(AI_ERROR_STATUS), ...AI_CLIENT_ERROR_CODES]) {
      expect(aiErrorMessage(code).length).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(AI_ERRORS, code)).toBe(true);
    }
  });
  it("adds the request id to internal errors and falls back for unknown codes", () => {
    expect(aiErrorMessage("internal", "r1")).toContain("r1");
    expect(aiErrorMessage("conflict")).toBe(AI_ERRORS.internal);
  });
  it("does not mention server-only names", () => {
    const all = JSON.stringify([AI_ERRORS, SETTINGS_COPY]);
    expect(all).not.toContain("AI_KEK");
    expect(all).not.toContain("ai_settings");
  });
});
