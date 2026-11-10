import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AiProvider, AiSettingsView } from "@/shared/ai/catalog";
import { isServerErrorCode, type AiErrorCode } from "@/shared/ai/errors";

export type { AiSettingsView };

export class AiError extends Error {
  constructor(public code: AiErrorCode) {
    super(code);
  }
}

export interface AiSettingsRepo {
  /** false in local mode: AI exists in Supabase mode only. */
  available: boolean;
  get(): Promise<AiSettingsView | null>;
  save(input: { provider: AiProvider; model: string; apiKey?: string }): Promise<AiSettingsView>;
  deleteKey(): Promise<AiSettingsView | null>;
  test(): Promise<void>;
}

const FUNCTION_NAME = "tudo-ai-settings";

async function errorOf(error: unknown): Promise<AiError> {
  const context = (error as { context?: unknown } | null)?.context;
  if ((error as { name?: string } | null)?.name === "FunctionsHttpError" && context) {
    try {
      const body = (await (context as Response).json()) as { error?: { code?: unknown } };
      const code = body?.error?.code;
      return new AiError(isServerErrorCode(code) ? code : "internal");
    } catch {
      return new AiError("internal");
    }
  }
  return new AiError("network");
}

export function createSupabaseAiSettings(sb: Pick<SupabaseClient, "functions">): AiSettingsRepo {
  async function call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.functions.invoke(FUNCTION_NAME, { body });
    if (error) throw await errorOf(error);
    return data as T;
  }
  return {
    available: true,
    async get() {
      return (await call<{ settings: AiSettingsView | null }>({ action: "get" })).settings;
    },
    async save({ provider, model, apiKey }) {
      const { settings } = await call<{ settings: AiSettingsView | null }>({
        action: "save",
        provider,
        model,
        ...(apiKey === undefined ? {} : { apiKey }),
      });
      if (!settings) throw new AiError("internal");
      return settings;
    },
    async deleteKey() {
      return (await call<{ settings: AiSettingsView | null }>({ action: "deleteKey" })).settings;
    },
    async test() {
      await call({ action: "test" });
    },
  };
}

export function createLocalAiSettings(): AiSettingsRepo {
  const unavailable = () => Promise.reject(new AiError("not_available"));
  return {
    available: false,
    get: unavailable,
    save: unavailable,
    deleteKey: unavailable,
    test: unavailable,
  };
}

export function getAiSettingsRepo(): AiSettingsRepo {
  return supabase ? createSupabaseAiSettings(supabase) : createLocalAiSettings();
}
