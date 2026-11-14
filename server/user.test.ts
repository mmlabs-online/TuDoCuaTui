import { describe, expect, it } from "vitest";
import { toUserId } from "./user.js";

describe("toUserId", () => {
  it("trims and lowercases", () => {
    expect(toUserId("  0190A6F2-7C3E-7B8A-9D4E-1F2A3B4C5D6E \n")).toBe(
      "0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e",
    );
  });

  it("accepts v4 and v7", () => {
    expect(toUserId("11111111-1111-4111-8111-111111111111")).not.toBeNull();
    expect(toUserId("0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e")).not.toBeNull();
  });

  it("rejects empty, junk, wrong length, braces, nil and undefined", () => {
    for (const bad of [
      "",
      "xyz",
      "0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6",
      "{0190a6f2-7c3e-7b8a-9d4e-1f2a3b4c5d6e}",
      "00000000-0000-0000-0000-000000000000",
    ]) {
      expect(toUserId(bad), bad).toBeNull();
    }
    expect(toUserId(undefined)).toBeNull();
  });
});
