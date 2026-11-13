// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSettingsBody, parseTestBody } from "./validate.js";

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

describe("parseTestBody", () => {
  it("accepts only {}", () => {
    expect(parseTestBody({})).toEqual({ ok: true });
  });

  it("rejects any field, arrays and non-objects", () => {
    const withProto = JSON.parse('{"__proto__":1}');
    const bare = Object.assign(Object.create(null), { a: 1 });
    const bad = [{ apiKey: "x" }, { x: 1 }, [], null, "{}", 0, bare, withProto];
    for (const b of bad) expect(parseTestBody(b)).toEqual({ ok: false, code: "bad_request" });
  });
});
