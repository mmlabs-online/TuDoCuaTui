import type { AiSettingsView } from "@/shared/ai/catalog";
import { isServerErrorCode, type AiErrorCode } from "@/shared/ai/errors";

type FetchFn = typeof fetch;

export class AiSettingsError extends Error {
  constructor(
    public status: number,
    public code: AiErrorCode,
    public requestId?: string,
  ) {
    super(code);
    this.name = "AiSettingsError";
  }
}

export interface AiSaveInput {
  provider: string;
  model: string;
  apiKey?: string;
}

export interface AiSettingsClient {
  get(): Promise<AiSettingsView | null>;
  save(input: AiSaveInput): Promise<AiSettingsView>;
  deleteKey(): Promise<AiSettingsView | null>;
  test(): Promise<void>;
}

/** AI settings through the Node API (`/api/ai-settings`). The key is only ever in the PUT body. */
export function createHttpAiSettings(
  fetchFn: FetchFn = (...a) => fetch(...a),
  base = "/api",
): AiSettingsClient {
  const call = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    let res: Response;
    try {
      res = await fetchFn(`${base}/ai-settings${path}`, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
      });
    } catch {
      throw new AiSettingsError(0, "network");
    }
    if (res.type === "opaqueredirect") throw new AiSettingsError(401, "unauthorized");
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new AiSettingsError(res.status, "internal");
    }
    if (!res.ok) {
      const e = (json as { error?: { code?: unknown; requestId?: unknown } } | null)?.error;
      const requestId = typeof e?.requestId === "string" ? e.requestId : undefined;
      throw new AiSettingsError(
        res.status,
        isServerErrorCode(e?.code) ? e.code : "internal",
        requestId,
      );
    }
    return json;
  };
  const settingsOf = (json: unknown): AiSettingsView | null => {
    if (typeof json !== "object" || json === null || !("settings" in json)) {
      throw new AiSettingsError(200, "internal");
    }
    return (json as { settings: AiSettingsView | null }).settings;
  };

  return {
    get: async () => settingsOf(await call("GET", "")),
    save: async ({ provider, model, apiKey }) => {
      const s = settingsOf(
        await call("PUT", "", { provider, model, ...(apiKey ? { apiKey } : {}) }),
      );
      if (!s) throw new AiSettingsError(200, "internal");
      return s;
    },
    deleteKey: async () => settingsOf(await call("DELETE", "/key")),
    test: async () => {
      const json = await call("POST", "/test", {});
      if ((json as { ok?: unknown } | null)?.ok !== true)
        throw new AiSettingsError(200, "internal");
    },
  };
}

const unavailable = () => Promise.reject(new AiSettingsError(0, "not_available"));

/** Local mode: AI needs the server, so every call fails with `not_available`. */
export const localAiSettings: AiSettingsClient = {
  get: unavailable,
  save: unavailable,
  deleteKey: unavailable,
  test: unavailable,
};

export const httpAiSettings = createHttpAiSettings();
