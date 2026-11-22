// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkOpenAiKey, OPENAI_MODELS_URL } from "./openai.js";

describe("checkOpenAiKey", () => {
  it("200 -> ok: true, sends Authorization Bearer header to pinned host", async () => {
    let calledUrl = "";
    let calledHeaders: Record<string, string> = {};
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      calledUrl = url;
      calledHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response("{}", { status: 200 });
    });

    const res = await checkOpenAiKey({
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      key: "sk-test-openai-key-0123456789",
    });

    expect(res).toEqual({ ok: true });
    expect(calledUrl).toBe(OPENAI_MODELS_URL);
    expect(calledHeaders["Authorization"]).toBe("Bearer sk-test-openai-key-0123456789");
  });

  it("401 -> invalid_key", async () => {
    const mockFetch = vi.fn(async () => new Response("{}", { status: 401 }));
    const res = await checkOpenAiKey({
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      key: "sk-test-bad",
    });
    expect(res).toEqual({ ok: false, code: "invalid_key" });
  });

  it("429 -> provider_rate_limited", async () => {
    const mockFetch = vi.fn(async () => new Response("{}", { status: 429 }));
    const res = await checkOpenAiKey({
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      key: "sk-test-ratelimited",
    });
    expect(res).toEqual({ ok: false, code: "provider_rate_limited" });
  });

  it("500 / 503 -> provider_unavailable", async () => {
    const mockFetch = vi.fn(async () => new Response("{}", { status: 500 }));
    const res = await checkOpenAiKey({
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      key: "sk-test-error",
    });
    expect(res).toEqual({ ok: false, code: "provider_unavailable" });
  });

  it("network throw / timeout -> provider_unavailable", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const res = await checkOpenAiKey({
      fetch: mockFetch as unknown as typeof globalThis.fetch,
      key: "sk-test-throw",
    });
    expect(res).toEqual({ ok: false, code: "provider_unavailable" });
  });
});
