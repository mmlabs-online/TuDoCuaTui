import { describe, expect, it } from "vitest";
import { keyHintOf, maskHint } from "./mask";

describe("mask", () => {
  it("hint is the last 4 characters of the trimmed key", () => {
    expect(keyHintOf("  sk-abcdefgh1234 \n")).toBe("1234");
  });

  it("maskHint", () => {
    expect(maskHint("abcd")).toBe("••••abcd");
    expect(maskHint(null)).toBeNull();
  });
});
