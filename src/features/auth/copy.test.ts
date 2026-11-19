import { describe, expect, it } from "vitest";

import { AUTH_COPY, authErrorMessage } from "./copy";
import type { AuthError, AuthErrorCode } from "./types";
import { PASSWORD_MIN } from "./validation";

describe("password length copy", () => {
  it("matches PASSWORD_MIN", () => {
    const text = `${PASSWORD_MIN} ký tự`;
    expect(AUTH_COPY.signUp.passwordHint).toContain(text);
    expect(AUTH_COPY.fieldErrors.tooShort).toContain(text);
    expect(AUTH_COPY.errors.weak_too_short).toContain(text);
  });
});

describe("logout warning copy", () => {
  it("tells a shared-computer user to sign in and out again or clear cookies", () => {
    expect(AUTH_COPY.signIn.logoutUnconfirmed).toBe(
      "Bạn đã đăng xuất khỏi Tủ đồ của tôi trên trình duyệt này, nhưng chưa xác nhận được việc đăng xuất khỏi tài khoản mmlabs. Nếu đây là máy dùng chung, hãy kết nối mạng rồi đăng nhập và đăng xuất lại, hoặc xoá dữ liệu duyệt web (cookie) của trình duyệt này.",
    );
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
      join_closed: true,
      join_approval_unavailable: true,
      join_unavailable: true,
      no_access: true,
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

  it("unknown or prototype codes fall back to unknown copy", () => {
    for (const code of ["__proto__", "bogus", "constructor"]) {
      expect(authErrorMessage({ code } as unknown as AuthError)).toBe(AUTH_COPY.errors.unknown);
    }
  });

  it("weak_password reasons that are not an array fall back to the generic copy", () => {
    const err = { code: "weak_password", reasons: "too_short" } as unknown as AuthError;
    expect(authErrorMessage(err)).toBe(AUTH_COPY.errors.weak_password);
  });

  it("filters unknown weak_password reasons", () => {
    const err = { code: "weak_password", reasons: ["bogus"] } as unknown as AuthError;
    expect(authErrorMessage(err)).toBe(AUTH_COPY.errors.weak_password);
  });
});

describe("continue-as and unverified copy", () => {
  it("has the exact Vietnamese strings", () => {
    expect(AUTH_COPY.signIn.continueAs("a@b.co")).toBe("Tiếp tục với a@b.co");
    expect(AUTH_COPY.signIn.continuing).toBe("Đang đăng nhập…");
    expect(AUTH_COPY.signIn.otherAccount).toBe("hoặc đăng nhập bằng tài khoản khác");
    expect(AUTH_COPY.unverified.checkAgain).toBe("Tôi đã xác minh email");
    expect(AUTH_COPY.unverified.otherAccount).toBe("Dùng tài khoản khác");
    expect(AUTH_COPY.unverified.body("a@b.co")).toBe(
      "Email a@b.co chưa được xác minh. Mở link trong email chúng tôi đã gửi, rồi quay lại đây.",
    );
    expect(AUTH_COPY.unverified.body(null)).toBe(
      "Email của bạn chưa được xác minh. Mở link trong email chúng tôi đã gửi, rồi quay lại đây.",
    );
  });
});
