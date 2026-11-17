// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AI_ERROR_STATUS } from "./catalog.js";
import { geminiReasonOf, mapClaudeError, mapGeminiError } from "./providerErrors.js";

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

const ALLOWED = new Set([
  "API_KEY_INVALID",
  "API_KEY_SERVICE_BLOCKED",
  "SERVICE_DISABLED",
  "API_KEY_IP_ADDRESS_BLOCKED",
  "API_KEY_HTTP_REFERRER_BLOCKED",
  "FAILED_PRECONDITION",
  "other",
]);
const INFO = "type.googleapis.com/google.rpc.ErrorInfo";

describe("geminiReasonOf", () => {
  it("reads only allowlisted ErrorInfo reasons or the rpc status", () => {
    const cases: [unknown, string][] = [
      [
        {
          error: {
            status: "INVALID_ARGUMENT",
            details: [{ "@type": INFO, reason: "API_KEY_INVALID" }],
          },
        },
        "API_KEY_INVALID",
      ],
      [
        {
          error: {
            details: [
              { "@type": "type.googleapis.com/google.rpc.Help", reason: "API_KEY_INVALID" },
              { "@type": INFO, reason: "SERVICE_DISABLED" },
              { "@type": INFO, reason: "API_KEY_INVALID" },
            ],
          },
        },
        "SERVICE_DISABLED",
      ],
      [
        {
          error: {
            details: [
              { "@type": "type.googleapis.com/google.rpc.Help", reason: "API_KEY_INVALID" },
            ],
          },
        },
        "other",
      ],
      [{ error: { details: [{ "@type": INFO, reason: "SOMETHING_NEW" }] } }, "other"],
      [{ error: { details: [{ "@type": INFO, reason: 5 }] } }, "other"],
      [{ error: { status: "FAILED_PRECONDITION" } }, "FAILED_PRECONDITION"],
      [{ error: { status: "FAILED_PRECONDITION", details: "x" } }, "FAILED_PRECONDITION"],
      [{ error: { status: "PERMISSION_DENIED" } }, "other"],
      [{ error: { message: "API_KEY_INVALID FAILED_PRECONDITION" } }, "other"],
      [null, "other"],
      ["API_KEY_INVALID", "other"],
      [[], "other"],
      [{}, "other"],
      [{ error: "x" }, "other"],
      [{ error: { details: "x" } }, "other"],
    ];
    for (const [body, want] of cases) {
      const got = geminiReasonOf(body);
      expect(got).toBe(want);
      expect(ALLOWED.has(got)).toBe(true);
    }
  });
});

describe("mapGeminiError", () => {
  it("maps Gemini statuses and reasons", () => {
    const table: [number, string, string][] = [
      [400, "API_KEY_INVALID", "invalid_key"],
      [400, "FAILED_PRECONDITION", "key_forbidden"],
      [400, "API_KEY_SERVICE_BLOCKED", "key_forbidden"],
      [400, "other", "provider_unavailable"],
      [401, "other", "invalid_key"],
      [401, "API_KEY_INVALID", "invalid_key"],
      [403, "other", "key_forbidden"],
      [403, "SERVICE_DISABLED", "key_forbidden"],
      [403, "API_KEY_IP_ADDRESS_BLOCKED", "key_forbidden"],
      [403, "API_KEY_HTTP_REFERRER_BLOCKED", "key_forbidden"],
      [404, "other", "model_unavailable"],
      [429, "other", "provider_rate_limited"],
      [500, "other", "provider_unavailable"],
      [502, "other", "provider_unavailable"],
      [503, "other", "provider_unavailable"],
      [504, "other", "provider_unavailable"],
      [408, "other", "provider_unavailable"],
      [418, "other", "provider_unavailable"],
      [0, "other", "provider_unavailable"],
    ];
    for (const [status, reason, code] of table) {
      expect(mapGeminiError(status, reason)).toBe(code);
      expect(code in AI_ERROR_STATUS).toBe(true);
    }
  });
});
