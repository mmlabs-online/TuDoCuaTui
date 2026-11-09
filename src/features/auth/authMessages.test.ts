import { describe, expect, test } from "vitest";
import { COPY, authErrorMessage, isValidEmail, validateLogin } from "./authMessages";

describe("isValidEmail", () => {
  test.each(["a@b.co", "  ming@mmlabs.online  ", "tên@miền.vn"])("accepts %j", (s) => {
    expect(isValidEmail(s)).toBe(true);
  });
  test.each(["", "   ", "abc", "a@b", "a b@c.d", "@b.co"])("rejects %j", (s) => {
    expect(isValidEmail(s)).toBe(false);
  });
});

describe("validateLogin", () => {
  test("checks the email first", () => {
    expect(validateLogin("", "")).toBe(COPY.errInvalidEmail);
  });
  test("rejects an invalid email", () => {
    expect(validateLogin("abc", "x")).toBe(COPY.errInvalidEmail);
  });
  test("rejects an empty password", () => {
    expect(validateLogin("a@b.co", "")).toBe(COPY.errEmptyPassword);
  });
  test("does not treat a whitespace password as empty", () => {
    expect(validateLogin("a@b.co", "   ")).toBeNull();
  });
  test("accepts a valid email and a password with diacritics", () => {
    expect(validateLogin(" a@b.co ", "mật khẩu")).toBeNull();
  });
});

describe("authErrorMessage", () => {
  test("wrong credentials", () => {
    expect(authErrorMessage({ status: 400, code: "invalid_credentials" })).toBe(
      COPY.errWrongCredentials,
    );
  });
  test.each([
    { status: 429 },
    { code: "over_request_rate_limit" },
    { status: 429, code: "over_email_send_rate_limit" },
  ])("rate limit %j", (err) => {
    expect(authErrorMessage(err)).toBe(COPY.errRateLimit);
  });
  test("server-side invalid email", () => {
    expect(authErrorMessage({ code: "email_address_invalid" })).toBe(COPY.errInvalidEmail);
  });
  test.each([
    { status: 0 },
    {},
    null,
    undefined,
    { code: "email_not_confirmed" },
    { code: "something_new" },
  ])("falls back to the generic message for %j", (err) => {
    expect(authErrorMessage(err)).toBe(COPY.errGeneric);
  });
});

describe("COPY", () => {
  test("every value is a non-empty string with no magic-link wording", () => {
    for (const v of Object.values(COPY)) {
      expect(typeof v).toBe("string");
      expect((v as string).length).toBeGreaterThan(0);
      expect(v as string).not.toMatch(/link|Gửi lại/i);
    }
  });
});
