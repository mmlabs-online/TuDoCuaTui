import { describe, expect, it } from "vitest";

import { APP_VERSION, appVersion } from "@/lib/version";

describe("appVersion", () => {
  it("returns the tag for vX.Y.Z", () => {
    expect(appVersion("v0.1.1")).toBe("v0.1.1");
    expect(appVersion("v10.20.30")).toBe("v10.20.30");
  });

  it('returns "dev" when unset or empty', () => {
    expect(appVersion(undefined)).toBe("dev");
    expect(appVersion("")).toBe("dev");
  });

  it('returns "dev" for anything that is not vX.Y.Z', () => {
    for (const raw of ["0.1.1", "v0.1", "v0.1.1-rc.1", " v0.1.1", "v0.1.1\nx", "abc123"]) {
      expect(appVersion(raw)).toBe("dev");
    }
  });

  it('APP_VERSION is "dev" in tests', () => {
    expect(APP_VERSION).toBe("dev");
  });
});
