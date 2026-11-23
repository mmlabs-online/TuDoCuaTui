import { describe, expect, it } from "vitest";
import { parseManualGrantBody, parseSettingsBody, parseUserIdParam } from "./adminValidate.js";

describe("parseSettingsBody", () => {
  it("accepts {welcomeAmount, monthlyAmount} integers 1..100000", () => {
    expect(parseSettingsBody({ welcomeAmount: 300, monthlyAmount: 60 })).toEqual({
      ok: true,
      value: { welcomeAmount: 300, monthlyAmount: 60 },
    });
    expect(parseSettingsBody({ welcomeAmount: 1, monthlyAmount: 100000 }).ok).toBe(true);
  });

  it("rejects extra keys, missing keys, 0, 100001, 1.5, strings, null, arrays and a __proto__ key", () => {
    const bad = (b: unknown) => parseSettingsBody(b).ok;
    expect(bad({ welcomeAmount: 3, monthlyAmount: 6, extra: 1 })).toBe(false);
    expect(bad({ welcomeAmount: 3 })).toBe(false);
    expect(bad({ welcomeAmount: 0, monthlyAmount: 6 })).toBe(false);
    expect(bad({ welcomeAmount: 3, monthlyAmount: 100001 })).toBe(false);
    expect(bad({ welcomeAmount: 1.5, monthlyAmount: 6 })).toBe(false);
    expect(bad({ welcomeAmount: "300", monthlyAmount: 6 })).toBe(false);
    expect(bad(null)).toBe(false);
    expect(bad([300, 60])).toBe(false);
    expect(bad(JSON.parse(`{"welcomeAmount":3,"monthlyAmount":6,"__proto__":{}}`))).toBe(false);
    expect(parseSettingsBody({ welcomeAmount: 0, monthlyAmount: 6 })).toEqual({
      ok: false,
      field: "welcomeAmount",
      reason: "amountInvalid",
    });
  });
});

describe("parseManualGrantBody", () => {
  it("accepts {amount, requestKey}", () => {
    expect(parseManualGrantBody({ amount: 50, requestKey: "a_B-1" })).toEqual({
      ok: true,
      value: { amount: 50, requestKey: "a_B-1" },
    });
    expect(parseManualGrantBody({ amount: 1, requestKey: "x".repeat(128) }).ok).toBe(true);
  });

  it("rejects a bad amount, an empty or 129-char key, a key with space, đ or /, and extra keys", () => {
    const bad = (b: unknown) => parseManualGrantBody(b).ok;
    expect(bad({ amount: 0, requestKey: "k" })).toBe(false);
    expect(bad({ amount: 2.5, requestKey: "k" })).toBe(false);
    expect(bad({ amount: 5, requestKey: "" })).toBe(false);
    expect(bad({ amount: 5, requestKey: "x".repeat(129) })).toBe(false);
    expect(bad({ amount: 5, requestKey: "a b" })).toBe(false);
    expect(bad({ amount: 5, requestKey: "đ" })).toBe(false);
    expect(bad({ amount: 5, requestKey: "a/b" })).toBe(false);
    expect(bad({ amount: 5, requestKey: 7 })).toBe(false);
    expect(bad({ amount: 5, requestKey: "k", userId: "x" })).toBe(false);
    expect(bad({ amount: 5 })).toBe(false);
  });
});

describe("parseUserIdParam", () => {
  it("accepts a canonical lowercase UUID only", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(parseUserIdParam(id)).toBe(id);
    expect(parseUserIdParam("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBeNull();
    expect(parseUserIdParam("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(parseUserIdParam("%2e%2e")).toBeNull();
    expect(parseUserIdParam("")).toBeNull();
    expect(parseUserIdParam(undefined)).toBeNull();
  });
});
