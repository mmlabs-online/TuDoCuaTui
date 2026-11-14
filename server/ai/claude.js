// @ts-check
// Claude key check: GET /v1/models/{id} (no tokens spent). A pure adapter: no store, KEK, user or logging.
// The key goes only into the x-api-key header of a request to the pinned host. Only the status is read.
import { mapClaudeError } from "./providerErrors.js";
import { buildTagSchema, TAG_INSTRUCTION } from "./tagging.js";

export const CLAUDE_MODELS_URL = "https://api.anthropic.com/v1/models/";

/**
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, timeoutMs?: number }} p
 * @returns {Promise<{ ok: true } | { ok: false, code: ReturnType<typeof mapClaudeError> }>}
 */
export async function checkClaudeKey({ fetch, key, model, timeoutMs = 10_000 }) {
  /** @type {Response | undefined} */
  let res;
  try {
    res = await fetch(CLAUDE_MODELS_URL + encodeURIComponent(model), {
      method: "GET",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? { ok: true } : { ok: false, code: mapClaudeError(res.status) };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    await res?.body?.cancel().catch(() => {});
  }
}

export const CLAUDE_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const TAG_TOOL_NAME = "tag_item";
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Reads at most MAX_RESPONSE_BYTES of the body and parses it; null when over the cap or not JSON.
 * @param {Response} res
 * @returns {Promise<unknown>}
 */
async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return null;
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Tags a JPEG with forced tool use. Returns the raw (unsanitized) tool input; parseTagSuggestion validates it.
 * The key goes only in x-api-key to the pinned host. No retries, no logging, response text never returned.
 * @param {{ fetch: typeof globalThis.fetch, key: string, model: string, image: Buffer, signal?: AbortSignal, timeoutMs?: number }} p
 * @returns {Promise<{ ok: true, input: Record<string, unknown> } | { ok: false, code: ReturnType<typeof mapClaudeError> | "provider_bad_response" }>}
 */
export async function tagPhotoWithClaude({ fetch, key, model, image, signal, timeoutMs = 45_000 }) {
  /** @type {Response | undefined} */
  let res;
  try {
    res = await fetch(CLAUDE_MESSAGES_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        tools: [
          {
            name: TAG_TOOL_NAME,
            description: "Record the clothing item seen in the photo.",
            input_schema: buildTagSchema(),
          },
        ],
        tool_choice: { type: "tool", name: TAG_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: image.toString("base64"),
                },
              },
              { type: "text", text: TAG_INSTRUCTION },
            ],
          },
        ],
      }),
      redirect: "error",
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
    });
    if (!res.ok) return { ok: false, code: mapClaudeError(res.status) };
    const data = /** @type {any} */ (await readCapped(res));
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const uses = blocks.filter((/** @type {any} */ b) => b?.type === "tool_use");
    const [use] = uses;
    const input = use?.input;
    if (
      data?.stop_reason !== "tool_use" ||
      blocks.length !== 1 ||
      use?.name !== TAG_TOOL_NAME ||
      typeof input !== "object" ||
      input === null ||
      Array.isArray(input)
    ) {
      return { ok: false, code: "provider_bad_response" };
    }
    return { ok: true, input };
  } catch {
    return { ok: false, code: "provider_unavailable" };
  } finally {
    await res?.body?.cancel().catch(() => {});
  }
}
