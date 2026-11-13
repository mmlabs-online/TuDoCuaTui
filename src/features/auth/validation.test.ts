import { describe, expect, it } from "vitest";

import {
  confirmError,
  emailError,
  hasErrors,
  parseVerifyToken,
  passwordError,
  signInPasswordError,
  validateSignIn,
  validateSignUp,
} from "./validation";

describe("emailError", () => {
  it("empty → required", () => {
    expect(emailError("")).toBe("required");
    expect(emailError("   ")).toBe("required");
  });

  it("trims before checking", () => {
    expect(emailError("  an@vi.vn  ")).toBeNull();
  });

  it.each(["an.vi.vn", "an@vi", "a n@vi.vn", "a@@vi.vn", "an@.vn", "@vi.vn", "an@vi..vn"])(
    "%s → invalid",
    (v) => {
      expect(emailError(v)).toBe("invalid");
    },
  );

  it("length limits", () => {
    expect(emailError("a".repeat(64) + "@vi.vn")).toBeNull();
    expect(emailError("a".repeat(65) + "@vi.vn")).toBe("invalid");
    expect(emailError("a@" + "b".repeat(250) + ".vn")).toBe("invalid");
  });

  it("does not reject Unicode / IDN", () => {
    expect(emailError("người.dùng@ví-dụ.vn")).toBeNull();
  });
});

describe("passwordError (sign-up)", () => {
  it("empty → required", () => {
    expect(passwordError("")).toBe("required");
  });

  it("11 → tooShort, 12 → ok", () => {
    expect(passwordError("a".repeat(11))).toBe("tooShort");
    expect(passwordError("a".repeat(12))).toBeNull();
  });

  it("does not trim", () => {
    expect(passwordError(" " + "a".repeat(10) + " ")).toBeNull();
  });

  it("measures after NFKC", () => {
    expect(passwordError("é".repeat(6))).toBe("tooShort");
    expect(passwordError("mật khẩu12".normalize("NFD"))).toBe("tooShort");
    expect(passwordError("mật khẩu1234".normalize("NFD"))).toBeNull();
    expect(passwordError("ｍａｔｋｈａｕ１２３４５６")).toBeNull();
  });

  it("128 code points ok, 129 → tooLong", () => {
    expect(passwordError("😀".repeat(128))).toBeNull();
    expect(passwordError("a".repeat(129))).toBe("tooLong");
  });
});

describe("signInPasswordError", () => {
  it("no policy at sign-in", () => {
    expect(signInPasswordError("")).toBe("required");
    expect(signInPasswordError("abc")).toBeNull();
    expect(signInPasswordError("a".repeat(129))).toBe("tooLong");
  });
});

describe("confirmError", () => {
  it("mismatch and NFC vs NFD", () => {
    expect(confirmError("abc", "abd")).toBe("mismatch");
    const pw = "Mật khẩu của tôi";
    expect(confirmError(pw, pw.normalize("NFD"))).toBeNull();
  });
});

describe("form validation", () => {
  it("validateSignIn returns a field map", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({
      email: "required",
      password: "required",
    });
    expect(hasErrors(validateSignIn({ email: "an@vi.vn", password: "x" }))).toBe(false);
  });

  it("validateSignUp returns a field map", () => {
    expect(validateSignUp({ email: "bad", password: "short", confirm: "" })).toEqual({
      email: "invalid",
      password: "tooShort",
      confirm: "required",
    });
    expect(validateSignUp({ email: "an@vi.vn", password: "a".repeat(12), confirm: "x" })).toEqual({
      confirm: "mismatch",
    });
    expect(
      hasErrors(
        validateSignUp({ email: "an@vi.vn", password: "a".repeat(12), confirm: "a".repeat(12) }),
      ),
    ).toBe(false);
  });
});

describe("parseVerifyToken", () => {
  const token = "Ab_-".repeat(11).slice(0, 43);

  it("returns a valid token", () => {
    expect(token).toHaveLength(43);
    expect(parseVerifyToken("#token=" + token)).toBe(token);
  });

  it.each([32, 128])("accepts %i chars", (n) => {
    expect(parseVerifyToken("#token=" + "a".repeat(n))).toBe("a".repeat(n));
  });

  it.each([
    ["empty", ""],
    ["hash only", "#"],
    ["no value", "#token="],
    ["31 chars", "#token=" + "a".repeat(31)],
    ["129 chars", "#token=" + "a".repeat(129)],
    ["plus", "#token=" + "a".repeat(40) + "+"],
    ["equals", "#token=" + "a".repeat(40) + "="],
    ["extra param", "#token=" + token + "&x=1"],
    ["query", "?token=" + token],
  ])("%s → null", (_, v) => {
    expect(parseVerifyToken(v)).toBeNull();
  });
});
