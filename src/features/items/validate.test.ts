import { describe, expect, it } from "vitest";

import { dateError, hasErrors, nameError, priceError, validateItem } from "./validate";

describe("nameError", () => {
  it('empty and whitespace-only → "nameRequired"', () => {
    expect(nameError("")).toBe("nameRequired");
    expect(nameError("   ")).toBe("nameRequired");
  });

  it('120 code points ok, 121 → "nameTooLong"', () => {
    expect(nameError("ệ".repeat(120))).toBeNull();
    expect(nameError("ệ".repeat(121))).toBe("nameTooLong");
  });

  it("trims before counting", () => {
    expect(nameError(" " + "a".repeat(120) + " ")).toBeNull();
  });
});

describe("priceError", () => {
  it('−1 → "priceNegative", 0 ok, 890000 ok', () => {
    expect(priceError(-1)).toBe("priceNegative");
    expect(priceError(0)).toBeNull();
    expect(priceError(890000)).toBeNull();
  });

  it('NaN / Infinity → "priceInvalid"', () => {
    expect(priceError(NaN)).toBe("priceInvalid");
    expect(priceError(Infinity)).toBe("priceInvalid");
  });
});

describe("dateError", () => {
  it('empty ok; today ok; tomorrow → "dateFuture"', () => {
    expect(dateError("", "2026-11-09")).toBeNull();
    expect(dateError("2026-11-09", "2026-11-09")).toBeNull();
    expect(dateError("2026-11-10", "2026-11-09")).toBe("dateFuture");
  });

  it("timestamp in UTC+7", () => {
    expect(dateError("2026-11-09T18:00:00Z", "2026-11-10")).toBeNull();
    expect(dateError("2026-11-09T18:00:00Z", "2026-11-09")).toBe("dateFuture");
  });

  it('garbage → "dateInvalid"', () => {
    expect(dateError("abc", "2026-11-09")).toBe("dateInvalid");
  });
});

describe("validateItem / hasErrors", () => {
  it("valid item → {}", () => {
    const e = validateItem({ name: "Áo", price: 0, purchaseDate: "" }, "2026-11-09");
    expect(e).toEqual({});
    expect(hasErrors(e)).toBe(false);
  });

  it("several bad fields → all codes", () => {
    const e = validateItem({ name: "", price: -5, purchaseDate: "2027-01-01" }, "2026-11-09");
    expect(e).toEqual({ name: "nameRequired", price: "priceNegative", purchaseDate: "dateFuture" });
    expect(hasErrors(e)).toBe(true);
  });
});
