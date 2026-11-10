import { describe, expect, it } from "vitest";
import { isAllowedModel, isAllowedProvider, parseRequest, validateApiKeyFormat } from "./validate";

const KEY = "sk-test-0123456789abcdefWXYZ";

describe("provider and model allowlist", () => {
  it("accepts the known providers only", () => {
    expect(isAllowedProvider("claude")).toBe(true);
    expect(isAllowedProvider("gemini")).toBe(true);
    expect(isAllowedProvider("openai")).toBe(false);
    expect(isAllowedProvider("Claude")).toBe(false);
    expect(isAllowedProvider(" claude")).toBe(false);
    expect(isAllowedProvider(undefined)).toBe(false);
  });

  it("accepts a valid pair", () => {
    expect(isAllowedModel("claude", "claude-haiku-5-5")).toBe(true);
  });

  it("rejects unknown, other-provider, case and whitespace variants", () => {
    expect(isAllowedModel("claude", "claude-unknown")).toBe(false);
    expect(isAllowedModel("claude", "gemini-flash")).toBe(false);
    expect(isAllowedModel("claude", "Claude-Haiku-5-5")).toBe(false);
    expect(isAllowedModel("claude", " claude-haiku-5-5")).toBe(false);
    expect(isAllowedModel("claude", 5)).toBe(false);
  });

  it("a provider with zero models accepts no model", () => {
    expect(isAllowedModel("gemini", "gemini-anything")).toBe(false);
    expect(isAllowedModel("gemini", "")).toBe(false);
  });
});

describe("validateApiKeyFormat", () => {
  it("trims and accepts a valid key", () => {
    expect(validateApiKeyFormat(`  ${KEY}\n`)).toEqual({ ok: true, key: KEY });
  });

  it("rejects short, long, inner whitespace, non-ASCII and non-strings", () => {
    expect(validateApiKeyFormat("a".repeat(19)).ok).toBe(false);
    expect(validateApiKeyFormat("a".repeat(20)).ok).toBe(true);
    expect(validateApiKeyFormat("a".repeat(256)).ok).toBe(true);
    expect(validateApiKeyFormat("a".repeat(257)).ok).toBe(false);
    expect(validateApiKeyFormat("aaaaaaaaaa aaaaaaaaaa").ok).toBe(false);
    expect(validateApiKeyFormat("aaaaaaaaaaaaaaaaaaaaé").ok).toBe(false);
    expect(validateApiKeyFormat(123).ok).toBe(false);
  });
});

describe("parseRequest", () => {
  it("accepts each action's exact field set", () => {
    expect(parseRequest({ action: "get" })).toEqual({ ok: true, request: { action: "get" } });
    expect(parseRequest({ action: "deleteKey" }).ok).toBe(true);
    expect(parseRequest({ action: "test" }).ok).toBe(true);
    expect(parseRequest({ action: "save", provider: "claude", model: "m" })).toEqual({
      ok: true,
      request: { action: "save", provider: "claude", model: "m" },
    });
    expect(parseRequest({ action: "save", provider: "claude", model: "m", apiKey: KEY }).ok).toBe(
      true,
    );
  });

  it("rejects unknown fields, including user_id", () => {
    expect(parseRequest({ action: "get", user_id: "x" })).toEqual({
      ok: false,
      code: "bad_request",
    });
    expect(parseRequest({ action: "save", provider: "claude", model: "m", user_id: "x" }).ok).toBe(
      false,
    );
    expect(parseRequest({ action: "test", extra: 1 }).ok).toBe(false);
  });

  it("rejects bad shapes", () => {
    for (const body of [null, "x", 5, [], {}, { action: "nope" }, { action: 1 }]) {
      expect(parseRequest(body).ok).toBe(false);
    }
    expect(parseRequest({ action: "save", provider: 1, model: "m" }).ok).toBe(false);
    expect(parseRequest({ action: "save", provider: "claude" }).ok).toBe(false);
    expect(parseRequest({ action: "save", provider: "claude", model: "m", apiKey: 5 }).ok).toBe(
      false,
    );
  });
});
