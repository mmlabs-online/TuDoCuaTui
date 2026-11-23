import { describe, expect, it } from "vitest";
import { isOwner, meBody } from "./me.js";
import { OWNER_A, OWNER_B } from "./test/auth.js";

describe("meBody", () => {
  it('owner sub -> role "owner"', () => {
    expect(meBody({ userId: OWNER_A, email: "a@example.com", ownerSub: OWNER_A }).role).toBe(
      "owner",
    );
  });

  it('other sub -> role "user"; ownerSub null -> "user"', () => {
    expect(meBody({ userId: OWNER_A, email: "a@example.com", ownerSub: OWNER_B }).role).toBe(
      "user",
    );
    expect(meBody({ userId: OWNER_A, email: "a@example.com", ownerSub: null }).role).toBe("user");
  });

  it("returns exactly {id, email, role}; email null passes through", () => {
    expect(meBody({ userId: OWNER_A, email: null, ownerSub: null })).toEqual({
      id: OWNER_A,
      email: null,
      role: "user",
    });
  });
});

describe("isOwner", () => {
  it("true only for equal ids; false for a null or undefined ownerSub", () => {
    expect(isOwner(OWNER_A, OWNER_A)).toBe(true);
    expect(isOwner(OWNER_A, OWNER_B)).toBe(false);
    expect(isOwner(OWNER_A, null)).toBe(false);
    expect(isOwner(OWNER_A, undefined)).toBe(false);
  });
});
