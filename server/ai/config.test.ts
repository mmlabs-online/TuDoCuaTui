// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AiConfigError, initAi, loadAiConfig } from "./config.js";

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

describe("initAi", () => {
  const kek = {} as never;
  const deps = (requestAuth: boolean) => ({ requestAuth, importKek: vi.fn(async () => kek) });

  it("valid + request auth on -> configured", async () => {
    const d = deps(true);
    const env: Record<string, string | undefined> = { AI_KEK: valid };
    expect(await initAi(env, d)).toEqual({ ai: { kek }, line: "ai configured" });
    expect(d.importKek).toHaveBeenCalledWith(valid);
    expect("AI_KEK" in env).toBe(false);
  });

  it("valid + request auth off -> disabled, no import", async () => {
    const d = deps(false);
    const env: Record<string, string | undefined> = { AI_KEK: valid };
    expect(await initAi(env, d)).toEqual({ ai: null, line: "ai disabled: request auth off" });
    expect(d.importKek).not.toHaveBeenCalled();
    expect("AI_KEK" in env).toBe(false);
  });

  it("unset or empty -> not configured, no import", async () => {
    for (const env of [{}, { AI_KEK: "" }] as Record<string, string | undefined>[]) {
      const d = deps(true);
      expect(await initAi(env, d)).toEqual({ ai: null, line: "ai not configured" });
      expect(d.importKek).not.toHaveBeenCalled();
      expect("AI_KEK" in env).toBe(false);
    }
  });

  it("malformed throws AiConfigError even with request auth off, and AI_KEK is removed", async () => {
    for (const requestAuth of [true, false]) {
      const env: Record<string, string | undefined> = { AI_KEK: "not-a-kek" };
      await expect(initAi(env, deps(requestAuth))).rejects.toBeInstanceOf(AiConfigError);
      expect("AI_KEK" in env).toBe(false);
    }
  });
});
