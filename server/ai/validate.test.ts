// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSettingsBody } from "./validate.js";

describe("parseSettingsBody", () => {
  it("accepts {provider, model} with or without apiKey", () => {
    expect(parseSettingsBody({ provider: "claude", model: "m" })).toEqual({
      ok: true,
      value: { provider: "claude", model: "m" },
    });
    expect(parseSettingsBody({ provider: "claude", model: "m", apiKey: "k" })).toEqual({
      ok: true,
      value: { provider: "claude", model: "m", apiKey: "k" },
    });
  });

  it("rejects extra keys, non-objects and mistyped fields", () => {
    const bad = [
      { provider: "claude", model: "m", x: 1 },
      "s",
      [],
      null,
      5,
      { provider: 1, model: "m" },
      { provider: "claude", model: 1 },
      { provider: "claude", model: "m", apiKey: 5 },
      { model: "m" },
    ];
    for (const b of bad) expect(parseSettingsBody(b)).toEqual({ ok: false, code: "bad_request" });
  });
});
