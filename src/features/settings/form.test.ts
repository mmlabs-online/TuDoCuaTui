import { describe, expect, it } from "vitest";

import type { AiSettingsView } from "@/shared/ai/catalog";
import {
  canSave,
  canTest,
  initialForm,
  keyError,
  modelsFor,
  nextModelOnProviderChange,
} from "./form";

const view = (o: Partial<AiSettingsView> = {}): AiSettingsView => ({
  provider: "claude",
  model: "claude-sonnet-5-5",
  keyHint: "••••wxyz",
  hasKey: true,
  modelSupported: true,
  updatedAt: "x",
  ...o,
});
const KEY = "sk-ant-" + "a".repeat(20);

describe("models", () => {
  it("lists the allowlist per provider", () => {
    expect(modelsFor("claude")).toHaveLength(3);
    expect(modelsFor("gemini")).toEqual([]);
  });
  it("keeps an allowed model, else the default (empty for Gemini)", () => {
    expect(nextModelOnProviderChange("claude", "claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(nextModelOnProviderChange("claude", "other")).toBe("claude-haiku-5-5");
    expect(nextModelOnProviderChange("gemini", "claude-opus-5-5")).toBe("");
  });
});

describe("initialForm", () => {
  it("defaults to Claude and its default model", () => {
    expect(initialForm(null)).toEqual({ provider: "claude", model: "claude-haiku-5-5", key: "" });
  });
  it("keeps saved values, or the default when the model is unsupported", () => {
    expect(initialForm(view()).model).toBe("claude-sonnet-5-5");
    expect(initialForm(view({ modelSupported: false })).model).toBe("claude-haiku-5-5");
  });
});

describe("keyError", () => {
  it("accepts empty and a trimmed valid key", () => {
    expect(keyError("")).toBeNull();
    expect(keyError(`  ${KEY}  `)).toBeNull();
  });
  it("rejects short, spaced and non-ASCII keys", () => {
    expect(keyError("a".repeat(19))).toBe("invalid_key_format");
    expect(keyError("a".repeat(10) + " " + "b".repeat(10))).toBe("invalid_key_format");
    expect(keyError("khóa" + "a".repeat(20))).toBe("invalid_key_format");
  });
});

describe("canSave", () => {
  const base = { provider: "claude" as const, model: "claude-sonnet-5-5", key: "" };
  it("is false when nothing changed", () => {
    expect(canSave(base, view())).toBe(false);
  });
  it("is true for a changed model or a valid new key", () => {
    expect(canSave({ ...base, model: "claude-opus-5-5" }, view())).toBe(true);
    expect(canSave({ ...base, key: KEY }, view())).toBe(true);
    expect(canSave({ ...base, key: KEY }, null)).toBe(true);
  });
  it("is false without a model, with a disallowed model or a malformed key", () => {
    expect(canSave({ ...base, model: "" }, view())).toBe(false);
    expect(canSave({ ...base, model: "nope", key: KEY }, view())).toBe(false);
    expect(canSave({ ...base, key: "short" }, view())).toBe(false);
  });
  it("is false for Gemini (no models)", () => {
    expect(canSave({ provider: "gemini", model: "", key: KEY }, view())).toBe(false);
  });
  it("is false when the provider changed while a key is saved and no key is typed", () => {
    expect(canSave({ provider: "gemini", model: "x", key: "" }, view({ provider: "claude" }))).toBe(
      false,
    );
    const savedGemini = view({ provider: "gemini", model: "g", modelSupported: false });
    expect(canSave({ ...base, key: "" }, savedGemini)).toBe(false);
    expect(canSave({ ...base, key: KEY }, savedGemini)).toBe(true);
  });
});

describe("canTest", () => {
  const form = { provider: "claude" as const, model: "claude-sonnet-5-5", key: "" };
  it("needs a saved key and a clean form", () => {
    expect(canTest(form, view())).toBe(true);
    expect(canTest(form, view({ hasKey: false }))).toBe(false);
    expect(canTest(form, null)).toBe(false);
    expect(canTest({ ...form, key: KEY }, view())).toBe(false);
    expect(canTest({ ...form, model: "claude-opus-5-5" }, view())).toBe(false);
  });
});
