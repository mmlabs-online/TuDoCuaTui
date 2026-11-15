// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TOKEN_PAGES, tokenPageOf } from "../src/shared/tokenPages.ts";
import { NO_REFERRER_PATHS, referrerPolicyFor } from "./static.js";

describe("server/static.js mirrors src/shared/tokenPages.ts", () => {
  it("server NO_REFERRER_PATHS equals TOKEN_PAGES", () => {
    expect([...NO_REFERRER_PATHS].sort()).toEqual(Object.values(TOKEN_PAGES).sort());
  });

  it("referrerPolicyFor and tokenPageOf agree on a fixture table", () => {
    const paths = [
      "/verify-email",
      "/verify-email/",
      "/reset-password",
      "/reset-password/",
      "",
      "/",
      "/reset-password//",
      "/reset-passwordx",
      "/reset-password/x",
      "/RESET-PASSWORD",
      "/verify-email//",
    ];
    for (const p of paths) {
      expect(referrerPolicyFor(p) === "no-referrer", p).toBe(tokenPageOf(p) !== null);
    }
  });
});
