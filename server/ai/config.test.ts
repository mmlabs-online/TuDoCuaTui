// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AiConfigError, loadAiConfig } from "./config.js";

const valid = randomBytes(32).toString("base64");

describe("loadAiConfig", () => {
  it("unset or empty is off, a valid value is on", () => {
    expect(loadAiConfig({})).toEqual({ mode: "off" });
    expect(loadAiConfig({ AI_KEK: "" })).toEqual({ mode: "off" });
    expect(loadAiConfig({ AI_KEK: valid })).toEqual({ mode: "on", kekB64: valid });
  });

  it("malformed values throw naming AI_KEK, never the value", () => {
    const bad = [
      valid.slice(0, 43),
      randomBytes(33).toString("base64"),
      randomBytes(31).toString("base64"),
      valid.slice(0, 10) + " " + valid.slice(11),
      "-_" + valid.slice(2),
    ];
    for (const v of bad) {
      let msg = "";
      try {
        loadAiConfig({ AI_KEK: v });
      } catch (e) {
        expect(e).toBeInstanceOf(AiConfigError);
        msg = (e as Error).message;
      }
      expect(msg).toContain("AI_KEK");
      expect(msg).not.toContain(v);
    }
  });
});
