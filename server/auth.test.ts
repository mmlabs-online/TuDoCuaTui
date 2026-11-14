// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AccessConfigError } from "./access.js";
import { AuthConfigError, authLabel, loadAuthConfig, requestAuth } from "./auth.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ACCESS = {
  CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud",
  TUDO_OWNER_SUB: OWNER,
};
const ID = { TUDO_AUTH_MODE: "identity", MM_IDENTITY_ISSUER: "https://api.mmlabs.online" };

describe("loadAuthConfig", () => {
  it("unset and explicit access both load the access config", () => {
    for (const env of [ACCESS, { ...ACCESS, TUDO_AUTH_MODE: "access" }]) {
      const c = loadAuthConfig(env);
      expect(c.mode).toBe("access");
      expect(authLabel(c)).toBe("access");
    }
  });

  it("identity needs only the issuer; CF_ACCESS_* are ignored", () => {
    expect(loadAuthConfig(ID).mode).toBe("identity");
    expect(loadAuthConfig({ ...ID, ...ACCESS, CF_ACCESS_AUD: "bad aud" }).mode).toBe("identity");
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
