// Source of truth: src/shared/ai; mirrored by server/ai/*.js; server/ai/parity.test.ts enforces equality.

import { AI_MODELS, AI_PROVIDERS, type AiProvider } from "./catalog.ts";

export const MAX_BODY_BYTES = 4096;

export function isAllowedProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

/** Exact match only: no trimming, no case folding. */
export function isAllowedModel(provider: AiProvider, model: unknown): boolean {
  return typeof model === "string" && AI_MODELS[provider].some((m) => m.id === model);
}

export type KeyFormat = { ok: true; key: string } | { ok: false };

/** Trimmed, 20-256 printable ASCII characters, no inner whitespace. */
export function validateApiKeyFormat(raw: unknown): KeyFormat {
  if (typeof raw !== "string") return { ok: false };
  const key = raw.trim();
  if (!/^[!-~]{20,256}$/.test(key)) return { ok: false };
  return { ok: true, key };
}

export type AiRequest =
  | { action: "get" }
  | { action: "deleteKey" }
  | { action: "test" }
  | { action: "save"; provider: string; model: string; apiKey?: string };

export type ParsedRequest = { ok: true; request: AiRequest } | { ok: false; code: "bad_request" };

const BAD: ParsedRequest = { ok: false, code: "bad_request" };

function onlyKeys(obj: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(obj).every((k) => allowed.includes(k));
}

/** Shape check only; provider/model/key values are validated by the handler. Unknown fields are rejected. */
export function parseRequest(body: unknown): ParsedRequest {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return BAD;
  const b = body as Record<string, unknown>;
  switch (b.action) {
    case "get":
    case "deleteKey":
    case "test":
      return onlyKeys(b, ["action"]) ? { ok: true, request: { action: b.action } } : BAD;
    case "save": {
      if (!onlyKeys(b, ["action", "provider", "model", "apiKey"])) return BAD;
      if (typeof b.provider !== "string" || typeof b.model !== "string") return BAD;
      if (b.apiKey !== undefined && typeof b.apiKey !== "string") return BAD;
      const request: AiRequest = { action: "save", provider: b.provider, model: b.model };
      if (b.apiKey !== undefined) request.apiKey = b.apiKey;
      return { ok: true, request };
    }
    default:
      return BAD;
  }
}
