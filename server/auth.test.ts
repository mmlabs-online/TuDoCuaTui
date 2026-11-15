// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AccessConfigError } from "./access.js";
import { AuthConfigError, authLabel, loadAuthConfig, ownerSubOf, requestAuth } from "./auth.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ACCESS = {
  CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud",
  TUDO_OWNER_SUB: OWNER,
};
const ID = {
  TUDO_AUTH_MODE: "identity",
  MM_IDENTITY_ISSUER: "https://api.mmlabs.online",
  TUDO_OWNER_SUB: OWNER,
};

describe("loadAuthConfig", () => {
  it("unset and explicit access both load the access config", () => {
    for (const env of [ACCESS, { ...ACCESS, TUDO_AUTH_MODE: "access" }]) {
      const c = loadAuthConfig(env);
      expect(c.mode).toBe("access");
      expect(authLabel(c)).toBe("access");
    }
  });

  it("identity needs the issuer and the owner; CF_ACCESS_* are ignored", () => {
    expect(loadAuthConfig(ID).mode).toBe("identity");
    expect(loadAuthConfig({ ...ID, ...ACCESS, CF_ACCESS_AUD: "bad aud" }).mode).toBe("identity");
  });

  it("identity: missing or blank TUDO_OWNER_SUB is 'must be set'", () => {
    for (const v of [undefined, "", "  "]) {
      expect(() => loadAuthConfig({ ...ID, TUDO_OWNER_SUB: v })).toThrow(
        new AuthConfigError("TUDO_OWNER_SUB must be set"),
      );
    }
  });

  it("identity: malformed or nil TUDO_OWNER_SUB is 'must be a valid UUID', value not in the message", () => {
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

  it("ownerSubOf: canonical id in identity mode, access.ownerSub in access mode", () => {
    expect(ownerSubOf(loadAuthConfig({ ...ID, TUDO_OWNER_SUB: ` ${OWNER.toUpperCase()} ` }))).toBe(
      OWNER,
    );
    expect(ownerSubOf(loadAuthConfig(ACCESS))).toBe(OWNER);
  });

  it("invalid modes throw AuthConfigError naming the variable, not the value", () => {
    for (const v of ["", "Identity", " identity", "bogus"]) {
      let err: unknown;
      try {
        loadAuthConfig({ ...ID, TUDO_AUTH_MODE: v });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AuthConfigError);
      expect((err as Error).message).toContain("TUDO_AUTH_MODE");
      if (v === "bogus") expect((err as Error).message).not.toContain(v);
    }
  });

  it("identity with TUDO_ACCESS_DISABLED=1 is an error", () => {
    expect(() => loadAuthConfig({ ...ID, TUDO_ACCESS_DISABLED: "1" })).toThrow(AuthConfigError);
  });

  it("access-mode errors are unchanged", () => {
    expect(() => loadAuthConfig({ NODE_ENV: "production" })).toThrow(AccessConfigError);
    expect(() => loadAuthConfig({ ...ID, TUDO_AUTH_MODE: "access" })).toThrow(AccessConfigError);
  });
});

describe("requestAuth / authLabel", () => {
  it("true for access on and identity, false for access dev-off", () => {
    expect(requestAuth(loadAuthConfig(ACCESS))).toBe(true);
    expect(requestAuth(loadAuthConfig(ID))).toBe(true);
    const off = loadAuthConfig({ TUDO_ACCESS_DISABLED: "1", TUDO_OWNER_SUB: OWNER });
    expect(requestAuth(off)).toBe(false);
    expect(authLabel(off)).toBe("access");
    expect(authLabel(loadAuthConfig(ID))).toBe("identity");
  });
});
