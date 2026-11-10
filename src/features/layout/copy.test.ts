import { describe, expect, it } from "vitest";

import { LAYOUT_COPY } from "@/features/layout/copy";

describe("LAYOUT_COPY", () => {
  it("version label", () => {
    expect(LAYOUT_COPY.version("v0.1.1")).toBe("Phiên bản v0.1.1");
    expect(LAYOUT_COPY.version("dev")).toBe("Phiên bản dev");
  });
});
