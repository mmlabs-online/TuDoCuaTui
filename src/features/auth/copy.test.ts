import { describe, expect, it } from "vitest";

import { AUTH_COPY, authErrorMessage, formatWait } from "./copy";
import type { AuthErrorCode } from "./types";

describe("formatWait", () => {
  it.each([
    [1, "1 giây"],
    [59, "59 giây"],
    [60, "1 phút"],
    [61, "2 phút"],
    [900, "15 phút"],
    [3600, "1 giờ"],
    [3601, "2 giờ"],
    [0, "ít phút"],
    [-5, "ít phút"],
    [NaN, "ít phút"],
  ])("%s → %s", (n, text) => {
    expect(formatWait(n)).toBe(text);
  });
});

describe("authErrorMessage", () => {
  const codes = Object.keys(AUTH_COPY.errors)
    .filter((k) => !k.startsWith("weak_too"))
    .sort();

  it("every AuthErrorCode has a message", () => {
    const all: Record<AuthErrorCode, true> = {
      invalid_credentials: true,
      email_unverified: true,
      not_member: true,
      session_invalid: true,
      turnstile_required: true,
      turnstile_failed: true,
      rate_limited: true,
      network: true,
      email_taken: true,
      weak_password: true,
      validation_error: true,
      token_invalid: true,
      email_already_verified: true,
      unknown: true,
    };
    expect(codes).toEqual(Object.keys(all).sort());
    for (const code of Object.keys(all) as AuthErrorCode[]) {
      expect(authErrorMessage({ code }).length).toBeGreaterThan(0);
    }
  });

  it("rate_limited with and without a wait", () => {
    expect(authErrorMessage({ code: "rate_limited", retryAfterSeconds: 120 })).toContain("2 phút");
    expect(authErrorMessage({ code: "rate_limited" })).toContain("ít phút");
  });

  it("weak_password reasons", () => {
    const e = AUTH_COPY.errors;
    expect(authErrorMessage({ code: "weak_password", reasons: ["too_short"] })).toBe(
      e.weak_too_short,
    );
    expect(authErrorMessage({ code: "weak_password", reasons: ["too_common"] })).toBe(
      e.weak_too_common,
    );
    expect(authErrorMessage({ code: "weak_password", reasons: ["too_short", "too_common"] })).toBe(
      `${e.weak_too_short} ${e.weak_too_common}`,
    );
    expect(authErrorMessage({ code: "weak_password" })).toBe(e.weak_password);
  });
});
