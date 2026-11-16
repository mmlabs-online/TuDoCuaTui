// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AuthConfigError, authLabel, loadAuthConfig, ownerSubOf } from "./auth.js";
import { IdentityConfigError } from "./identity.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ID = {
  MM_IDENTITY_ISSUER: "https://api.mmlabs.online",
  TUDO_OWNER_SUB: OWNER,
};

describe("loadAuthConfig", () => {
  it("unset and explicit identity both load identity; authLabel is identity", () => {
    for (const env of [ID, { ...ID, TUDO_AUTH_MODE: "identity" }]) {
      const c = loadAuthConfig(env);
      expect(c.mode).toBe("identity");
      expect(authLabel(c)).toBe("identity");
    }
  });

  it("invalid modes throw AuthConfigError naming the variable, not the value", () => {
    for (const v of ["", "Identity", " identity", "bogus", "access"]) {
      let err: unknown;
      try {
        loadAuthConfig({ ...ID, TUDO_AUTH_MODE: v });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AuthConfigError);
      expect((err as Error).message).toContain("TUDO_AUTH_MODE");
      expect((err as Error).message).not.toContain("bogus");
      expect((err as Error).message).not.toContain("access");
    }
  });

  it("missing or malformed MM_IDENTITY_ISSUER is an IdentityConfigError", () => {
    expect(() => loadAuthConfig({})).toThrow(IdentityConfigError);
    expect(() => loadAuthConfig({ NODE_ENV: "production" })).toThrow(
      new IdentityConfigError("MM_IDENTITY_ISSUER must be set"),
    );
    expect(() => loadAuthConfig({ ...ID, MM_IDENTITY_ISSUER: "http://api.mmlabs.online" })).toThrow(
      IdentityConfigError,
    );
  });

  it("missing or blank TUDO_OWNER_SUB is 'must be set'", () => {
    for (const v of [undefined, "", "  "]) {
      expect(() => loadAuthConfig({ ...ID, TUDO_OWNER_SUB: v })).toThrow(
        new AuthConfigError("TUDO_OWNER_SUB must be set"),
      );
    }
  });

  it("malformed or nil TUDO_OWNER_SUB is 'must be a valid UUID', value not in the message", () => {
    for (const v of ["SECRETISH-not-a-uuid", "00000000-0000-0000-0000-000000000000"]) {
      let err: unknown;
      try {
        loadAuthConfig({ ...ID, TUDO_OWNER_SUB: v });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AuthConfigError);
      expect((err as Error).message).toBe("TUDO_OWNER_SUB must be a valid UUID");
      expect((err as Error).message).not.toContain(v);
    }
  });

  it("ownerSubOf: canonical id", () => {
    expect(ownerSubOf(loadAuthConfig({ ...ID, TUDO_OWNER_SUB: ` ${OWNER.toUpperCase()} ` }))).toBe(
      OWNER,
    );
  });
});
