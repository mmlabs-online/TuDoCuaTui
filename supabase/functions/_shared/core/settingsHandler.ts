import type { AiSettingsView } from "../ai/catalog.ts";
import type { AiServerErrorCode } from "../ai/errors.ts";
import { maskHint, keyHintOf } from "../ai/mask.ts";
import {
  isAllowedModel,
  isAllowedProvider,
  parseRequest,
  validateApiKeyFormat,
} from "../ai/validate.ts";
import { importKek, openKey, sealKey } from "./crypto.ts";
import { corsHeaders, errorResponse, json, parseOrigins, readLimitedText } from "./http.ts";
import type { TestResult } from "./providerErrors.ts";
import { checkAndRecord } from "./rateLimit.ts";
import type { AiStore, SettingsRow } from "./store.ts";

/** The only fields that may ever be logged. */
export interface LogEntry {
  action: string;
  code: AiServerErrorCode | "ok";
  providerStatus?: number;
}

export interface HandlerDeps {
  env: { kek?: string; origins?: string };
  /** Resolves the user id for a verified access token, or null. */
  getUserId(token: string): Promise<string | null>;
  store: AiStore;
  testClaude(key: string, model: string): Promise<TestResult>;
  testGemini(key: string, model: string): Promise<TestResult>;
  now(): Date;
  log(entry: LogEntry): void;
}

class Fail extends Error {
  constructor(
    readonly code: AiServerErrorCode,
    readonly providerStatus?: number,
  ) {
    super(code);
  }
}

function toView(row: SettingsRow): AiSettingsView {
  const provider = row.provider as AiSettingsView["provider"];
  return {
    provider,
    model: row.model,
    keyHint: maskHint(row.keyHint),
    hasKey: row.keyHint !== null,
    modelSupported: isAllowedProvider(provider) && isAllowedModel(provider, row.model),
    updatedAt: row.updatedAt,
  };
}

export async function handleSettingsRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const origins = parseOrigins(deps.env.origins);
  const cors = corsHeaders(req.headers.get("origin"), origins);
  let action = "unknown";
  let providerStatus: number | undefined;

  const fail = (code: AiServerErrorCode) => {
    deps.log({ action, code, ...(providerStatus === undefined ? {} : { providerStatus }) });
    return errorResponse(code, cors);
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail("method_not_allowed");

  if (!deps.env.kek || origins.length === 0) return fail("server_misconfigured");
  let kek: CryptoKey;
  try {
    kek = await importKek(deps.env.kek);
  } catch {
    return fail("server_misconfigured");
  }

  const match = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return fail("unauthorized");
  let uid: string | null = null;
  try {
    uid = await deps.getUserId(match[1]);
  } catch {
    uid = null;
  }
  if (!uid) return fail("unauthorized");

  try {
    const text = await readLimitedText(req);
    if (text === null) return fail("payload_too_large");
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fail("bad_request");
    }
    const parsed = parseRequest(body);
    if (!parsed.ok) return fail("bad_request");
    const request = parsed.request;
    action = request.action;
    const { store } = deps;

    switch (request.action) {
      case "get": {
        const row = await store.getView(uid);
        deps.log({ action, code: "ok" });
        return json(200, { settings: row ? toView(row) : null }, cors);
      }

      case "save": {
        if (!(await checkAndRecord(store, uid, "save", deps.now()))) throw new Fail("rate_limited");
        if (!isAllowedProvider(request.provider)) throw new Fail("invalid_provider");
        if (!isAllowedModel(request.provider, request.model)) throw new Fail("invalid_model");
        let newKey: string | null = null;
        if (request.apiKey !== undefined) {
          const f = validateApiKeyFormat(request.apiKey);
          if (!f.ok) throw new Fail("invalid_key_format");
          newKey = f.key;
        }
        const existing = await store.getSecret(uid);
        let write;
        if (newKey !== null) {
          write = {
            keyCiphertext: await sealKey(kek, uid, request.provider, newKey),
            keyHint: keyHintOf(newKey),
            keyUpdatedAt: deps.now().toISOString(),
          };
        } else if (existing && existing.provider !== request.provider && existing.keyCiphertext) {
          throw new Fail("key_required");
        } else {
          write = {
            keyCiphertext: existing?.keyCiphertext ?? null,
            keyHint: existing?.keyHint ?? null,
            keyUpdatedAt: existing?.keyUpdatedAt ?? null,
          };
        }
        await store.upsert(uid, { provider: request.provider, model: request.model, ...write });
        const row = await store.getView(uid);
        deps.log({ action, code: "ok" });
        return json(200, { settings: row ? toView(row) : null }, cors);
      }

      case "deleteKey": {
        await store.clearKey(uid);
        const row = await store.getView(uid);
        deps.log({ action, code: "ok" });
        return json(200, { settings: row ? toView(row) : null }, cors);
      }

      case "test": {
        if (!(await checkAndRecord(store, uid, "test", deps.now()))) throw new Fail("rate_limited");
        const secret = await store.getSecret(uid);
        if (!secret || !secret.keyCiphertext) throw new Fail("not_configured");
        if (!isAllowedProvider(secret.provider) || !isAllowedModel(secret.provider, secret.model)) {
          throw new Fail("invalid_model");
        }
        let key: string;
        try {
          key = await openKey(kek, uid, secret.provider, secret.keyCiphertext);
        } catch {
          throw new Fail("key_unreadable");
        }
        const result =
          secret.provider === "claude"
            ? await deps.testClaude(key, secret.model)
            : await deps.testGemini(key, secret.model);
        if (!result.ok) throw new Fail(result.code, result.status);
        deps.log({ action, code: "ok" });
        return json(200, { ok: true }, cors);
      }
    }
  } catch (e) {
    if (e instanceof Fail) {
      providerStatus = e.providerStatus;
      return fail(e.code);
    }
    return fail("internal");
  }
}
