import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, test, vi } from "vitest";
import type { AiSettingsView } from "@/shared/ai/catalog";
import {
  AiError,
  createLocalAiSettings,
  createSupabaseAiSettings,
  getAiSettingsRepo,
} from "./aiSettings";

const VIEW: AiSettingsView = {
  provider: "claude",
  model: "claude-haiku-5-5",
  keyHint: "••••CDEF",
  hasKey: true,
  modelSupported: true,
  updatedAt: "2026-11-10T00:00:00Z",
};
const API_KEY = "sk-ant-test-0123456789ABCDEF";

const make = (result: { data?: unknown; error?: unknown }) => {
  const invoke = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { invoke, repo: createSupabaseAiSettings({ functions: { invoke } } as never) };
};
const httpError = (body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status: 400 }));

describe("local repo", () => {
  test("is unavailable and every method rejects with not_available", async () => {
    const repo = createLocalAiSettings();
    expect(repo.available).toBe(false);
    for (const p of [
      repo.get(),
      repo.save({ provider: "claude", model: "m" }),
      repo.deleteKey(),
      repo.test(),
    ]) {
      await expect(p).rejects.toMatchObject({ code: "not_available" });
    }
  });

  test("getAiSettingsRepo picks local when supabase is null", () => {
    expect(getAiSettingsRepo().available).toBe(false);
  });
});

describe("supabase repo", () => {
  test("invokes tudo-ai-settings with the right body per action", async () => {
    const { invoke, repo } = make({ data: { settings: VIEW } });
    expect(repo.available).toBe(true);
    expect(await repo.get()).toEqual(VIEW);
    await repo.save({ provider: "claude", model: "claude-haiku-5-5", apiKey: API_KEY });
    await repo.save({ provider: "claude", model: "claude-haiku-5-5" });
    await repo.deleteKey();
    await repo.test();
    expect(invoke.mock.calls).toEqual([
      ["tudo-ai-settings", { body: { action: "get" } }],
      [
        "tudo-ai-settings",
        {
          body: { action: "save", provider: "claude", model: "claude-haiku-5-5", apiKey: API_KEY },
        },
      ],
      [
        "tudo-ai-settings",
        { body: { action: "save", provider: "claude", model: "claude-haiku-5-5" } },
      ],
      ["tudo-ai-settings", { body: { action: "deleteKey" } }],
      ["tudo-ai-settings", { body: { action: "test" } }],
    ]);
  });

  test("save returns the view and does not echo the api key", async () => {
    const { repo } = make({ data: { settings: VIEW } });
    const out = await repo.save({ provider: "claude", model: "claude-haiku-5-5", apiKey: API_KEY });
    expect(JSON.stringify(out)).not.toContain(API_KEY);
  });

  test("save with an empty settings answer is internal", async () => {
    const { repo } = make({ data: { settings: null } });
    await expect(repo.save({ provider: "claude", model: "m" })).rejects.toMatchObject({
      code: "internal",
    });
  });

  test("a function error with a known code becomes AiError(code)", async () => {
    const { repo } = make({ error: httpError({ error: { code: "invalid_key" } }) });
    const err = await repo.test().catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.code).toBe("invalid_key");
  });

  test("unknown code or unreadable body is internal", async () => {
    await expect(
      make({ error: httpError({ error: { code: "weird" } }) }).repo.get(),
    ).rejects.toMatchObject({
      code: "internal",
    });
    const bad = new FunctionsHttpError(new Response("not json", { status: 500 }));
    await expect(make({ error: bad }).repo.get()).rejects.toMatchObject({ code: "internal" });
  });

  test("relay or fetch errors are network", async () => {
    await expect(make({ error: new Error("Failed to fetch") }).repo.get()).rejects.toMatchObject({
      code: "network",
    });
  });
});
